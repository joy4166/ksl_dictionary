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
  /** 허락/가능 연결어미(-어도/-아도 되다/될까요) 여부 */
  isPermission?: boolean;
}

let garuInstance: Garu | null = null;
let garuLoadingPromise: Promise<Garu> | null = null;

/**
 * Garu WASM 인스턴스를 한 번만 로드하여 재사용하는 싱글톤 로더
 */
export async function getGaru(): Promise<Garu> {
  if (garuInstance) return garuInstance;
  if (!garuLoadingPromise) {
    garuLoadingPromise = Garu.load()
      .then((instance) => {
        garuInstance = instance;
        return instance;
      })
      .catch((err) => {
        garuLoadingPromise = null;
        throw err;
      });
  }
  return garuLoadingPromise;
}

/**
 * 인사말, 높임 용언 활용형, 구어체 특수 예외 보정 테이블
 */
const SPECIAL_WORD_MAP: Record<string, { base: string; pos: string }> = {
  안녕하세요: { base: "안녕하세요", pos: "GREETING" },
  안녕하십니까: { base: "안녕하세요", pos: "GREETING" },
  안녕: { base: "안녕하세요", pos: "GREETING" },
  반갑습니다: { base: "반갑다", pos: "ADJ" },
  반가워요: { base: "반갑다", pos: "ADJ" },
  감사합니다: { base: "고맙다", pos: "ADJ" },
  고맙습니다: { base: "고맙다", pos: "ADJ" },
  고마워요: { base: "고맙다", pos: "ADJ" },
  죄송합니다: { base: "미안하다", pos: "ADJ" },
  죄송해요: { base: "미안하다", pos: "ADJ" },
  미안해요: { base: "미안하다", pos: "ADJ" },
  실례합니다: { base: "미안하다", pos: "ADJ" },
  // Garu가 드물게 NNG로 태깅하는 높임 활용형 보정
  크셔서: { base: "크다", pos: "ADJ" },
  크시네요: { base: "크다", pos: "ADJ" },
  크십니다: { base: "크다", pos: "ADJ" },
  드실래요: { base: "드시다", pos: "VERB" },
  드세요: { base: "드시다", pos: "VERB" },
  드셨어요: { base: "드시다", pos: "VERB" },
  주무세요: { base: "자다", pos: "VERB" },
  주무셨어요: { base: "자다", pos: "VERB" },
  편찮으세요: { base: "아프다", pos: "ADJ" },
  편찮으시다: { base: "아프다", pos: "ADJ" },
};

/**
 * 문장을 입력받아 조사/어미를 제거하고 순수 어휘의 기본형(어간+'-다', 명사) 및 문법 표지를 추출
 */
export async function extractMorphemesWithGaru(
  sentence: string
): Promise<{ tokens: GaruToken[]; elapsedMs: number }> {
  const start = Date.now();
  const clean = sentence.trim();
  if (!clean) return { tokens: [], elapsedMs: 0 };

  const garu = await getGaru();
  const rawAnalyzed = garu.analyze(clean);
  const analyzed: AnalyzeResult = Array.isArray(rawAnalyzed)
    ? rawAnalyzed[0]
    : rawAnalyzed;

  // start:end 단위로 형태소들을 어절 단위로 그룹화
  const groups = new Map<string, Token[]>();
  for (const t of analyzed.tokens) {
    const key = `${t.start}:${t.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const result: GaruToken[] = [];

  for (const [key, wordTokens] of groups.entries()) {
    const [wStart, wEnd] = key.split(":").map(Number);
    const rawWord = clean.slice(wStart, wEnd).trim();
    if (!rawWord) continue;

    const cleanRaw = rawWord.replace(/[?!.,~"']/g, "");

    // 과거 시제(었/았/였) 및 동반 격조사(랑/이랑/와/과) 감지
    const isPast =
      wordTokens.some(
        (t: Token) => t.pos === "EP" && /^(었|았|였|셨)$/.test(t.text)
      ) || /(셨어요|었어요|았어요|했어요|왔어요|갔어요|났어요|졌어요)$/.test(cleanRaw);

    const hasCompanionJosa = wordTokens.some(
      (t: Token) =>
        (t.pos === "JKB" || t.pos === "JC") && /^(랑|이랑|와|과)$/.test(t.text)
    );

    const isPermission = wordTokens.some(
      (t: Token) => t.pos === "EC" && /^(어도|아도|여도)$/.test(t.text)
    );

    // 특수 인사말/고정 표현 우선 매핑
    if (SPECIAL_WORD_MAP[cleanRaw]) {
      result.push({
        raw: rawWord,
        base: SPECIAL_WORD_MAP[cleanRaw].base,
        pos: SPECIAL_WORD_MAP[cleanRaw].pos,
        isPast,
      });
      continue;
    }

    // 1인칭 대명사 (저, 제가, 나, 내가) -> '나'
    if (/^(저|제|제가|저는|나|내|내가|나는)$/.test(cleanRaw)) {
      result.push({ raw: rawWord, base: "나", pos: "PRON" });
      continue;
    }

    // 높임 선어말어미 결합 '들+시' (드시다/드세요/드실래요) -> '드시다'로 통일
    const hasDeul = wordTokens.some((t: Token) => t.pos === "VV" && t.text === "들");
    const hasSi = wordTokens.some((t: Token) => t.pos === "EP" && t.text === "시");
    if (hasDeul && hasSi) {
      result.push({
        raw: rawWord,
        base: "드시다",
        pos: "VERB",
        isPast,
      });
      continue;
    }

    // 1. 명사 + 접미사(하다/되다/스럽다) 결합 용언 (예: 촬영 + 하 -> 촬영하다, 식사 + 하 -> 식사하다)
    const nng = wordTokens.find((t: Token) => t.pos === "NNG" || t.pos === "NNP");
    const xsv = wordTokens.find(
      (t: Token) =>
        t.pos === "XSV" || t.pos === "XSA" || (t.pos === "VV" && t.text === "하")
    );
    if (nng && xsv) {
      result.push({
        raw: rawWord,
        base: `${nng.text}하다`,
        pos: "VERB",
        isPast,
        isPermission,
      });
      continue;
    }

    // 2. 일반 동사 / 형용사 (VV, VA, VX) -> 어간 + '다' 원형 복원
    const verb = wordTokens.find(
      (t: Token) => t.pos === "VV" || t.pos === "VA" || t.pos === "VX"
    );
    if (verb) {
      // 순수 보조동사 '하(하다)'가 앞 단어와 분리되어 단독으로 나온 경우(예: '많이 하세요'),
      // 앞 어절이 음식/노력 등이면 유지하거나 생략
      if (verb.text === "하" && result.length > 0 && cleanRaw.length <= 3) {
        continue;
      }
      const stem = verb.text;
      const base = `${stem}다`;
      result.push({
        raw: rawWord,
        base,
        pos: verb.pos === "VA" ? "ADJ" : "VERB",
        isPast,
        isPermission,
      });
      continue;
    }

    // 3. 체언 (명사 NNG, NNP, 대명사 NP, 수사 NR) -> 조사 제외하고 체언 추출
    const noun = wordTokens.find(
      (t: Token) =>
        t.pos === "NNG" || t.pos === "NNP" || t.pos === "NP" || t.pos === "NR"
    );
    if (noun) {
      // 순수 의존명사(것, 거, 수, 줄, 데, 바, 편 등) 제외
      if (!/^(것|거|수|줄|데|바|곳|쪽|편|분)$/.test(noun.text)) {
        result.push({
          raw: rawWord,
          base: noun.text,
          pos: "NOUN",
          hasCompanionJosa,
        });
        if (hasCompanionJosa) {
          result.push({
            raw: "함께",
            base: "함께",
            pos: "ADV",
          });
        }
        continue;
      }
    }

    // 4. 일반 부사 (MAG) (예: 잘, 천천히, 빨리, 다시, 함께 등)
    const mag = wordTokens.find((t: Token) => t.pos === "MAG");
    if (mag && mag.text.length >= 1) {
      result.push({
        raw: rawWord,
        base: mag.text,
        pos: "ADV",
      });
      continue;
    }

    // 5. 기타 감탄사 (IC)
    const ic = wordTokens.find((t: Token) => t.pos === "IC");
    if (ic) {
      result.push({
        raw: rawWord,
        base: ic.text,
        pos: "INTERJ",
      });
      continue;
    }
  }

  // 만약 추출된 토큰이 하나도 없으면 문장 원문 전체를 단일 토큰으로 반환
  if (result.length === 0 && clean) {
    result.push({
      raw: clean,
      base: clean.replace(/[?!.,~"']/g, "").trim(),
      pos: "UNKNOWN",
    });
  }

  const elapsedMs = Date.now() - start;
  return { tokens: result, elapsedMs };
}
