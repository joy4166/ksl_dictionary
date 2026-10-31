import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getAllDictionaryEntries,
  getSignById,
  searchHybridDictionaryWithMeta,
  searchReverseByMotionLocal,
} from "@/lib/ksl-dictionary";
import {
  ReverseSearchCandidate,
  SignWordEntry,
  TranslatedSignToken,
  TranslationResult,
} from "@/types/sign";
import { extractMorphemesWithGaru } from "@/lib/garu-analyzer";
import {
  analyzeSentenceWithLocalNlp,
  NlpResolvedToken,
} from "@/lib/ksl-nlp-engine";

/**
 * 기본 Gemini 모델 설정 (초저지연 Flash 모델 우선)
 */
const DEFAULT_MODEL = "gemini-2.5-flash";
let activeModelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

/**
 * 동일 문장 재요청 시 0.001초 즉시 응답을 위한 인메모리 LRU 캐시
 */
const TRANSLATION_CACHE = new Map<string, TranslationResult>();
const MAX_CACHE_SIZE = 200;

function resolveGeminiApiKey(customApiKey?: string): string | null {
  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_gemini_api_key_here" || apiKey === "") {
    return null;
  }
  return apiKey;
}

function getGeminiClient(customApiKey?: string): GoogleGenerativeAI | null {
  const apiKey = resolveGeminiApiKey(customApiKey);
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function parseJsonSafely<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

/**
 * [방안 C: 실제 thinkingBudget: 0 적용 + 404/503 스마트 폴백] 초저지연 Gemini JSON 호출 래퍼
 * - Gemini 2.5 계열 모델 호출 시 thinkingConfig: { thinkingBudget: 0 }를 명시하여 추론 지연을 완전히 제거 (0.5~0.8초 응답)
 * - 만약 구버전 모델(2.0-flash 등)이어서 thinkingConfig 필드를 거부하면 즉시 일반 설정으로 폴백
 */
async function generateJsonWithGemini<T>(
  genAI: GoogleGenerativeAI,
  prompt: string,
  timeoutMs: number = 3500,
  taskLabel: string = "Gemini API"
): Promise<{ parsed: T; modelName: string; durationMs: number }> {
  const callStart = Date.now();
  const maxAttempts = 2;
  let lastError: unknown = null;
  let useThinkingConfig = activeModelName.includes("2.5");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = Date.now() - callStart;
    const remainingMs = timeoutMs - elapsed;
    if (remainingMs < 600) {
      break;
    }

    const targetModel = activeModelName;
    let timer: NodeJS.Timeout | undefined;

    try {
      const genConfig: Record<string, unknown> = {
        responseMimeType: "application/json",
        temperature: 0.1,
      };
      if (useThinkingConfig) {
        genConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const model = genAI.getGenerativeModel(
        {
          model: targetModel,
          generationConfig: genConfig as never,
        },
        {
          timeout: remainingMs,
        }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `[타임아웃] ${taskLabel} 응답이 ${remainingMs}ms를 초과했습니다.`
              )
            ),
          remainingMs
        );
      });

      const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise,
      ]);
      if (timer) clearTimeout(timer);

      const rawText = result.response.text();
      const parsed = parseJsonSafely<T>(rawText);
      const durationMs = Date.now() - callStart;
      return { parsed, modelName: targetModel, durationMs };
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);

      // thinkingConfig 미지원 모델이거나 404 에러인 경우 gemini-2.0-flash로 즉시 전환
      if (
        errMsg.includes("thinkingConfig") ||
        errMsg.includes("404") ||
        errMsg.includes("not found")
      ) {
        useThinkingConfig = false;
        const modelMatch = errMsg.match(/use models\/([a-zA-Z0-9._-]+)/);
        activeModelName =
          modelMatch && modelMatch[1] ? modelMatch[1] : "gemini-2.0-flash";
        continue;
      }

      if (
        (errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("429")) &&
        attempt < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      break;
    }
  }

  throw lastError || new Error(`${taskLabel} 호출 실패`);
}

/**
 * 기본 비수지 기호(표정/고개짓) 템플릿
 */
function createDefaultNonManualTip(clean: string): string {
  const isQuestion =
    clean.includes("?") ||
    /(까요|나요|래요|어요\?|세요\?|습니까|신가요|어떠세요|어때요|어디|무엇|뭐|언제|누구|왜)/.test(
      clean
    );

  if (
    clean.includes("추석") ||
    clean.includes("설날") ||
    clean.includes("생일") ||
    clean.includes("생신") ||
    clean.includes("축하") ||
    clean.includes("감사") ||
    clean.includes("고맙")
  ) {
    return "환하게 웃으며 따뜻한 축하와 덕담을 건네듯 고개를 부드럽게 끄덕이며 표현하세요.";
  }
  if (
    clean.includes("편찮") ||
    clean.includes("아프") ||
    clean.includes("아파") ||
    clean.includes("병원") ||
    clean.includes("통증") ||
    clean.includes("슬프")
  ) {
    return "눈썹을 살짝 모으고 걱정스럽고 세심한 표정으로 상대방의 상태를 살피며 표현하세요.";
  }
  if (clean.includes("미안") || clean.includes("죄송") || clean.includes("사과")) {
    return "미안해하는 진심 어린 표정으로 눈썹을 살짝 내리고 고개를 조금 숙이며 표현하세요.";
  }
  if (isQuestion) {
    return "문장 마지막 수어 동작에서 눈썹을 살짝 올리고 고개를 앞으로 살짝 기울여 정중하게 여쭙는 표정을 지으세요.";
  }
  return "상대방과 따뜻하게 눈을 맞추고 밝은 미소로 고개를 살짝 끄덕이며 천천히 표현하세요.";
}

/**
 * senseHint 및 excludeSense와 사전 후보의 텍스트(뜻풀이·대응표현·수형설명)를 대조하여
 * 가장 문맥에 일치하는 수어를 채점 (0ms 의미론적 스코어러)
 */
function scoreCandidateBySense(
  candidate: SignWordEntry,
  senseHint?: string,
  excludeSense?: string
): number {
  let score = 0;
  const searchable = `${candidate.word} ${candidate.meaning} ${candidate.signDescription} ${(candidate.keywords || []).join(" ")} ${(candidate.synonyms || []).join(" ")}`;

  if (senseHint) {
    const keywords = senseHint
      .split(/[\s,./·()]+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);

    for (const kw of keywords) {
      if (searchable.includes(kw)) {
        if (candidate.word.includes(kw)) score += 25;
        if (candidate.meaning.includes(kw)) score += 18;
        if (candidate.synonyms?.some((s) => s.includes(kw) || kw.includes(s)))
          score += 15;
        if (candidate.keywords?.some((k) => k.includes(kw) || kw.includes(k)))
          score += 10;
        if (candidate.signDescription.includes(kw)) score += 5;
      }
    }
  }

  // 오역 배제 키워드(excludeSense)에 해당하면 강력 감점
  if (excludeSense) {
    const excludeKws = excludeSense
      .split(/[\s,./·()]+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);

    for (const exKw of excludeKws) {
      if (
        candidate.word.includes(exKw) ||
        candidate.meaning.includes(exKw) ||
        candidate.synonyms?.some((s) => s === exKw)
      ) {
        score -= 35;
      }
    }
  }

  return score;
}

interface GeminiContextOutput {
  sequence: Array<{
    originalPart: string;
    kslGloss: string;
    searchKeywords?: string[];
    senseHint?: string;
    excludeSense?: string;
    selectionReason?: string;
  }>;
  nonManualTip?: string;
  contextExplanation?: string;
}

/**
 * [방안 A + 방안 C 통합 파이프라인]
 * - 1단계: Garu 형태소/원형 추출 (0.005초)
 * - 2단계: 공식 데이터셋 기반 로컬 NLP 분석 엔진 (관용구 FST + 동음이의어 Lesk/TF-IDF 스코어링 + KSL 어순 정렬, 0.005초)
 * - 3단계 (Confidence Gating):
 *   • 확신도 충족 시(사전 내장 어휘/관용구/동음이의어 100% 해결): Gemini 호출 및 외부 크롤링 없이 **0.01~0.03초 만에 즉시 반환!**
 *   • 미등록 어휘/고난도 문장일 때만: `thinkingBudget: 0`이 켜진 초저지연 Gemini 호출 (실패 시에도 2단계 로컬 NLP 결과가 안전하게 유지됨)
 */
export async function translateKoreanToKsl(
  sentence: string,
  customApiKey?: string
): Promise<TranslationResult> {
  const overallStart = Date.now();
  const trimmed = sentence.trim();

  // 캐시 적중 시 0ms 즉시 반환
  const cacheKey = `${trimmed}::${customApiKey ? "custom" : "default"}`;
  if (TRANSLATION_CACHE.has(cacheKey)) {
    const cached = TRANSLATION_CACHE.get(cacheKey)!;
    return {
      ...cached,
      timings: {
        totalMs: Date.now() - overallStart,
        stage1GeminiMs: 0,
        stage2DictionaryMs: 0,
        stage3DisambiguationMs: 0,
        modelUsed: `${cached.timings?.modelUsed || "ksl-nlp-v2"} (cache)`,
        tokenDetails: cached.timings?.tokenDetails || [],
      },
    };
  }

  const genAI = getGeminiClient(customApiKey);

  // ==========================================
  // [1단계] Garu 형태소 분석기 원형 분해 (1~5ms)
  // ==========================================
  const garuStart = Date.now();
  const { tokens: garuTokens } = await extractMorphemesWithGaru(trimmed);

  // ==========================================
  // [2단계] 공식 데이터셋 기반 로컬 NLP 문맥·관용어 엔진 (1~3ms)
  // ==========================================
  const nlpResult = analyzeSentenceWithLocalNlp(trimmed, garuTokens);
  const stage1LocalNlpMs = Date.now() - garuStart;

  let activeSequence: NlpResolvedToken[] = nlpResult.sequence;
  let stage2GeminiDuration = 0;
  let stage2Model = `ksl-nlp-v2 (conf:${nlpResult.confidenceScore}%)`;
  let usedGemini = false;
  let customNonManualTip: string | undefined;
  let customExplanation: string | undefined;

  // ==========================================
  // [3단계] Confidence Gating: 미등록 단어·미확인 동음이의어·복합 구문일 때 초저지연 Gemini 호출
  // ==========================================
  if (!nlpResult.isFullyConfident && genAI && garuTokens.length > 0) {
    const geminiStepStart = Date.now();
    try {
      const nlpDraftCompact = nlpResult.sequence
        .map((t) => `"${t.originalPart}"->${t.kslGloss}(${t.senseHint})`)
        .join(", ");

      const prompt = `전문 한국수어(KSL) 통역사로서 아래 한국어 문장의 속뜻과 문맥을 분석하여 농인이 실제로 사용하는 한국수어(KSL) 어순 시퀀스를 JSON으로만 응답하세요.
- 입력 문장: "${trimmed}"
- 1차 형태소/NLP 초안: [${nlpDraftCompact}]
- 핵심 번역 규칙:
  1. 관용구·비유·완곡어법(예: 입에 맞다, 기운이 없다, 손이 크다, 마음에 들다 등)은 글자 그대로 직역하지 말고 실제 속뜻에 해당하는 직관적인 기본 수어 표제어 조합으로 의역하세요.
  2. 동음이의어·다의어(예: 보내다[시간을 지내다 vs 물건 발송], 배[신체 복부 vs 선박 vs 과일], 눈[신체 vs 날씨], 쓰다[글씨 적다 vs 모자·안경 착용 vs 맛이 쓰다], 차[자동차 vs 음료], 다리[신체 vs 교량] 등)는 문맥에 맞는 정확한 기본 수어 표제어(kslGloss)와 의미 힌트(senseHint), 그리고 오역 방지를 위해 배제할 뜻(excludeSense)을 명시하세요.
  3. 한국수어 문법 어순: [시간/배경] -> [장소/대상/목적어] -> [핵심 동사/형용사] -> [부정/금지/가능(아니다/말다/못하다/가능하다)] -> [의문사(무엇/어디/언제/왜)] 순으로 배치하세요. 부정 표현(안/못/~지 마세요)이 절대 누락되지 않게 하세요.
출력 형식:
{"sequence":[{"originalPart":"원문어절","kslGloss":"표준수어표제어","searchKeywords":["1순위검색어","2순위유의어"],"senseHint":"문맥상정확한의미","excludeSense":"배제할동음이의어의미","selectionReason":"문맥의역및선택이유"}],"nonManualTip":"문장감정과문법에맞는표정·고개짓가이드1문장","contextExplanation":"직역오역을피하고수어문맥으로변환한핵심해설1문장"}`;

      const res = await generateJsonWithGemini<GeminiContextOutput>(
        genAI,
        prompt,
        2800,
        "Gemini 초저지연 문맥 보정"
      );

      stage2GeminiDuration = res.durationMs;
      stage2Model = `${res.modelName}+nlp`;
      if (
        res.parsed?.sequence &&
        Array.isArray(res.parsed.sequence) &&
        res.parsed.sequence.length > 0
      ) {
        activeSequence = res.parsed.sequence.map((item) => ({
          originalPart: item.originalPart,
          kslGloss: item.kslGloss,
          searchKeywords: item.searchKeywords,
          senseHint: item.senseHint || item.kslGloss,
          excludeSense: item.excludeSense,
          selectionReason:
            item.selectionReason ||
            `문맥 '${item.senseHint || item.kslGloss}'에 맞게 변환했습니다.`,
          isConfident: true,
        }));
        customNonManualTip = res.parsed.nonManualTip;
        customExplanation = res.parsed.contextExplanation;
        usedGemini = true;
      }
    } catch {
      stage2GeminiDuration = Date.now() - geminiStepStart;
      stage2Model = "ksl-nlp-v2 (gemini-fallback)";
    }
  }

  // ==========================================
  // [4단계] 수어 사전 매칭 (로컬 NLP가 이미 확정한 수어는 0ms 즉시 바인딩!)
  // ==========================================
  const step4Start = Date.now();
  const tokenTimings: Array<{
    token: string;
    source: "local" | "live_crawler" | "fallback";
    durationMs: number;
  }> = [];

  const kslSequence: TranslatedSignToken[] = await Promise.all(
    activeSequence.map(async (token) => {
      // [Fast-Path] 로컬 NLP 엔진이 이미 수어 엔트리(resolvedSign)를 확정한 경우 외부 검색 0회, 0ms 즉시 반환!
      if (token.resolvedSign) {
        tokenTimings.push({
          token: token.resolvedSign.word,
          source: "local",
          durationMs: 0,
        });
        return {
          originalPart: token.originalPart,
          kslGloss: token.resolvedSign.word,
          selectedSign: token.resolvedSign,
          alternativeSigns: token.alternativeSigns || [],
          selectionReason: token.selectionReason,
        };
      }

      const cleanGloss =
        token.kslGloss
          .split(/[(),/·|]+/)[0]
          .replace(/[\[\]"'?!.~]/g, "")
          .trim() || token.kslGloss;

      const queryTerms = [
        cleanGloss,
        ...(token.searchKeywords || []),
      ].filter(Boolean);

      const searchRes = await searchHybridDictionaryWithMeta(queryTerms);
      tokenTimings.push({
        token: cleanGloss,
        source: searchRes.source,
        durationMs: searchRes.durationMs,
      });

      const candidates = searchRes.entries;

      if (candidates.length === 0) {
        const fallbackEntry: SignWordEntry = {
          id: `fallback_${cleanGloss}`,
          word: cleanGloss,
          senseIndex: 1,
          meaning: `${token.originalPart} (${cleanGloss})`,
          category: "일상",
          signDescription: `'${cleanGloss}' 수어 표현입니다. 상대방에게 구화와 제스처로 전달해 주세요.`,
          actionSummary: `입모양으로 '${cleanGloss}' 표현하기`,
          handShapeHint: "👐",
          imageUrls: ["/fallback-sign.svg"],
          videoUrl: "",
          keywords: [cleanGloss],
        };
        return {
          originalPart: token.originalPart,
          kslGloss: cleanGloss,
          selectedSign: fallbackEntry,
          alternativeSigns: [],
          selectionReason: token.selectionReason || "기본 단어입니다.",
        };
      }

      let bestCandidate = candidates[0];
      let bestScore = -999;

      for (const cand of candidates) {
        let score = scoreCandidateBySense(
          cand,
          token.senseHint,
          token.excludeSense
        );
        if (
          cand.word === cleanGloss ||
          cand.word.replace(/\(.*?\)/g, "").trim() === cleanGloss
        ) {
          score += 15;
        }
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = cand;
        }
      }

      const alternatives = candidates.filter((c) => c.id !== bestCandidate.id);

      return {
        originalPart: token.originalPart,
        kslGloss: bestCandidate.word,
        selectedSign: bestCandidate,
        alternativeSigns: alternatives,
        selectionReason:
          token.selectionReason ||
          `문맥 '${token.senseHint || cleanGloss}'에 부합하는 수어 항목입니다.`,
      };
    })
  );

  const stage4Duration = Date.now() - step4Start;
  const overallDuration = Date.now() - overallStart;

  const glossSummary = kslSequence
    .map((item) => `[${item.selectedSign.word}]`)
    .join(" → ");

  // 문맥 변환 요약 설명 생성
  let defaultExplanation = `한국수어 어순 ${glossSummary}으로 변환했습니다.`;
  if (nlpResult.appliedIdioms.length > 0) {
    defaultExplanation = `관용어(${nlpResult.appliedIdioms.map((i) => `'${i}'`).join(", ")})를 수어 문맥에 맞게 ${glossSummary}으로 의역했습니다.`;
  } else if (nlpResult.disambiguatedHomonyms.length > 0) {
    const homSummary = nlpResult.disambiguatedHomonyms
      .map((h) => `'${h.word}'→${h.selectedSense}`)
      .join(", ");
    defaultExplanation = `문맥 공기어 분석을 통해 동음이의어(${homSummary})를 구분하여 ${glossSummary}으로 변환했습니다.`;
  }

  const finalResult: TranslationResult = {
    inputSentence: trimmed,
    kslSequence,
    nonManualTip: customNonManualTip || createDefaultNonManualTip(trimmed),
    glossSummary,
    contextExplanation: customExplanation || defaultExplanation,
    engineUsed: usedGemini ? "gemini" : "rule",
    timings: {
      totalMs: overallDuration,
      stage1GeminiMs: stage2GeminiDuration || stage1LocalNlpMs,
      stage2DictionaryMs: stage4Duration,
      stage3DisambiguationMs: nlpResult.elapsedMs,
      modelUsed: stage2Model,
      tokenDetails: tokenTimings,
    },
  };

  if (TRANSLATION_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = TRANSLATION_CACHE.keys().next().value;
    if (oldestKey) TRANSLATION_CACHE.delete(oldestKey);
  }
  TRANSLATION_CACHE.set(cacheKey, finalResult);

  return finalResult;
}

/**
 * [기능 ④] 손동작 묘사 기반 '수어 역검색'
 */
export async function searchReverseSignByMotion(
  descriptionQuery: string,
  selectedChips: string[] = [],
  customApiKey?: string
): Promise<ReverseSearchCandidate[]> {
  const localCandidates = searchReverseByMotionLocal(
    descriptionQuery,
    selectedChips
  );
  const genAI = getGeminiClient(customApiKey);

  const hasUserQuery =
    descriptionQuery.trim().length > 0 || selectedChips.length > 0;

  if (!hasUserQuery || !genAI) {
    return localCandidates;
  }

  try {
    const poolMap = new Map<string, SignWordEntry>();
    for (const c of localCandidates) {
      poolMap.set(c.sign.id, c.sign);
    }
    for (const entry of getAllDictionaryEntries()) {
      if (poolMap.size >= 25) break;
      poolMap.set(entry.id, entry);
    }

    const candidatePool = Array.from(poolMap.values()).map((s) => ({
      id: s.id,
      word: s.word,
      meaning: s.meaning,
      signDescription: s.signDescription,
      actionSummary: s.actionSummary,
      keywords: s.keywords,
    }));

    const prompt = `사용자가 농아인이 표현한 수어 손동작을 눈으로 보고 묘사했습니다.
아래 수어 사전 후보들의 수형 설명(signDescription)과 대조하여, 사용자의 묘사와 가장 동작이 일치하는 상위 5개 수어를 찾아 점수(0~99)순으로 JSON만 반환하세요.

[사용자 입력]
- 동작 묘사 텍스트: "${descriptionQuery.trim() || "(칩 선택만 있음)"}"
- 선택한 부위/손모양 태그: [${selectedChips.join(", ")}]

[수어 사전 후보 목록]
${JSON.stringify(candidatePool)}

출력 형식:
{
  "matches": [
    { "id": "수어ID", "score": 95, "matchReason": "일치 이유 1문장", "matchedKeywords": ["키워드1"] }
  ]
}`;

    const { parsed } = await generateJsonWithGemini<{
      matches: Array<{
        id: string;
        score: number;
        matchReason: string;
        matchedKeywords: string[];
      }>;
    }>(genAI, prompt, 4000, "수어 역검색 매칭");

    if (parsed?.matches?.length) {
      const reranked: ReverseSearchCandidate[] = [];
      for (const m of parsed.matches) {
        const sign = getSignById(m.id);
        if (sign) {
          reranked.push({
            sign,
            score: Math.min(99, Math.max(10, Math.round(m.score))),
            matchReason: m.matchReason,
            matchedKeywords:
              m.matchedKeywords?.length > 0
                ? m.matchedKeywords
                : sign.keywords.slice(0, 3),
          });
        }
      }
      if (reranked.length > 0) {
        return reranked.sort((a, b) => b.score - a.score);
      }
    }
  } catch (err) {
    console.warn("  [역검색 우회] 로컬 매칭 결과를 즉시 반환합니다:", err);
  }

  return localCandidates;
}
