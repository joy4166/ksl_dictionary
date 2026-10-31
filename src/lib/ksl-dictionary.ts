import dictionaryData from "@/data/dictionary.json";
import presetData from "@/data/preset-phrases.json";
import reverseMotionIndexData from "@/data/reverse-motion-index.json";
import {
  PhraseCategoryInfo,
  ReverseSearchCandidate,
  SavedPhraseItem,
  SignWordEntry,
} from "@/types/sign";

const LOCAL_DICTIONARY: SignWordEntry[] = dictionaryData as SignWordEntry[];
const REVERSE_MOTION_INDEX: Record<string, string[]> =
  reverseMotionIndexData as Record<string, string[]>;

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
 * 수어 역검색용 칩(Chip) -> 국립국어원 수형 설명 전문 용어 및 동작 원형 확장 테이블
 */
const REVERSE_CHIP_SYNONYMS: Record<string, string[]> = {
  주먹: ["주먹", "쥐다"],
  "검지(1지)": ["검지", "1지"],
  엄지: ["엄지", "5지"],
  "V자(2지)": ["V자", "2지", "1·2지", "중지"],
  "손바닥 폄": ["손바닥", "펴다"],
  "손가락 접기": ["구부리다", "접다", "굽히다"],
  양손: ["양손", "두 손", "두 주먹", "양옆", "동시"],
  한손: ["한손", "오른손", "오른 주먹"],
  "머리카락/이마": ["머리", "머리카락", "이마", "관자놀이"],
  "눈/코/입": ["눈", "코", "코끝", "입", "입술"],
  "볼/턱": ["볼", "뺨", "턱"],
  "귀/목": ["귀", "목", "관자놀이"],
  어깨: ["어깨"],
  "가슴 앞": ["가슴"],
  배: ["배", "복부"],
  "손목/손등": ["손목", "손등", "팔"],
  위아래로: ["위아래", "상하", "올리다", "내리다"],
  좌우로: ["좌우", "양옆"],
  "앞으로 내밀기": ["앞으로", "밖으로", "내밀다"],
  돌리기: ["돌리다", "원"],
  두드리기: ["두드리다", "치다", "톡톡", "통통"],
  "스치기/비비기": ["스치다", "쓸다", "비비다", "문지르다", "닦다"],
  흔들기: ["흔들다"],
  맞대기: ["맞대다", "붙이다", "마주"],
};

/**
 * 구어체 동작 서술어 활용형('두드렸어요', '비볐어요', '댔어요', '쳤어요' 등) 및 일상 신체 용어를
 * 국립국어원 수형 설명의 표준 기본형(Lemma) 및 전문 용어('1지', '상하' 등)로 정규화합니다.
 */
function normalizeMotionQueryToken(rawToken: string): string[] {
  const clean = rawToken.replace(/[?!.,~"']/g, "").trim();
  if (!clean) return [];

  // 1) 구어체 동작 동사 활용형 -> 표준 동사 원형(Lemma)으로 즉시 귀결 (활용형 어절 자체는 제외하여 중복 채점 방지)
  if (/^(두드리|두드렸|두드려|두드린|톡톡|통통|쳤|쳐요|치며|치고|치다|친다)/.test(clean)) {
    return ["두드리다", "치다", "톡톡"];
  }
  if (/^(비비|비볐|비벼|비빈|문지르|문질렀|문질러)/.test(clean)) {
    return ["비비다", "문지르다"];
  }
  if (/^(스치|스쳤|스쳐|쓸어|쓸었|쓸다|닦아|닦았)/.test(clean)) {
    return ["스치다", "쓸다"];
  }
  if (/^(맞댔|맞대|맞댄|마주|붙였|붙이|붙인|붙다)/.test(clean)) {
    return ["맞대다", "붙이다"];
  }
  if (/^(댔|대고|대며|대어|댄다|대다|닿았|닿다|닿게)/.test(clean)) {
    return ["대다", "닿다"];
  }
  if (/^(뗐|떼고|떼며|떼어|뗀다|떼다|벌렸|벌리|벌려)/.test(clean)) {
    return ["떼다", "벌리다"];
  }
  if (/^(내밀|내민|내밀었|내밀어|앞으로)/.test(clean)) {
    return ["내밀다", "앞으로"];
  }
  if (/^(올렸|올리|올려|올린)/.test(clean)) {
    return ["올리다"];
  }
  if (/^(내렸|내리|내려|내린)/.test(clean)) {
    return ["내리다"];
  }
  if (/^(돌렸|돌리|돌려|돌린)/.test(clean)) {
    return ["돌리다"];
  }
  if (/^(흔들|흔들었|흔들어)/.test(clean)) {
    return ["흔들다"];
  }
  if (/^(구부렸|구부리|구부려|굽혔|굽히|접었|접어|접다|접는)/.test(clean)) {
    return ["구부리다", "접다"];
  }
  if (/^(걸었|걸고|걸어|걸다)/.test(clean)) {
    return ["걸다"];
  }
  if (/^(폈|펴고|펴서|편다|펴다)/.test(clean)) {
    return ["펴다"];
  }
  if (/^(쥐었|쥐고|쥔다|쥐다)/.test(clean)) {
    return ["쥐다", "주먹"];
  }
  if (/^(세웠|세우|세워)/.test(clean)) {
    return ["세우다"];
  }

  // 2) 체언/방향어 조사 제거 및 국립국어원 수형 전문 표기 양방향 매핑
  const stem = clean.replace(
    /(에서|으로|에게|하고|하며|다가|에는|까지|부터|에|을|를|이|가|은|는|로|와|과|도|만)$/,
    ""
  );
  if (!stem) return [];

  if (/^(검지|집게손가락|일지|1지)$/.test(stem)) {
    return ["검지", "1지"];
  }
  if (/^(중지|가운데손가락|브이자|V자|2지)$/.test(stem)) {
    return ["V자", "2지", "1·2지"];
  }
  if (/^(새끼손가락|소지|4지)$/.test(stem)) {
    return ["새끼손가락", "4지"];
  }
  if (/^(엄지|엄지손가락|5지)$/.test(stem)) {
    return ["엄지", "5지"];
  }
  if (/^(코끝|코)$/.test(stem)) {
    return ["코", "코끝"];
  }
  if (/^(입술|입가|입)$/.test(stem)) {
    return ["입", "입술", "입가"];
  }
  if (/^(위아래|위아래로|상하|상하로)$/.test(clean) || /^(위아래|상하)$/.test(stem)) {
    return ["위아래", "상하"];
  }
  if (/^(앞|밖)$/.test(stem)) {
    return ["내밀다", "앞으로"];
  }

  // 일반 동사 어미(~어요, ~았어요 등)로 끝나는 미분류 서술어는 Garu 원형 토큰이 처리하므로 제외
  if (/(어요|아요|였어요|었어요|았어요|네요|세요)$/.test(clean)) {
    return [];
  }

  return [stem];
}

/**
 * 수어 음운론에서 가장 제약력이 높은 신체 위치(Location, 수위) 어휘 집합
 */
const SPECIFIC_BODY_LOCATIONS = new Set([
  "코",
  "코끝",
  "입",
  "입술",
  "입가",
  "볼",
  "뺨",
  "턱",
  "눈",
  "귀",
  "목",
  "이마",
  "머리",
  "관자놀이",
  "얼굴",
  "어깨",
  "가슴",
  "배",
  "복부",
  "손목",
  "손등",
  "손바닥",
  "팔",
  "허벅지",
  "다리",
]);

/**
 * 변별력이 높은 핵심 동작 동사 및 세부 손가락 수형 가중치 판별
 */
const HIGH_DISCRIMINATION_MOTIONS = new Set([
  "비비다",
  "문지르다",
  "두드리다",
  "치다",
  "톡톡",
  "스치다",
  "쓸다",
  "흔들다",
  "구부리다",
  "접다",
  "돌리다",
  "내밀다",
  "맞대다",
  "붙이다",
  "떼다",
  "벌리다",
  "걸다",
  "대다",
  "올리다",
  "내리다",
  "검지",
  "1지",
  "엄지",
  "5지",
  "V자",
  "2지",
  "새끼손가락",
  "4지",
]);

const LOW_DISCRIMINATION_GENERIC = new Set([
  "손",
  "오른손",
  "왼손",
  "양손",
  "두",
  "한",
  "번",
  "주먹",
  "펴다",
  "향하다",
]);

/**
 * 손동작 묘사 텍스트, 빠른 선택 칩(Chip), 그리고 Garu 형태소 원형 배열을 결합한 정밀 역검색 스코어러
 */
export function searchReverseByMotionLocal(
  descriptionQuery: string,
  selectedChips: string[] = [],
  garuLemmas: string[] = []
): ReverseSearchCandidate[] {
  const cleanQuery = descriptionQuery.trim();
  const hasQuery = cleanQuery.length > 0 || selectedChips.length > 0;

  if (!hasQuery) {
    return LOCAL_DICTIONARY.slice(0, 8).map((sign) => ({
      sign,
      score: 50,
      matchReason: "자주 찾는 일상 수어 동작입니다.",
      matchedKeywords: sign.keywords.slice(0, 3),
    }));
  }

  // 사용자 입력 어절 + Garu 형태소 원형에서 표준 수형·동작 특징 추출
  const rawTokens = [
    ...cleanQuery
      .split(/[\s,./?!]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 1),
    ...garuLemmas,
  ];

  const queryFeatureGroups: Array<{ label: string;variants: string[] }> = [];
  const seenLabels = new Set<string>();

  for (const rawTok of rawTokens) {
    const variants = normalizeMotionQueryToken(rawTok);
    if (variants.length === 0) continue;
    const canonicalLabel = variants[0];
    if (seenLabels.has(canonicalLabel)) continue;
    seenLabels.add(canonicalLabel);
    queryFeatureGroups.push({ label: canonicalLabel, variants });
  }

  const queriedBodyLocations = queryFeatureGroups.filter((g) =>
    SPECIFIC_BODY_LOCATIONS.has(g.label)
  );

  const scoredCandidates: Array<ReverseSearchCandidate & { rawScore: number }> = [];

  for (const sign of LOCAL_DICTIONARY) {
    let rawScore = 0;
    let matchedLocationCount = 0;
    const matchedChipLabels: string[] = [];
    const matchedBodyOrShape: string[] = [];
    const matchedActions: string[] = [];

    const searchableText = `${sign.signDescription} ${sign.actionSummary}`;
    const indexedLemmas = new Set(REVERSE_MOTION_INDEX[sign.id] || []);

    // 1) 선택된 빠른 칩(Chip) 매칭 채점
    for (const chip of selectedChips) {
      const chipVariants = REVERSE_CHIP_SYNONYMS[chip] || [
        chip.replace(/\(.*\)/, "").trim(),
      ];
      const isMatched = chipVariants.some(
        (v) => indexedLemmas.has(v) || searchableText.includes(v)
      );
      if (isMatched) {
        rawScore += 28;
        matchedChipLabels.push(chip);
      }
    }

    // 2) 자유 텍스트 묘사 형태소·원형 매칭 채점
    for (const group of queryFeatureGroups) {
      const matchedVariant = group.variants.find((v) => {
        if (indexedLemmas.has(v)) return true;
        // '입', '코', '배', '눈', '귀', '목' 등 1글자 신체 부위는 다른 글자('입다', '배웠')의 일부로 오매칭되지 않도록 단어 경계 확인
        if (v.length === 1) {
          const boundaryRegex = new RegExp(`(^|[\\s,·(])${v}([에을를으로의과와\\s,.)]|$)`);
          return boundaryRegex.test(searchableText);
        }
        return searchableText.includes(v);
      });

      if (matchedVariant) {
        const isBodyLocation = SPECIFIC_BODY_LOCATIONS.has(group.label);
        const isHighDisc = group.variants.some((v) =>
          HIGH_DISCRIMINATION_MOTIONS.has(v)
        );
        const isGeneric = LOW_DISCRIMINATION_GENERIC.has(group.label);

        if (isBodyLocation) {
          rawScore += 36;
          matchedLocationCount += 1;
        } else if (isHighDisc) {
          rawScore += 28;
        } else if (isGeneric) {
          rawScore += 5;
        } else {
          rawScore += 16;
        }

        if (group.label.endsWith("다") || /^(톡톡|위아래|좌우|앞으로)$/.test(group.label)) {
          matchedActions.push(group.label);
        } else {
          matchedBodyOrShape.push(group.label);
        }
      }
    }

    if (rawScore > 0) {
      const allMatched = Array.from(
        new Set([...matchedChipLabels, ...matchedBodyOrShape, ...matchedActions])
      );
      if (matchedActions.length > 0 && matchedBodyOrShape.length > 0) {
        rawScore += 15;
      }
      // 사용자가 구체적인 신체 부위(예: 코, 입, 손목, 가슴 등)를 명시했으나 해당 부위와 전혀 무관한 수어인 경우 후순위 감점
      if (queriedBodyLocations.length > 0 && matchedLocationCount === 0) {
        rawScore = Math.min(48, Math.floor(rawScore * 0.45));
      }
      const displayScore = Math.min(99, rawScore);

      const reasonParts: string[] = [];
      if (matchedBodyOrShape.length > 0) {
        reasonParts.push(`수형·부위(${matchedBodyOrShape.join(", ")})`);
      }
      if (matchedActions.length > 0) {
        reasonParts.push(`핵심 동작(${matchedActions.join(", ")})`);
      }
      if (matchedChipLabels.length > 0 && reasonParts.length === 0) {
        reasonParts.push(`선택 태그(${matchedChipLabels.join(", ")})`);
      }

      const matchReason =
        reasonParts.length > 0
          ? `${reasonParts.join(" 및 ")} 특징이 수형 설명과 ${displayScore}% 일치합니다.`
          : `수형 설명 내 '${allMatched.join(", ")}' 동작 특징이 일치합니다.`;

      scoredCandidates.push({
        sign,
        score: displayScore,
        rawScore,
        matchReason,
        matchedKeywords: allMatched,
      });
    }
  }

  return scoredCandidates
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 12)
    .map(({ rawScore: _rawScore, ...rest }) => {
      void _rawScore;
      return rest;
    });
}
