import dictionaryData from "@/data/dictionary.json";
import presetData from "@/data/preset-phrases.json";
import {
  PhraseCategoryInfo,
  ReverseSearchCandidate,
  SavedPhraseItem,
  SignWordEntry,
} from "@/types/sign";

const LOCAL_DICTIONARY: SignWordEntry[] = dictionaryData as SignWordEntry[];

/** 실시간 국립국어원 한국수어사전 조회 인메모리 캐시 */
const LIVE_SLDICT_CACHE = new Map<string, SignWordEntry[]>();

/**
 * 전체 로컬 수어 사전 데이터 반환
 */
export function getAllDictionaryEntries(): SignWordEntry[] {
  return LOCAL_DICTIONARY;
}

/**
 * 고유 ID로 수어 단어 단건 조회
 */
export function getSignById(id: string): SignWordEntry | undefined {
  const local = LOCAL_DICTIONARY.find((entry) => entry.id === id);
  if (local) return local;
  for (const entries of LIVE_SLDICT_CACHE.values()) {
    const found = entries.find((e) => e.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * 여러 ID 배열을 수어 엔트리 배열로 변환
 */
export function getSignsByIds(ids: string[]): SignWordEntry[] {
  return ids
    .map((id) => getSignById(id))
    .filter((item): item is SignWordEntry => Boolean(item));
}

/**
 * 주간보호시설 기본 카테고리 및 프리셋 문장 목록 반환
 */
export function getPresetPhrasebook(): {
  categories: PhraseCategoryInfo[];
  phrases: SavedPhraseItem[];
} {
  return {
    categories: presetData.categories as PhraseCategoryInfo[],
    phrases: presetData.phrases as SavedPhraseItem[],
  };
}

/**
 * 한국어 높임말·한자어 기본형(Lemma) -> 직관적인 표준 한국수어(KSL) 기본 표제어 유의어 사전
 * (활용형/어절 하드코딩 없이 순수 사전 기본형 간의 유의어 매핑만 정의)
 */
const CANONICAL_GLOSS_ALIASES: Record<string, string[]> = {
  // 식사/음료 높임말 및 한자어 기본형
  드시다: ["먹다", "식사", "마시다"],
  잡수시다: ["먹다"],
  식사하다: ["먹다", "밥", "점심"],
  식사: ["밥", "먹다", "점심"],
  음식: ["음식", "밥", "먹다"],
  한잔: ["마시다", "물"],
  복약: ["약"],
  복용하다: ["약", "먹다"],
  // 수면/건강 높임말 및 한자어 기본형
  주무시다: ["자다"],
  취침하다: ["자다"],
  취침: ["자다"],
  편찮으시다: ["아프다"],
  편찮다: ["아프다"],
  불편하다: ["아프다", "피곤하다"],
  통증: ["아프다"],
  침침하다: ["어둡다", "아프다", "모르다"],
  기운: ["피곤하다", "힘"],
  더위: ["덥다"],
  추위: ["춥다"],
  겁: ["무섭다", "놀라다"],
  // 호칭/존칭 명사 기본형
  생신: ["생일"],
  연세: ["나이", "어르신"],
  춘추: ["나이", "어르신"],
  나이: ["어르신", "생일"],
  성함: ["이름"],
  댁: ["집"],
  조모: ["할머니"],
  조부: ["할아버지"],
  // 촬영/행사/일상 한자어 -> 쉬운 KSL 기본형
  촬영하다: ["찍다", "사진", "영상"],
  촬영: ["찍다", "사진", "영상"],
  동영상: ["영상"],
  비디오: ["영상"],
  경진대회: ["대회"],
  시합: ["대회"],
  공모전: ["대회"],
  참석하다: ["참가하다"],
  참여하다: ["참가하다"],
  출전하다: ["참가하다"],
  참가: ["참가하다"],
  참여: ["참가하다"],
  외출하다: ["나가다"],
  외출: ["나가다"],
  // 부사/시간 기본형
  같이: ["함께"],
  다같이: ["함께"],
  더불어: ["함께"],
  정말: ["많이", "맞다"],
  진짜: ["맞다", "많이"],
  너무: ["많이"],
  매우: ["많이"],
  아주: ["많이"],
  엄청: ["많이"],
  무척: ["많이"],
  이제: ["지금"],
  이제야: ["지금"],
  가능: ["가능하다"],
  되다: ["가능하다", "괜찮다"],
  // 일상 동작 높임말/한자어 기본형
  안녕하다: ["안녕하세요"],
  안녕: ["안녕하세요"],
  말씀: ["말하다"],
  말씀하시다: ["말하다"],
  소식: ["말하다", "편지", "듣다"],
  주다: ["드리다"],
  계시다: ["있다"],
  안계시다: ["없다"],
  들어가시다: ["돌아가다", "가다"],
  귀가하다: ["돌아가다", "집"],
  산책하다: ["산책", "걷다"],
  체조하다: ["체조", "운동"],
  운동하다: ["운동", "체조"],
  노래하다: ["노래"],
  공부하다: ["공부", "배우다"],
  일하다: ["근무", "노동"],
  일: ["근무", "노동"],
  목욕하다: ["목욕", "씻다"],
  세수하다: ["씻다"],
  인사하다: ["안녕하세요", "인사"],
  감사하다: ["고맙다"],
  죄송하다: ["미안하다"],
  사과하다: ["미안하다"],
  실례하다: ["미안하다"],
  도와드리다: ["도와주다"],
  돕다: ["도와주다"],
  // 의문사 기본형
  뭐: ["무엇"],
  무슨: ["무엇"],
};

/**
 * 검색어 배열을 정제하고 괄호/슬래시 분리 및 어간·유의어 후보를 확장합니다.
 * - 정규화 별칭(표준 KSL 기본 수어)을 최우선 순위로 배치합니다.
 */
export function expandAndSanitizeQueryTerms(rawTerms: string[]): string[] {
  const expanded: string[] = [];
  const pushUnique = (val: string) => {
    const clean = val.trim();
    if (clean && !expanded.includes(clean)) {
      expanded.push(clean);
    }
  };

  for (const raw of rawTerms) {
    if (!raw) continue;
    const parts = raw
      .split(/[(),/·|]+/)
      .map((p) => p.replace(/[\[\]"'?!.~]/g, "").trim())
      .filter(Boolean);

    for (const part of parts) {
      // 1) 기본형 유의어 별칭이 있으면 최우선 순위로 추가
      if (CANONICAL_GLOSS_ALIASES[part]) {
        for (const alias of CANONICAL_GLOSS_ALIASES[part]) {
          pushUnique(alias);
        }
      }

      pushUnique(part);

      // 2) '~하다' 동사 <-> 명사 어간 양방향 확장 (2글자 이상 어간)
      if (part.endsWith("하다") && part.length >= 3) {
        const stem = part.slice(0, -2);
        if (CANONICAL_GLOSS_ALIASES[stem]) {
          CANONICAL_GLOSS_ALIASES[stem].forEach(pushUnique);
        }
        pushUnique(stem);
      } else if (part.length >= 2 && !part.endsWith("다")) {
        if (CANONICAL_GLOSS_ALIASES[`${part}하다`]) {
          CANONICAL_GLOSS_ALIASES[`${part}하다`].forEach(pushUnique);
        }
        pushUnique(`${part}하다`);
      }
    }
  }

  return expanded;
}

/**
 * 표제어 및 유의어 리스트로 로컬 사전에서 후보군(동음이의어 포함) 정밀 검색
 * - 1글자 단어('약', '물', '잘' 등)가 다른 복합어('약속', '물건')에 오매칭되지 않도록 정확 일치 위주로 동작
 */
export function searchLocalDictionary(queryTerms: string[]): SignWordEntry[] {
  const normalizedQueries = expandAndSanitizeQueryTerms(queryTerms);

  if (normalizedQueries.length === 0) return [];

  const matchedMap = new Map<string, { entry: SignWordEntry; priority: number }>();

  for (const entry of LOCAL_DICTIONARY) {
    let bestPriority = 0;

    for (let qIdx = 0; qIdx < normalizedQueries.length; qIdx++) {
      const q = normalizedQueries[qIdx];
      // 앞쪽 검색어(1순위 표제어)일수록 미세 가산점 부여
      const orderBonus = Math.max(0, 5 - qIdx);

      // 1순위: 대표 표제어 완전 일치 (괄호 구분 표제어도 동급 인정, 예: '(신체의)눈' -> '눈')
      const cleanWord = entry.word.replace(/\(.*?\)/g, "").trim();
      if (entry.word === q || cleanWord === q) {
        bestPriority = Math.max(bestPriority, 100 + orderBonus);
      }
      // 2순위: 유의어/대응표현 완전 일치
      else if (entry.synonyms?.some((syn) => syn === q || syn.replace(/\(.*?\)/g, "").trim() === q)) {
        bestPriority = Math.max(bestPriority, 90 + orderBonus);
      }
      // 3순위: 어간/기본형 일치 (2글자 이상 표제어만 허용, 예: "시작하다" <-> "시작")
      else if (
        q.length >= 2 &&
        entry.word.length >= 2 &&
        (entry.word.replace(/하다$/, "") === q.replace(/하다$/, "") ||
          entry.synonyms?.some(
            (syn) =>
              syn.length >= 2 &&
              syn.replace(/하다$/, "") === q.replace(/하다$/, "")
          ))
      ) {
        bestPriority = Math.max(bestPriority, 80 + orderBonus);
      }
    }

    if (bestPriority > 0) {
      const existing = matchedMap.get(entry.id);
      if (!existing || existing.priority < bestPriority) {
        matchedMap.set(entry.id, { entry, priority: bestPriority });
      }
    }
  }

  return Array.from(matchedMap.values())
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.entry);
}

/**
 * 국립국어원 한국수어사전(sldict.korean.go.kr) 실시간 웹 검색 및 파싱 엔진
 * - 별도 API 키 없이도 모든 한국어 단어에 대해 실제 국립국어원 수어 동영상(.mp4),
 *   수형 사진(.jpg), 수형 설명(signDescription)을 실시간으로 가져옵니다.
 */
export async function fetchLiveFromSldict(
  keyword: string
): Promise<SignWordEntry[]> {
  const cleanKw = keyword.trim();
  if (!cleanKw) return [];

  if (LIVE_SLDICT_CACHE.has(cleanKw)) {
    return LIVE_SLDICT_CACHE.get(cleanKw)!;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const searchUrl = `https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=${encodeURIComponent(
      cleanKw
    )}`;
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return [];
    const html = await res.text();

    const blocks = html.split("<!--01_list-->").slice(1);
    const rawCandidates: Array<{
      originNo: string;
      topCategory: string;
      thumbUrl: string;
      videoUrl: string;
      rawTitle: string;
      rawDef: string;
    }> = [];

    for (const block of blocks) {
      const fnMatch = block.match(
        /fnSearchContentsView\s*\(\s*'(\d+)'\s*,\s*'([A-Z]+)'/
      );
      const thumbMatch = block.match(
        /src=["'](http[^"']+MOV[^"']+_215X161\.jpg)["']/
      );
      const titMatch = block.match(
        /<span class="tit">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
      );
      const infoMatch = block.match(/<cite>\s*<span[^>]*>([\s\S]*?)<\/span>/);

      if (fnMatch && thumbMatch && titMatch) {
        const originNo = fnMatch[1];
        const topCategory = fnMatch[2];
        const thumbUrl = thumbMatch[1].replace(/^http:\/\//, "https://");
        const videoUrl = thumbUrl.replace("_215X161.jpg", "_700X466.mp4");
        const rawTitle = titMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const rawDef = infoMatch
          ? infoMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";

        rawCandidates.push({
          originNo,
          topCategory,
          thumbUrl,
          videoUrl,
          rawTitle,
          rawDef,
        });
      }
    }

    if (rawCandidates.length === 0) {
      LIVE_SLDICT_CACHE.set(cleanKw, []);
      return [];
    }

    // 표제어/대응표현 완전 일치(exact match) 여부를 계산하는 헬퍼
    const isExactTitleMatch = (rawTitle: string) => {
      const words = rawTitle.split(",").map((w) => w.trim());
      return words.some(
        (w) => w === cleanKw || w.replace(/\(.*?\)/g, "").trim() === cleanKw
      );
    };

    // 1글자 검색어(예: '일', '겁' 등)는 부분 문자열 일치로 엉뚱한 복합어('일월 일일', '기겁')가
    // 선택되는 것을 막기 위해 정확히 일치하는 표제어가 있는 후보만 허용
    const filteredCandidates =
      cleanKw.length === 1
        ? rawCandidates.filter((c) => isExactTitleMatch(c.rawTitle))
        : rawCandidates;

    if (filteredCandidates.length === 0) {
      LIVE_SLDICT_CACHE.set(cleanKw, []);
      return [];
    }

    // 1순위: 검색어와 표제어가 정확히 일치하는 항목 우선
    // 2순위: 일상용어(CTE) 카테고리 우선
    const sorted = [...filteredCandidates].sort((a, b) => {
      const aExact = isExactTitleMatch(a.rawTitle) ? 1 : 0;
      const bExact = isExactTitleMatch(b.rawTitle) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aIsCte = a.topCategory === "CTE" ? 1 : 0;
      const bIsCte = b.topCategory === "CTE" ? 1 : 0;
      return bIsCte - aIsCte;
    });

    // 상위 최대 3개 후보의 상세 페이지(수형 설명 & 수형 사진) 병렬 조회
    const topItems = sorted.slice(0, 3);
    const entries: SignWordEntry[] = await Promise.all(
      topItems.map(async (item, idx) => {
        let signDescription = "";
        let imageUrls: string[] = [item.thumbUrl];
        let synonyms = item.rawTitle
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        try {
          const detailUrl = `https://sldict.korean.go.kr/front/sign/signContentsView.do?origin_no=${item.originNo}&top_category=${item.topCategory}`;
          const dRes = await fetch(detailUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          if (dRes.ok) {
            const dHtml = await dRes.text();
            const descMatch = dHtml.match(
              /수형 설명<\/dt>\s*<dd>([\s\S]*?)<\/dd>/
            );
            if (descMatch) {
              signDescription = descMatch[1]
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim();
            }
            const imgs = [
              ...dHtml.matchAll(
                /src=["'](http[^"']+IMG[^"']+_700X466\.jpg)["']/g
              ),
            ].map((m) => m[1].replace(/^http:\/\//, "https://"));
            if (imgs.length > 0) {
              imageUrls = imgs;
            }
            const corrMatch = dHtml.match(
              /한국어 대응표현<\/span>\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/
            );
            if (corrMatch) {
              synonyms = corrMatch[1]
                .replace(/<[^>]+>/g, "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
        } catch {
          // 상세 페이지 실패 시 기본 썸네일 및 제목 유지
        }

        const exactSyn = synonyms.find(
          (s) => s === cleanKw || s.replace(/\(.*?\)/g, "").trim() === cleanKw
        );
        const primaryWord =
          exactSyn ||
          synonyms[0] ||
          item.rawTitle.split(",")[0].trim() ||
          cleanKw;
        const meaningText =
          item.rawDef ||
          (synonyms.length > 1
            ? `대응표현: ${synonyms.join(", ")}`
            : `${primaryWord} 수어 표현`);
        const finalDesc =
          signDescription ||
          `'${primaryWord}'의 국립국어원 한국수어사전 동작입니다. 영상을 재생하여 확인해 보세요.`;

        return {
          id: `sldict_${item.originNo}`,
          word: primaryWord,
          senseIndex: idx + 1,
          meaning: meaningText,
          category: item.topCategory === "CTE" ? "국립국어원 일상수어" : "국립국어원 전문수어",
          signDescription: finalDesc,
          actionSummary: finalDesc,
          handShapeHint: "👐",
          imageUrls,
          videoUrl: item.videoUrl,
          keywords: Array.from(new Set([cleanKw, ...synonyms])),
          synonyms,
        };
      })
    );

    LIVE_SLDICT_CACHE.set(cleanKw, entries);
    return entries;
  } catch (err) {
    console.warn(`[fetchLiveFromSldict] '${cleanKw}' 조회 실패:`, err);
    LIVE_SLDICT_CACHE.set(cleanKw, []);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 하이브리드 사전 검색기 (대표 표제어 우선 보장 아키텍처)
 * 1순위: 대표 표제어(primaryTerm) 및 그 정규화 별칭이 로컬 핵심 사전(105종)에 있는지 우선 확인
 * 2순위: 로컬 사전에 대표 표제어가 없으면, 부차적 유의어(예: '처음'의 유의어 '시작' -> '시작하다')에 가로채이지 않도록
 *        국립국어원 한국수어사전(sldict.korean.go.kr)에서 대표 표제어를 먼저 실시간 검색!
 * 3순위: 대표 표제어 실시간 검색 결과 뒤에 로컬 유의어 후보를 대안 수어(alternativeSigns)로 병합하거나, 없을 때만 유의어 폴백 수행
 */
export interface HybridSearchResultMeta {
  entries: SignWordEntry[];
  source: "local" | "live_crawler" | "fallback";
  durationMs: number;
}

/**
 * 하이브리드 사전 검색기 (소요 시간 및 출처 메타데이터 포함)
 */
export async function searchHybridDictionaryWithMeta(
  queryTerms: string[]
): Promise<HybridSearchResultMeta> {
  const start = Date.now();
  const cleanTerms = queryTerms.map((q) => q.trim()).filter(Boolean);
  if (cleanTerms.length === 0) {
    return { entries: [], source: "fallback", durationMs: 0 };
  }

  const primaryTerm = cleanTerms[0];

  // 1순위: 대표 표제어(primaryTerm) 및 그 정규화 기본형 별칭이 로컬 사전에 직접 일치하는지 확인
  const primaryLocalMatches = searchLocalDictionary([primaryTerm]);
  const primaryCanonicalSet = new Set<string>([
    primaryTerm,
    ...(CANONICAL_GLOSS_ALIASES[primaryTerm] || []),
  ]);
  const exactLocalMatches = primaryLocalMatches.filter((e) => {
    const cleanW = e.word.replace(/\(.*?\)/g, "").trim();
    return primaryCanonicalSet.has(e.word) || primaryCanonicalSet.has(cleanW);
  });
  const allLocalSynonymMatches = searchLocalDictionary(cleanTerms);

  if (exactLocalMatches.length > 0) {
    const merged = [...exactLocalMatches];
    for (const synMatch of allLocalSynonymMatches) {
      if (!merged.some((m) => m.id === synMatch.id)) {
        merged.push(synMatch);
      }
    }
    return {
      entries: merged,
      source: "local",
      durationMs: Date.now() - start,
    };
  }

  // 2순위: 대표 표제어가 로컬 사전에 없다면, 국립국어원(sldict) 실시간 검색을 먼저 수행 (불필요한 '~하다' 파생어 제외, 최대 2개)
  const primaryExpanded = expandAndSanitizeQueryTerms([primaryTerm])
    .filter((term) => term === primaryTerm || !term.endsWith("하다") || CANONICAL_GLOSS_ALIASES[primaryTerm]?.includes(term))
    .slice(0, 2);
  const livePrimaryResults = await Promise.all(
    primaryExpanded.map((pTerm) => fetchLiveFromSldict(pTerm))
  );

  for (const livePrimaryMatches of livePrimaryResults) {
    if (livePrimaryMatches.length > 0) {
      const merged = [...livePrimaryMatches];
      // 로컬 사전에 있던 유의어는 대안 수어 후보로 뒤에 추가
      for (const synMatch of allLocalSynonymMatches) {
        if (!merged.some((m) => m.id === synMatch.id)) {
          merged.push(synMatch);
        }
      }
      return {
        entries: merged,
        source: "live_crawler",
        durationMs: Date.now() - start,
      };
    }
  }

  // 3순위: 국립국어원에도 대표 표제어가 없을 때만 로컬 유의어 매칭 또는 확장 유의어 실시간 검색으로 폴백
  if (allLocalSynonymMatches.length > 0) {
    return {
      entries: allLocalSynonymMatches,
      source: "local",
      durationMs: Date.now() - start,
    };
  }

  const expandedAll = expandAndSanitizeQueryTerms(cleanTerms.slice(1)).slice(0, 2);
  if (expandedAll.length > 0) {
    const liveResults = await Promise.all(
      expandedAll.map((term) => fetchLiveFromSldict(term))
    );
    for (const liveMatches of liveResults) {
      if (liveMatches.length > 0) {
        return {
          entries: liveMatches,
          source: "live_crawler",
          durationMs: Date.now() - start,
        };
      }
    }
  }

  return {
    entries: [],
    source: "fallback",
    durationMs: Date.now() - start,
  };
}

export async function searchHybridDictionary(
  queryTerms: string[]
): Promise<SignWordEntry[]> {
  const result = await searchHybridDictionaryWithMeta(queryTerms);
  return result.entries;
}

/**
 * 손동작 묘사 텍스트 및 빠른 선택 칩(Chip) 기반 로컬 역검색 스코어러
 */
export function searchReverseByMotionLocal(
  descriptionQuery: string,
  selectedChips: string[] = []
): ReverseSearchCandidate[] {
  const cleanQuery = descriptionQuery.trim();
  const tokens = [
    ...selectedChips,
    ...cleanQuery
      .split(/[\s,./?!]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 1),
  ];

  if (tokens.length === 0) {
    return LOCAL_DICTIONARY.slice(0, 8).map((sign) => ({
      sign,
      score: 50,
      matchReason: "자주 찾는 일상 수어 동작입니다.",
      matchedKeywords: sign.keywords.slice(0, 3),
    }));
  }

  const scoredCandidates: ReverseSearchCandidate[] = [];

  for (const sign of LOCAL_DICTIONARY) {
    let score = 0;
    const matchedKeywords = new Set<string>();
    const searchableText = `${sign.signDescription} ${sign.actionSummary} ${sign.keywords.join(" ")} ${sign.word}`;

    for (const chip of selectedChips) {
      const coreChip = chip.replace(/\(.*\)/, "").trim();
      if (
        sign.keywords.some((k) => k.includes(coreChip) || coreChip.includes(k)) ||
        searchableText.includes(coreChip)
      ) {
        score += 25;
        matchedKeywords.add(chip);
      }
    }

    for (const token of cleanQuery.split(/[\s,./?!]+/).filter((t) => t.length >= 1)) {
      const stem = token.replace(
        /(에서|으로|에게|하고|하며|다가|에|을|를|이|가|은|는|로|와|과)$/,
        ""
      );
      if (stem.length === 0) continue;

      if (
        sign.signDescription.includes(stem) ||
        sign.actionSummary.includes(stem)
      ) {
        score += 20;
        matchedKeywords.add(stem);
      } else if (
        sign.keywords.some((k) => k.includes(stem) || stem.includes(k))
      ) {
        score += 15;
        matchedKeywords.add(stem);
      }
    }

    if (score > 0) {
      const normalizedScore = Math.min(99, score);
      const kwList = Array.from(matchedKeywords);
      scoredCandidates.push({
        sign,
        score: normalizedScore,
        matchReason: `수형 설명 내 '${kwList.join(", ")}' 동작 특징이 일치합니다.`,
        matchedKeywords: kwList,
      });
    }
  }

  return scoredCandidates.sort((a, b) => b.score - a.score).slice(0, 12);
}
