import { Garu } from "garu-ko";
import type { Token, AnalyzeResult } from "garu-ko";

export interface GaruToken {
  raw: string;
  base: string;
  pos: string;
  /** 과거 시제 선어말어미(었/았/였) 포함 여부 */
  isPast?: boolean;
  /** 동반 부사격 조사(랑/이랑/와/과) 결합 여부 -> 수어 '함께' 추가용 */
  hasCompanionJosa?: boolean;
  /** 허락/가능 연결어미(-어도/-아도) 여부 */
  isPermission?: boolean;
}

let garuInstance: Garu | null = null;
let garuLoadingPromise: Promise<Garu | null> | null = null;
let garuFailed = false;

/**
 * Garu WASM 인스턴스를 한 번만 로드하여 재사용하는 싱글톤 로더
 * Vercel 서버리스 등 WASM 파일이 누락되는 클라우드 환경에서는 안전하게 null 반환
 */
export async function getGaru(): Promise<Garu | null> {
  if (garuFailed) return null;
  if (garuInstance) return garuInstance;
  if (!garuLoadingPromise) {
    garuLoadingPromise = Garu.load()
      .then((instance) => {
        garuInstance = instance;
        return instance;
      })
      .catch((err) => {
        console.warn(
          "[Garu WASM 로드 실패 -> 비상 폴백 토크나이저로 전환]:",
          err?.message || err
        );
        garuFailed = true;
        garuLoadingPromise = null;
        return null;
      });
  }
  return garuLoadingPromise;
}

/**
 * 의존명사/형식명사 필터 (수어 독립 어휘로 변환하지 않는 문법적 의존명사)
 */
const BOUND_NOUN_SET = new Set([
  "것",
  "거",
  "수",
  "줄",
  "데",
  "바",
  "곳",
  "쪽",
  "편",
  "분",
  "리",
  "채",
  "척",
  "듯",
  "뿐",
]);

/**
 * WASM 바이너리를 로드할 수 없는 제한된 런타임 환경에서만 동작하는 최소한의 규칙 기반 비상 폴백
 */
function extractFallbackTokens(clean: string): GaruToken[] {
  const words = clean.split(/[\s,./?!~]+/).filter(Boolean);
  const result: GaruToken[] = [];

  for (const rawWord of words) {
    const cleanRaw = rawWord.replace(/[?!.,~"']/g, "");
    if (!cleanRaw) continue;

    const isPast = /(셨어요|었어요|았어요|했어요|왔어요|갔어요|났어요|졌어요|했다|왔다|갔다)$/.test(
      cleanRaw
    );
    const hasCompanionJosa =
      /(랑|이랑|와|과)$/.test(cleanRaw) && cleanRaw.length >= 2;
    const isPermission = /(어도|아도|여도)$/.test(cleanRaw);

    if (/^(저|제|제가|저는|나|내|내가|나는)$/.test(cleanRaw)) {
      result.push({ raw: rawWord, base: "나", pos: "PRON" });
      continue;
    }

    let stem = cleanRaw.replace(
      /(에서|으로|에게|하고|하며|다가|에는|까지|부터|에|을|를|이|가|은|는|로|와|과|랑|도|만)$/,
      ""
    );
    if (!stem) stem = cleanRaw;

    let base = stem;
    let pos = "NOUN";

    if (/(하다|해요|하세요|하셨어요|했다|하면|하고)$/.test(stem)) {
      const nounPart = stem.replace(
        /(하다|해요|하세요|하셨어요|했다|하면|하고)$/,
        ""
      );
      base = nounPart ? `${nounPart}하다` : "하다";
      pos = "VERB";
    } else if (
      /(으세요|세요|어요|아요|셨어요|었어요|았어요|습니다|ㅂ니다)$/.test(stem) &&
      stem.length >= 2
    ) {
      const vStem = stem.replace(
        /(으세요|세요|어요|아요|셨어요|었어요|았어요|습니다|ㅂ니다)$/,
        ""
      );
      if (vStem) {
        base = `${vStem}다`;
        pos = "VERB";
      }
    }

    result.push({
      raw: rawWord,
      base,
      pos,
      isPast,
      hasCompanionJosa,
      isPermission,
    });

    if (hasCompanionJosa) {
      result.push({ raw: "함께", base: "함께", pos: "ADV" });
    }
  }

  return result;
}

/**
 * Garu(MeCab-ko WASM) 형태소 분석 결과를 100% 활용하여
 * 한 어절 내부의 복합 명사, 본용언+보조용언, 파생 용언, 높임 선어말어미, 문법 표지를
 * 하드코딩 없이 형태소 품사(POS) 규칙만으로 순차 추출합니다.
 */
export async function extractMorphemesWithGaru(
  sentence: string
): Promise<{ tokens: GaruToken[]; elapsedMs: number }> {
  const start = Date.now();
  const clean = sentence.trim();
  if (!clean) return { tokens: [], elapsedMs: 0 };

  const garu = await getGaru();
  if (!garu) {
    const fallbackTokens = extractFallbackTokens(clean);
    return { tokens: fallbackTokens, elapsedMs: Date.now() - start };
  }

  try {
    const rawAnalyzed = garu.analyze(clean);
    const analyzed: AnalyzeResult = Array.isArray(rawAnalyzed)
      ? rawAnalyzed[0]
      : rawAnalyzed;

    // start:end 오프셋 단위로 어절 그룹화
    const groups = new Map<string, Token[]>();
    for (const t of analyzed.tokens) {
      const key = `${t.start}:${t.end}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const result: GaruToken[] = [];
    let pendingAbilityNoun = false; // 이전 어절이 의존명사 '수(NNB)'로 끝났는지 여부 ('할 수 있다/없다')
    let prevEojeolEndedWithEoA = false; // 이전 어절이 연결어미 '-어/-아(EC)'로 끝났는지 여부 ('달려 있다', '해 보다')

    for (const [key, wordTokens] of groups.entries()) {
      const [wStart, wEnd] = key.split(":").map(Number);
      const rawWord = clean.slice(wStart, wEnd).trim();
      if (!rawWord) continue;

      // 1) 어절 단위 문법 자질(과거 시제 EP, 동반 부사격 조사 JKB, 허락 연결어미 EC) 추출
      const isPast = wordTokens.some(
        (t: Token) => t.pos === "EP" && /^(었|았|였|셨)$/.test(t.text)
      );

      // JKB(부사격 조사: '할머니랑', '할머니와')만 동반('함께')으로 인정하고, JC(접속조사: '편지와 선물')는 제외
      const hasCompanionJosa = wordTokens.some(
        (t: Token) => t.pos === "JKB" && /^(랑|이랑|와|과|하고)$/.test(t.text)
      );

      const isPermission = wordTokens.some(
        (t: Token) => t.pos === "EC" && /^(어도|아도|여도)$/.test(t.text)
      );

      const currentEndsWithEoA = wordTokens.some(
        (t: Token) => t.pos === "EC" && /^(어|아|여)$/.test(t.text)
      );

      // MeCab-ko의 '주무세요' 음운 축약 오분석(주/NNG + 물/VV + 세요/EF) 형태소 규칙 보정
      if (
        wordTokens.length >= 2 &&
        wordTokens[0].pos === "NNG" &&
        wordTokens[0].text === "주" &&
        wordTokens[1].pos === "VV" &&
        wordTokens[1].text === "물"
      ) {
        result.push({
          raw: rawWord,
          base: "주무시다",
          pos: "VERB",
          isPast,
        });
        prevEojeolEndedWithEoA = currentEndsWithEoA;
        continue;
      }

      let emittedCompanionInEojeol = false;
      let hasMainPredicateInEojeol = false;

      // 2) 어절 내 모든 형태소 토큰을 유실 없이 순차 순회
      let i = 0;
      while (i < wordTokens.length) {
        const t = wordTokens[i];
        const next = wordTokens[i + 1];
        const prev = wordTokens[i - 1];

        // (A) 의존명사 '수(NNB)' + '있/없(VA|VX)' 가능/불가능 구문 ('할수있어요', '갈수없어요', '할 수 있어요')
        if (t.pos === "NNB" && t.text === "수") {
          if (
            next &&
            (next.pos === "VA" || next.pos === "VX") &&
            (next.text === "있" || next.text === "없")
          ) {
            result.push({
              raw: rawWord,
              base: next.text === "있" ? "가능하다" : "못하다",
              pos: "AUX",
              isPast,
            });
            pendingAbilityNoun = false;
            i += 2;
            continue;
          } else {
            pendingAbilityNoun = true;
            i++;
            continue;
          }
        }

        // 이전 어절의 '수(NNB)' 뒤에 이어지는 '있어요/없어요' 결합
        if (
          pendingAbilityNoun &&
          (t.pos === "VA" || t.pos === "VX") &&
          (t.text === "있" || t.text === "없")
        ) {
          result.push({
            raw: rawWord,
            base: t.text === "있" ? "가능하다" : "못하다",
            pos: "AUX",
            isPast,
          });
          pendingAbilityNoun = false;
          hasMainPredicateInEojeol = true;
          i++;
          continue;
        }

        // (B) 체언/어근(NNG, NNP, XR) 처리
        if (t.pos === "NNG" || t.pos === "NNP" || t.pos === "XR") {
          // B-1: 명사/어근 + 용언 파생 접미사(XSV, XSA) 또는 '하(VV)' 결합 (예: 촬영+하 -> 촬영하다, 미안+하 -> 미안하다, 안녕+하 -> 안녕하다)
          if (
            next &&
            (next.pos === "XSV" ||
              next.pos === "XSA" ||
              (next.pos === "VV" && next.text === "하"))
          ) {
            const suffix = next.text === "하" || next.text === "되" ? next.text : "하";
            result.push({
              raw: rawWord,
              base: `${t.text}${suffix}다`,
              pos: next.pos === "XSA" ? "ADJ" : "VERB",
              isPast,
              isPermission,
            });
            hasMainPredicateInEojeol = true;
            i += 2;
            continue;
          }

          // B-2: 명사 + 높임 접미사 '님(XSN)' 결합 (예: 선생+님 -> 선생님, 부모+님 -> 부모님)
          if (next && next.pos === "XSN" && next.text === "님") {
            result.push({
              raw: rawWord,
              base: `${t.text}님`,
              pos: "NOUN",
              hasCompanionJosa,
            });
            emittedCompanionInEojeol = hasCompanionJosa;
            i += 2;
            continue;
          }

          // B-3: MeCab-ko 미등록 용언+높임어미 결합 NNG(예: '크셔서/NNG') 일반 형태소 복원 규칙
          const honorificOovMatch = t.text.match(
            /^(.+)(으셔서|셔서|으시네요|시네요|으십니다|십니다)$/
          );
          if (honorificOovMatch && honorificOovMatch[1].length >= 1) {
            result.push({
              raw: rawWord,
              base: `${honorificOovMatch[1]}다`,
              pos: "ADJ",
              isPast,
            });
            hasMainPredicateInEojeol = true;
            i++;
            continue;
          }

          // B-4: 일반 명사/고유명사 추출 (한 어절에 복합 명사 '눈/NNG + 코/NNG'나 '밥/NNG + 먹/VV'가 있어도 모두 보존)
          if (t.pos !== "XR" && !BOUND_NOUN_SET.has(t.text)) {
            result.push({
              raw: rawWord,
              base: t.text,
              pos: "NOUN",
              hasCompanionJosa,
            });
            emittedCompanionInEojeol = hasCompanionJosa;
          }
          i++;
          continue;
        }

        // (C) 대명사(NP), 수사(NR), 문두 1인칭 관형사 오태깅('저 대회에...') 처리
        if (t.pos === "NP") {
          const pronBase = /^(저|제|나|내)$/.test(t.text) ? "나" : t.text;
          result.push({
            raw: rawWord,
            base: pronBase,
            pos: "PRON",
            hasCompanionJosa,
          });
          emittedCompanionInEojeol = hasCompanionJosa;
          i++;
          continue;
        }

        if (t.pos === "MM" && t.text === "저" && wStart === 0) {
          result.push({
            raw: rawWord,
            base: "나",
            pos: "PRON",
          });
          i++;
          continue;
        }

        if (t.pos === "NR") {
          result.push({
            raw: rawWord,
            base: t.text,
            pos: "NUM",
          });
          i++;
          continue;
        }

        // (D) 동사(VV), 형용사(VA), 보조용언(VX) 처리
        if (t.pos === "VV" || t.pos === "VA" || t.pos === "VX") {
          // D-1: '들(VV)' + 높임 선어말어미 '시(EP)' 또는 '세요(EF)' -> '드시다'
          if (
            t.pos === "VV" &&
            t.text === "들" &&
            wordTokens
              .slice(i + 1)
              .some(
                (tok: Token) =>
                  (tok.pos === "EP" && tok.text === "시") ||
                  (tok.pos === "EF" && tok.text.startsWith("세"))
              )
          ) {
            result.push({
              raw: rawWord,
              base: "드시다",
              pos: "VERB",
              isPast,
              isPermission,
            });
            hasMainPredicateInEojeol = true;
            i++;
            continue;
          }

          // D-2: 부정·금지·불능·희망 보조용언 (VX 또는 연결어미 '-지/-고' 뒤의 VV)
          const isAfterNegConn =
            prev && prev.pos === "EC" && (prev.text === "지" || prev.text === "고");
          if (t.pos === "VX" || isAfterNegConn) {
            if (t.text === "말") {
              result.push({ raw: rawWord, base: "말다", pos: "AUX", isPast });
              i++;
              continue;
            }
            if (t.text === "않") {
              result.push({ raw: rawWord, base: "아니다", pos: "AUX", isPast });
              i++;
              continue;
            }
            if (t.text === "못하") {
              result.push({ raw: rawWord, base: "못하다", pos: "AUX", isPast });
              i++;
              continue;
            }
            if (t.text === "싶") {
              result.push({ raw: rawWord, base: "원하다", pos: "AUX", isPast });
              i++;
              continue;
            }

            // 단독 어절 '주세요(주/VX+세요/EF)'처럼 앞에 본용언 연결어미(-어/-아)가 없는 경우 본동사 '주다'로 추출
            if (
              t.pos === "VX" &&
              t.text === "주" &&
              !hasMainPredicateInEojeol &&
              !prevEojeolEndedWithEoA
            ) {
              result.push({ raw: rawWord, base: "주다", pos: "VERB", isPast });
              hasMainPredicateInEojeol = true;
              i++;
              continue;
            }

            // 그 외 진행/보조 VX ('달려 있어요'의 '있/VX', '켜주세요'의 '주/VX', '해 보세요'의 '보/VX')는 본용언에 통합
            if (t.pos === "VX") {
              i++;
              continue;
            }
          }

          // D-3: 허락 연결어미(-어도/-아도) 뒤에 오는 '되(VV)' -> 한국수어 허락/가능 문법 표지 '가능하다'
          const lastEmitted = result[result.length - 1];
          if (t.pos === "VV" && t.text === "되" && lastEmitted?.isPermission) {
            result.push({
              raw: rawWord,
              base: "가능하다",
              pos: "AUX",
              isPast,
            });
            hasMainPredicateInEojeol = true;
            i++;
            continue;
          }

          // D-4: 한국수어 대동사(Pro-verb) '하다' 생략 규칙 (앞에 이미 목적어/부사가 존재하고 단독 '하/VV'만 쓰인 경우)
          if (
            t.pos === "VV" &&
            t.text === "하" &&
            !hasMainPredicateInEojeol &&
            result.length > 0 &&
            !wordTokens.some((tok: Token) => tok.pos === "EC" && tok.text === "지")
          ) {
            i++;
            continue;
          }

          // D-5: 일반 본동사/형용사 원형 복원 (어간 + '다')
          result.push({
            raw: rawWord,
            base: `${t.text}다`,
            pos: t.pos === "VA" ? "ADJ" : "VERB",
            isPast,
            isPermission,
          });
          hasMainPredicateInEojeol = true;
          i++;
          continue;
        }

        // (E) 일반 부사(MAG) 처리
        if (t.pos === "MAG" && t.text.length >= 1) {
          let advBase = t.text;
          if (advBase === "안") advBase = "아니다";
          else if (advBase === "못") advBase = "못하다";

          result.push({
            raw: rawWord,
            base: advBase,
            pos: "ADV",
          });
          i++;
          continue;
        }

        // (F) 감탄사(IC) 처리
        if (t.pos === "IC") {
          result.push({
            raw: rawWord,
            base: t.text,
            pos: "INTERJ",
          });
          i++;
          continue;
        }

        i++;
      }

      // 동반 격조사(랑/이랑/와/과)가 결합된 체언 어절 뒤에는 한국수어 어휘 '함께'를 추가
      if (emittedCompanionInEojeol) {
        result.push({
          raw: "함께",
          base: "함께",
          pos: "ADV",
        });
      }

      prevEojeolEndedWithEoA = currentEndsWithEoA;
    }

    if (result.length === 0 && clean) {
      result.push({
        raw: clean,
        base: clean.replace(/[?!.,~"']/g, "").trim(),
        pos: "UNKNOWN",
      });
    }

    return { tokens: result, elapsedMs: Date.now() - start };
  } catch {
    const fallbackTokens = extractFallbackTokens(clean);
    return { tokens: fallbackTokens, elapsedMs: Date.now() - start };
  }
}
