import { getPresetPhrasebook, getSignsByIds } from "@/lib/ksl-dictionary";
import {
  PhraseCategoryId,
  SavedPhraseItem,
  TranslatedSignToken,
  TranslationResult,
} from "@/types/sign";

const STORAGE_KEY = "my_sign_dictionary_custom_phrases_v1";
const RECENT_SEARCHES_KEY = "ksl_translate_recent_sentences_v1";
const MAX_RECENT_SEARCHES = 8;

/**
 * 브라우저 localStorage에 저장된 최근 검색(번역) 문장 목록 조회
 */
export function getRecentSearchesFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * 최근 검색(번역)한 문장을 localStorage에 추가 (중복 제거 및 최신순 정렬)
 */
export function addRecentSearchToStorage(sentence: string): string[] {
  const clean = sentence.trim();
  if (!clean) return getRecentSearchesFromStorage();

  const current = getRecentSearchesFromStorage();
  const updated = [
    clean,
    ...current.filter((item) => item.trim() !== clean),
  ].slice(0, MAX_RECENT_SEARCHES);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota errors
    }
  }
  return updated;
}

/**
 * 특정 최근 검색 문장 개별 삭제
 */
export function removeRecentSearchFromStorage(sentence: string): string[] {
  const clean = sentence.trim();
  const current = getRecentSearchesFromStorage();
  const updated = current.filter((item) => item.trim() !== clean);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}

/**
 * 최근 검색 문장 전체 초기화
 */
export function clearRecentSearchesFromStorage(): string[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * 브라우저 localStorage에 저장된 사용자 커스텀 문장 목록 조회
 */
export function getCustomPhrasesFromStorage(): SavedPhraseItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("localStorage 문장함 로드 실패:", err);
    return [];
  }
}

/**
 * 기본 프리셋 문장 + 사용자 커스텀 저장 문장 통합 조회
 */
export function getAllSavedPhrases(): SavedPhraseItem[] {
  const { phrases: presets } = getPresetPhrasebook();
  const custom = getCustomPhrasesFromStorage();
  return [...custom, ...presets];
}

/**
 * 특정 문장이 이미 문장함에 저장되어 있는지 확인
 */
export function isSentenceSaved(sentence: string): boolean {
  const normalized = sentence.trim();
  return getAllSavedPhrases().some((item) => item.title.trim() === normalized);
}

/**
 * 번역 결과(TranslationResult)를 원하는 상황별 카테고리에 저장
 */
export function savePhraseToStorage(
  result: TranslationResult,
  categoryId: PhraseCategoryId = "greeting"
): SavedPhraseItem {
  const customList = getCustomPhrasesFromStorage();
  const cleanTitle = result.inputSentence.trim();

  const existingIndex = customList.findIndex(
    (item) => item.title.trim() === cleanTitle
  );

  const newItem: SavedPhraseItem = {
    id: `custom_${Date.now()}`,
    categoryId,
    title: cleanTitle,
    nonManualTip: result.nonManualTip,
    signIds: result.kslSequence.map((t) => t.selectedSign.id),
    cachedResult: result,
    isPreset: false,
    createdAt: new Date().toISOString(),
  };

  let updated: SavedPhraseItem[];
  if (existingIndex >= 0) {
    updated = [...customList];
    updated[existingIndex] = newItem;
  } else {
    updated = [newItem, ...customList];
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn("localStorage 문장함 저장 실패:", err);
    }
  }

  return newItem;
}

/**
 * 사용자 커스텀 문장 삭제
 */
export function deleteCustomPhraseFromStorage(id: string): SavedPhraseItem[] {
  const customList = getCustomPhrasesFromStorage();
  const updated = customList.filter((item) => item.id !== id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn("localStorage 문장 삭제 실패:", err);
    }
  }
  return updated;
}

/**
 * SavedPhraseItem을 즉시 카드 뷰에서 렌더링할 수 있도록 TranslationResult 형태로 변환 (0.1초 즉시 열람용)
 */
export function convertSavedPhraseToTranslationResult(
  item: SavedPhraseItem
): TranslationResult {
  if (item.cachedResult) {
    return item.cachedResult;
  }

  const signs = getSignsByIds(item.signIds);
  const kslSequence: TranslatedSignToken[] = signs.map((sign) => ({
    originalPart: sign.word,
    kslGloss: sign.word,
    selectedSign: sign,
    alternativeSigns: [],
  }));

  return {
    inputSentence: item.title,
    kslSequence,
    nonManualTip: item.nonManualTip,
    glossSummary: signs.map((s) => `[${s.word}]`).join(" → "),
  };
}
