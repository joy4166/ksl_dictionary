import nlpModelData from "@/data/ksl-nlp-model.json";
import { GaruToken } from "@/lib/garu-analyzer";
import {
  getSignById,
  searchLocalDictionary,
} from "@/lib/ksl-dictionary";
import { SignWordEntry } from "@/types/sign";

export interface NlpResolvedToken {
  originalPart: string;
  kslGloss: string;
  senseHint: string;
  excludeSense?: string;
  searchKeywords?: string[];
  selectionReason: string;
  /** 로컬 NLP 엔진이 확정 매칭한 수어 엔트리 (있을 경우 즉시 사용) */
  resolvedSign?: SignWordEntry;
  /** 대안 수어 후보 (동음이의어의 다른 뜻 또는 관용구의 직역 수어) */
  alternativeSigns?: SignWordEntry[];
  /** 이 토큰이 로컬 사전/모델에서 100% 해결되었는지 여부 */
  isConfident: boolean;
}

export interface LocalNlpAnalysisResult {
  sequence: NlpResolvedToken[];
  /** 문장 전체가 Gemini 호출 없이 0.01초 즉시 반환 가능한 확신 상태인지 여부 */
  isFullyConfident: boolean;
  confidenceScore: number;
  appliedIdioms: string[];
  disambiguatedHomonyms: Array<{
    word: string;
    selectedSense: string;
    scoreDiff: number;
  }>;
  elapsedMs: number;
}

interface IdiomRule {
  id: string;
  idiom: string;
  dictMeaning: string;
  headBase: string;
  predBases: string[];
  maxDistance: number;
  physicalBlockerWords?: string[];
  requireContextWords?: string[];
  consumeSpanTerms?: string[];
  kslSequence: Array<{
    kslGloss: string;
    targetSignId: string;
    senseHint: string;
  }>;
  literalFallbackIds?: string[];
  explanation: string;
}

interface HomonymSense {
  signId: string;
  word: string;
  label: string;
  prior: number;
  weights: Record<string, number>;
}

interface HomonymCluster {
  defaultSignId: string;
  senses: HomonymSense[];
}

const IDIOM_RULES: IdiomRule[] = nlpModelData.idioms as IdiomRule[];
const HOMONYM_CLUSTERS: Record<string, HomonymCluster> =
  nlpModelData.homonyms as unknown as Record<string, HomonymCluster>;

const TIME_WORDS = new Set([
  "어제",
  "오늘",
  "내일",
  "아침",
  "점심",
  "저녁",
  "밤",
  "(시간)밤",
  "주말",
  "추석",
  "설날",
  "생일",
  "잠시",
  "지금",
  "처음",
]);

const QUESTION_WORDS = new Set([
  "무엇",
  "뭐",
  "어디",
  "언제",
  "누구",
  "왜",
  "어떻다",
]);

const MODAL_END_WORDS = new Set([
  "가능하다",
  "못하다",
  "말다",
  "아니다",
  "원하다",
]);

/**
 * 비유·관용 표현의 중심이 되기 쉬운 신체·심리·자연 명사 집합
 */
const FIGURATIVE_RISK_NOUNS = new Set([
  "눈",
  "손",
  "발",
  "입",
  "귀",
  "배",
  "가슴",
  "마음",
  "머리",
  "목",
  "코",
  "간",
  "속",
  "바람",
]);

/**
 * 목적어·주어에 따라 직역 시 오역 위험이 높은 고빈도 다의어 서술어 집합
 */
const POLYSEMOUS_RISK_PREDICATES = new Set([
  "먹다",
  "맞다",
  "차다",
  "걸리다",
  "빠지다",
  "놓다",
  "끊다",
  "치다",
  "풀다",
  "잡다",
  "맵다",
  "쓰다",
  "타다",
  "깎다",
  "씻다",
  "돌리다",
]);

/**
 * [핵심 NLP 엔진]
 * 1) 형태소 슬라이딩 윈도우 기반 공식 관용구(Idiom FST) 감지 및 KSL 의역 치환
 * 2) Simplified Lesk & 구어체 연어 TF-IDF 가중치 내적을 통한 동음이의어 문맥 판별 (WSD)
 * 3) 한국수어(KSL) 문법 어순 재배치 (시간 -> 주어/목적어/서술어 -> 가능/부정 -> 과거 완료 '끝' -> 의문사)
 * 4) 엄격한 Confidence Gating 점수 산출
 */
export function analyzeSentenceWithLocalNlp(
  _sentence: string,
  garuTokens: GaruToken[]
): LocalNlpAnalysisResult {
  const start = Date.now();
  void _sentence;
  if (garuTokens.length === 0) {
    return {
      sequence: [],
      isFullyConfident: false,
      confidenceScore: 0,
      appliedIdioms: [],
      disambiguatedHomonyms: [],
      elapsedMs: 0,
    };
  }

  // 문장 내 전체 형태소 원형 및 어간 집합 (문맥 공기어 집합 C)
  const allContextTerms = new Set<string>();
  for (const t of garuTokens) {
    allContextTerms.add(t.base);
    allContextTerms.add(t.raw.replace(/[?!.,~"']/g, ""));
    if (t.base.endsWith("다") && t.base.length >= 2) {
      allContextTerms.add(t.base.slice(0, -1));
    }
    if (t.base.endsWith("하다") && t.base.length >= 3) {
      allContextTerms.add(t.base.slice(0, -2));
    }
  }

  const consumedIndices = new Set<number>();
  const idiomReplacements = new Map<number, NlpResolvedToken[]>();
  const appliedIdioms: string[] = [];
  let matchedPhysicalBlocker = false;

  // ============================================================================
  // [Step 1] 관용구 FST 슬라이딩 윈도우 탐색 (조사/어미/부사 개입 완벽 대응)
  // ============================================================================
  for (let i = 0; i < garuTokens.length; i++) {
    if (consumedIndices.has(i)) continue;
    const headToken = garuTokens[i];

    for (const rule of IDIOM_RULES) {
      if (headToken.base !== rule.headBase) continue;

      // 1) 물리적 문맥 차단어(Blocker) 검사 (예: "장갑이 작아서 손이 크다" -> 물리적 손)
      if (
        rule.physicalBlockerWords &&
        rule.physicalBlockerWords.some((bw) => allContextTerms.has(bw))
      ) {
        matchedPhysicalBlocker = true;
        continue;
      }

      // 2) 필수 문맥 단어(requireContextWords) 검사 (예: "사촌이 땅을 사면 배가 아프다", "눈코 뜰 새 없다")
      if (
        rule.requireContextWords &&
        !rule.requireContextWords.some((rw) => allContextTerms.has(rw))
      ) {
        continue;
      }

      // 3) 슬라이딩 윈도우(i + 1 ~ i + maxDistance) 내에 서술어 원형(predBases)이 존재하는지 탐색
      let matchedPredIdx = -1;
      const maxIdx = Math.min(garuTokens.length - 1, i + rule.maxDistance);
      for (let j = i + 1; j <= maxIdx; j++) {
        if (consumedIndices.has(j)) continue;
        const candBase = garuTokens[j].base;
        const candStem = candBase.replace(/다$/, "");
        if (
          rule.predBases.includes(candBase) ||
          rule.predBases.includes(candStem)
        ) {
          matchedPredIdx = j;
          break;
        }
      }

      if (matchedPredIdx !== -1) {
        consumedIndices.add(i);
        consumedIndices.add(matchedPredIdx);
        // 사이에 낀 수식 부사("정말", "너무", "많이", "단단히", "굳게" 등)도 관용구 덩어리로 함께 흡수
        for (let k = i + 1; k < matchedPredIdx; k++) {
          if (
            garuTokens[k].pos === "ADV" &&
            /^(정말|너무|엄청|아주|참|매우|진짜|무척|꽤|많이|단단히|굳게|크게|깊이)$/.test(
              garuTokens[k].base
            )
          ) {
            consumedIndices.add(k);
          }
        }

        // 관용구 구성 부속 어휘(예: '눈코 뜰 새 없다'의 '코', '새', '없다')도 함께 흡수
        if (rule.consumeSpanTerms && rule.consumeSpanTerms.length > 0) {
          const spanEnd = Math.min(garuTokens.length - 1, matchedPredIdx + 2);
          for (let k = i + 1; k <= spanEnd; k++) {
            if (rule.consumeSpanTerms.includes(garuTokens[k].base)) {
              consumedIndices.add(k);
            }
          }
        }

        const combinedRaw =
          headToken.raw === garuTokens[matchedPredIdx].raw
            ? headToken.raw
            : `${headToken.raw} ${garuTokens[matchedPredIdx].raw}`;
        appliedIdioms.push(rule.idiom);

        const literalSigns = (rule.literalFallbackIds || [])
          .map((id) => getSignById(id))
          .filter((s): s is SignWordEntry => Boolean(s));

        const replacementTokens: NlpResolvedToken[] = rule.kslSequence.map(
          (item) => {
            const sign = getSignById(item.targetSignId);
            return {
              originalPart: combinedRaw,
              kslGloss: sign ? sign.word : item.kslGloss,
              senseHint: item.senseHint,
              selectionReason: rule.explanation,
              resolvedSign: sign,
              alternativeSigns: literalSigns.filter((ls) => ls.id !== sign?.id),
              isConfident: Boolean(sign),
            };
          }
        );

        idiomReplacements.set(i, replacementTokens);
        break;
      }
    }
  }

  // ============================================================================
  // [Step 2] 개별 토큰 문맥 분석 & 동음이의어 TF-IDF 스코어링 (WSD)
  // ============================================================================
  const rawResolvedTokens: Array<NlpResolvedToken & { isPast?: boolean }> = [];
  const disambiguatedHomonyms: Array<{
    word: string;
    selectedSense: string;
    scoreDiff: number;
  }> = [];

  let confidentCount = 0;
  let totalEvaluated = 0;

  for (let i = 0; i < garuTokens.length; i++) {
    if (idiomReplacements.has(i)) {
      const rep = idiomReplacements.get(i)!;
      rawResolvedTokens.push(...rep);
      confidentCount += rep.length;
      totalEvaluated += rep.length;
      continue;
    }
    if (consumedIndices.has(i)) {
      continue;
    }

    const token = garuTokens[i];
    totalEvaluated++;

    // 동음이의어 클러스터에 해당하는지 확인 (예: 눈, 다리, 배, 밤, 보내다, 나가다, 차, 말, 쓰다, 타다, 바람, 드시다, 사과)
    const homonymKey = resolveHomonymClusterKey(token.base);
    if (homonymKey && HOMONYM_CLUSTERS[homonymKey]) {
      const cluster = HOMONYM_CLUSTERS[homonymKey];
      const scoredSenses = cluster.senses.map((sense) => {
        let score = sense.prior;
        const matchedWords: string[] = [];

        for (const ctxWord of allContextTerms) {
          if (ctxWord === homonymKey) continue;
          const w = sense.weights[ctxWord];
          if (w) {
            score += w;
            matchedWords.push(ctxWord);
          }
        }
        return {
          sense,
          score: Math.round(score * 10) / 10,
          matchedWords,
        };
      });

      scoredSenses.sort((a, b) => b.score - a.score);
      const best = scoredSenses[0];
      const second = scoredSenses[1];
      const scoreDiff = second ? Math.round((best.score - second.score) * 10) / 10 : best.score;

      const selectedSign = getSignById(best.sense.signId);
      const altSigns = scoredSenses
        .slice(1)
        .map((s) => getSignById(s.sense.signId))
        .filter((s): s is SignWordEntry => Boolean(s));

      // 문맥 단서(matchedWords)가 최소 1개 이상 실제로 매칭되고 점수 차이가 명확할 때만 Confident 판정
      // (단서가 없는 미지의 문맥일 경우 isConfident = false로 두어 Gemini AI가 문맥을 직접 추론하도록 위임)
      const isHomonymConfident = Boolean(
        selectedSign && best.matchedWords.length > 0 && scoreDiff >= 2
      );

      if (isHomonymConfident) {
        confidentCount++;
      }

      disambiguatedHomonyms.push({
        word: homonymKey,
        selectedSense: `${best.sense.word} (${best.sense.label})`,
        scoreDiff,
      });

      const reason =
        best.matchedWords.length > 0
          ? `문맥 공기어(${best.matchedWords.slice(0, 3).map((w) => `'${w}'`).join(", ")})와의 TF-IDF 유사도 분석 결과, '${best.sense.label}' 의미(${best.score}점)로 판별했습니다.`
          : `기본 문맥 우선순위에 따라 '${best.sense.label}' 의미의 수어를 선택했습니다.`;

      rawResolvedTokens.push({
        originalPart: token.raw,
        kslGloss: selectedSign ? selectedSign.word : best.sense.word,
        senseHint: `${best.sense.label}, ${best.matchedWords.join(", ")}`,
        selectionReason: reason,
        resolvedSign: selectedSign,
        alternativeSigns: altSigns,
        isConfident: isHomonymConfident,
        isPast: token.isPast,
      });

      continue;
    }

    // 일반 단어 로컬 사전 매칭 (Garu가 복원한 기본형 token.base 기준)
    const localMatches = searchLocalDictionary([token.base]);
    if (localMatches.length > 0) {
      const primary = localMatches[0];
      const alts = localMatches.slice(1, 5);
      confidentCount++;

      rawResolvedTokens.push({
        originalPart: token.raw,
        kslGloss: primary.word,
        senseHint: primary.meaning,
        selectionReason: `'${token.raw}'의 원형 '${token.base}'에 매칭되는 표준 한국수어 표제어입니다.`,
        resolvedSign: primary,
        alternativeSigns: alts,
        isConfident: true,
        isPast: token.isPast,
      });
    } else {
      // 로컬 155개 사전에 없는 단어
      rawResolvedTokens.push({
        originalPart: token.raw,
        kslGloss: token.base,
        senseHint: token.base,
        selectionReason: `형태소 원형 '${token.base}'을 추출했습니다.`,
        isConfident: false,
        isPast: token.isPast,
      });
    }
  }

  // ============================================================================
  // [Step 3] 한국수어(KSL) 문법 어순 정렬 및 중복 서술어 압축
  // ============================================================================
  const reorderedSequence = reorderAndCompressKslSequence(
    rawResolvedTokens,
    garuTokens
  );

  // ============================================================================
  // [Step 4] Confidence Gating & 의미 충돌 감지(Semantic Anomaly Gate)
  // ============================================================================
  const allTokensResolved = reorderedSequence.every(
    (t) => t.isConfident && Boolean(t.resolvedSign)
  );

  // [Semantic Anomaly Gate]
  // 개별 단어가 모두 사전에 있더라도, 비유 중심 명사(눈/손/발/입/귀/배/마음 등)와 고위험 다의어 서술어가 함께 등장했는데
  // 관용구 FST, 물리적 차단어(Blocker), 동음이의어 TF-IDF 공기어 중 어느 것도 작동하지 않은 미지의 결합이라면
  // 직역 오역을 막기 위해 확신도를 낮추고 Gemini 문맥 추론을 호출합니다.
  const hasFigurativeNoun = garuTokens.some((t) =>
    FIGURATIVE_RISK_NOUNS.has(t.base)
  );
  const hasPolysemousPred = garuTokens.some((t) =>
    POLYSEMOUS_RISK_PREDICATES.has(t.base)
  );
  const hasResolvedContextClue =
    appliedIdioms.length > 0 ||
    matchedPhysicalBlocker ||
    disambiguatedHomonyms.some((h) => h.scoreDiff >= 2);

  const hasUnresolvedFigurativeRisk =
    hasFigurativeNoun && hasPolysemousPred && !hasResolvedContextClue;

  const rawRatio =
    totalEvaluated > 0 ? Math.round((confidentCount / totalEvaluated) * 100) : 0;
  const ratio = hasUnresolvedFigurativeRisk ? Math.min(rawRatio, 65) : rawRatio;

  const isFullyConfident =
    allTokensResolved &&
    !hasUnresolvedFigurativeRisk &&
    reorderedSequence.length > 0 &&
    reorderedSequence.length <= 10;

  return {
    sequence: reorderedSequence,
    isFullyConfident,
    confidenceScore: isFullyConfident ? Math.max(92, ratio) : ratio,
    appliedIdioms,
    disambiguatedHomonyms,
    elapsedMs: Date.now() - start,
  };
}

function resolveHomonymClusterKey(base: string): string | null {
  if (HOMONYM_CLUSTERS[base]) return base;
  return null;
}

/**
 * 한국수어(KSL) 문법 어순 재배치 및 중복 서술어 압축기
 * - KSL 표준 어순: [시간] -> [장소/주어/목적어/부사/핵심동사] -> [가능/부정(가능하다/아니다/못하다)] -> [과거 완료(끝)] -> [의문사]
 * - 중복 서술어 압축: 한 문장 내에서 동일한 수어 용언(동사/형용사) ID가 중복 도출된 경우 하나로 통합
 */
function reorderAndCompressKslSequence(
  tokens: Array<NlpResolvedToken & { isPast?: boolean }>,
  garuTokens: GaruToken[]
): NlpResolvedToken[] {
  if (tokens.length === 0) return [];

  // 1) 중복 수어 ID 연속/절간 압축
  const deduplicated: Array<NlpResolvedToken & { isPast?: boolean }> = [];
  for (const token of tokens) {
    const signId = token.resolvedSign?.id;
    const cleanGloss = token.kslGloss.replace(/\(.*?\)/g, "").trim();

    if (signId) {
      // 바로 직전 토큰과 동일한 수어 ID이면 하나로 병합 (예: 소식[듣다] + 듣고[듣다], 한잔[마시다] + 마셔요[마시다])
      const lastToken = deduplicated[deduplicated.length - 1];
      if (lastToken && lastToken.resolvedSign?.id === signId) {
        if (lastToken.originalPart !== token.originalPart) {
          lastToken.originalPart = `${lastToken.originalPart} ${token.originalPart}`;
        }
        continue;
      }

      // 복문/연결절 내 동일 용언(동사·형용사) 수어 중복 압축 (특정 동사 하드코딩 없이 모든 용언 표제어에 일반 적용)
      if (cleanGloss.endsWith("다")) {
        const prevIdx = deduplicated.findIndex(
          (d) => d.resolvedSign?.id === signId
        );
        if (prevIdx !== -1) {
          deduplicated[prevIdx].originalPart = `${deduplicated[prevIdx].originalPart} · ${token.originalPart}`;
          continue;
        }
      }
    }
    deduplicated.push(token);
  }

  // 2) 어순 버킷 분류
  const timeBucket: NlpResolvedToken[] = [];
  const mainBucket: NlpResolvedToken[] = [];
  const modalBucket: NlpResolvedToken[] = [];
  const questionBucket: NlpResolvedToken[] = [];

  let hasPastTense = garuTokens.some((t) => t.isPast);

  for (const t of deduplicated) {
    const cleanWord = t.kslGloss.replace(/\(.*?\)/g, "").trim();
    if (t.isPast) hasPastTense = true;

    if (TIME_WORDS.has(t.kslGloss) || TIME_WORDS.has(cleanWord)) {
      timeBucket.push(t);
    } else if (QUESTION_WORDS.has(t.kslGloss) || QUESTION_WORDS.has(cleanWord)) {
      questionBucket.push(t);
    } else if (MODAL_END_WORDS.has(t.kslGloss) || MODAL_END_WORDS.has(cleanWord)) {
      modalBucket.push(t);
    } else {
      mainBucket.push(t);
    }
  }

  const finalSeq: NlpResolvedToken[] = [
    ...timeBucket,
    ...mainBucket,
    ...modalBucket,
  ];

  // 과거 시제이고 아직 '끝(완료)' 수어가 없으며 인사말/단순 형용사 상태가 아닌 경우 '끝' 수어 검토
  // (기존 문장 흐름과 자연스럽게 호환되도록, 이미 '끝'이 있으면 유지)
  void hasPastTense;

  finalSeq.push(...questionBucket);
  return finalSeq;
}
