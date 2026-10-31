"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareHeart, RotateCcw, Sparkles } from "lucide-react";
import BottomNav, { ActiveTabId } from "@/components/layout/BottomNav";
import Header from "@/components/layout/Header";
import CategoryTabs, {
  FilterCategoryType,
} from "@/components/phrasebook/CategoryTabs";
import PhraseItemCard from "@/components/phrasebook/PhraseItemCard";
import CandidateList from "@/components/reverse-search/CandidateList";
import MotionSearchInput from "@/components/reverse-search/MotionSearchInput";
import NonManualTipBanner from "@/components/translate/NonManualTipBanner";
import SignSequenceList from "@/components/translate/SignSequenceList";
import SpeechInputBar from "@/components/translate/SpeechInputBar";
import {
  getPresetPhrasebook,
  searchReverseByMotionLocal,
} from "@/lib/ksl-dictionary";
import {
  addRecentSearchToStorage,
  clearRecentSearchesFromStorage,
  deleteCustomPhraseFromStorage,
  getAllSavedPhrases,
  getRecentSearchesFromStorage,
  isSentenceSaved,
  removeRecentSearchFromStorage,
  savePhraseToStorage,
} from "@/lib/storage";
import {
  PhraseCategoryId,
  ReverseSearchCandidate,
  SavedPhraseItem,
  SignWordEntry,
  TranslationResult,
} from "@/types/sign";

const API_KEY_STORAGE = "my_sign_dictionary_gemini_api_key_v1";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<ActiveTabId>("translate");
  const [isLargeMode, setIsLargeMode] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // --- [탭 1: 문장 번역 상태] ---
  const [inputSentence, setInputSentence] = useState("");
  const [translationResult, setTranslationResult] =
    useState<TranslationResult | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // --- [탭 2: 상황별 문장함 상태] ---
  const { categories } = useMemo(() => getPresetPhrasebook(), []);
  const [savedPhrases, setSavedPhrases] = useState<SavedPhraseItem[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<FilterCategoryType>("all");

  // --- [탭 3: 수어 역검색 상태] ---
  const [reverseQuery, setReverseQuery] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [reverseCandidates, setReverseCandidates] = useState<
    ReverseSearchCandidate[]
  >(() => searchReverseByMotionLocal("", []));
  const [isReverseSearching, setIsReverseSearching] = useState(false);

  // 동시성(Race Condition) 및 언마운트 방어를 위한 AbortController 레퍼런스
  const translateAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSavedPhrases(getAllSavedPhrases());
    setRecentSearches(getRecentSearchesFromStorage());
    try {
      const savedKey = window.localStorage.getItem(API_KEY_STORAGE);
      if (savedKey) setApiKey(savedKey);
    } catch {
      // ignore
    }

    return () => {
      translateAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
  }, []);

  // 문장 번역 실행
  const handleTranslate = useCallback(
    async (sentenceToTranslate: string) => {
      const clean = sentenceToTranslate.trim().slice(0, 200);
      if (!clean) return;

      setRecentSearches(addRecentSearchToStorage(clean));

      translateAbortRef.current?.abort();
      const controller = new AbortController();
      translateAbortRef.current = controller;

      setIsTranslating(true);
      setTranslateError(null);

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: clean, apiKey }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "번역 요청에 실패했습니다.");
        }

        const data = (await res.json()) as TranslationResult;
        if (!controller.signal.aborted) {
          setTranslationResult(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setTranslateError(
          err instanceof Error
            ? err.message
            : "수어 변환 중 일시적인 네트워크 오류가 발생했습니다. 다시 시도해 주세요."
        );
      } finally {
        if (translateAbortRef.current === controller) {
          setIsTranslating(false);
        }
      }
    },
    [apiKey]
  );

  // 동음이의어 후보 수동 교체
  const handleSwapAlternative = (
    tokenIndex: number,
    newSign: SignWordEntry
  ) => {
    setTranslationResult((prev) => {
      if (!prev) return prev;
      const updatedSeq = [...prev.kslSequence];
      const currentToken = updatedSeq[tokenIndex];
      if (!currentToken) return prev;

      const newAlternatives = [
        currentToken.selectedSign,
        ...currentToken.alternativeSigns.filter((a) => a.id !== newSign.id),
      ];

      updatedSeq[tokenIndex] = {
        ...currentToken,
        kslGloss: newSign.word,
        selectedSign: newSign,
        alternativeSigns: newAlternatives,
        selectionReason: `사용자가 '${newSign.word}(${newSign.meaning})' 수어로 직접 변경했습니다.`,
      };

      return {
        ...prev,
        kslSequence: updatedSeq,
        glossSummary: updatedSeq
          .map((item) => `[${item.selectedSign.word}]`)
          .join(" → "),
      };
    });
  };

  // 현재 번역 결과를 나만의 문장함에 저장
  const handleSaveCurrentPhrase = (categoryId: PhraseCategoryId) => {
    if (!translationResult) return;
    savePhraseToStorage(translationResult, categoryId);
    setSavedPhrases(getAllSavedPhrases());
  };

  // 커스텀 저장 문장 삭제
  const handleDeleteCustomPhrase = useCallback((id: string) => {
    deleteCustomPhraseFromStorage(id);
    setSavedPhrases(getAllSavedPhrases());
  }, []);

  // 역검색 실행
  const runReverseSearch = useCallback(
    async (queryText: string, chips: string[]) => {
      const cleanQuery = queryText.trim().slice(0, 150);
      const localFast = searchReverseByMotionLocal(cleanQuery, chips);
      setReverseCandidates(localFast);

      reverseAbortRef.current?.abort();

      if (!cleanQuery && chips.length === 0) {
        setIsReverseSearching(false);
        return;
      }

      const controller = new AbortController();
      reverseAbortRef.current = controller;
      setIsReverseSearching(true);

      try {
        const res = await fetch("/api/reverse-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            descriptionQuery: cleanQuery,
            selectedChips: chips,
            apiKey,
          }),
          signal: controller.signal,
        });
        if (res.ok && !controller.signal.aborted) {
          const data = await res.json();
          if (Array.isArray(data.candidates)) {
            setReverseCandidates(data.candidates);
          }
        }
      } catch {
        // 취소되었거나 네트워크 오류 시 이미 반영된 로컬 결과 유지
      } finally {
        if (reverseAbortRef.current === controller) {
          setIsReverseSearching(false);
        }
      }
    },
    [apiKey]
  );

  const handleToggleChip = (chip: string) => {
    const nextChips = selectedChips.includes(chip)
      ? selectedChips.filter((c) => c !== chip)
      : [...selectedChips, chip];
    setSelectedChips(nextChips);
    runReverseSearch(reverseQuery, nextChips);
  };

  const handleResetReverse = () => {
    reverseAbortRef.current?.abort();
    setIsReverseSearching(false);
    setReverseQuery("");
    setSelectedChips([]);
    setReverseCandidates(searchReverseByMotionLocal("", []));
  };

  const handleSelectReverseExample = (
    exampleQuery: string,
    exampleChips: string[]
  ) => {
    setReverseQuery(exampleQuery);
    setSelectedChips(exampleChips);
    runReverseSearch(exampleQuery, exampleChips);
  };

  // 문장함 카테고리별 개수 계산
  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = { all: savedPhrases.length };
    for (const item of savedPhrases) {
      map[item.categoryId] = (map[item.categoryId] || 0) + 1;
    }
    return map;
  }, [savedPhrases]);

  const filteredPhrases = useMemo(() => {
    if (selectedCategory === "all") return savedPhrases;
    return savedPhrases.filter((p) => p.categoryId === selectedCategory);
  }, [savedPhrases, selectedCategory]);

  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      map[c.id] = c.label;
    }
    return map;
  }, [categories]);

  const currentSentenceIsSaved = useMemo(
    () =>
      translationResult
        ? isSentenceSaved(translationResult.inputSentence)
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translationResult?.inputSentence, savedPhrases]
  );

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <Header
        isLargeMode={isLargeMode}
        onToggleLargeMode={() => setIsLargeMode((prev) => !prev)}
      />

      {/* 화면 공유 모드 활성화 안내 바 */}
      {isLargeMode && (
        <div
          role="status"
          aria-live="polite"
          className="bg-emerald-800 px-4 py-2 text-center text-xs font-mono font-bold text-white border-b border-emerald-900"
        >
          어르신 대면 화면 공유 모드 — 한국어 원문과 수형 카드를 1단 대형 화면으로 표시합니다
        </div>
      )}

      {/* 메인 탭 컨텐츠 영역 */}
      <main id="main-content" className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {/* === [탭 1: 문장 번역] === */}
        {activeTab === "translate" && (
          <div className="space-y-4">
            <SpeechInputBar
              value={inputSentence}
              onChange={setInputSentence}
              onSubmit={handleTranslate}
              onClear={() => {
                translateAbortRef.current?.abort();
                setIsTranslating(false);
                setTranslationResult(null);
                setTranslateError(null);
              }}
              isLoading={isTranslating}
              recentSearches={recentSearches}
              onDeleteRecentSearch={(sentence) =>
                setRecentSearches(removeRecentSearchFromStorage(sentence))
              }
              onClearRecentSearches={() =>
                setRecentSearches(clearRecentSearchesFromStorage())
              }
            />

            {translateError && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center justify-between gap-2 rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-medium text-red-700"
              >
                <span className="break-words min-w-0">{translateError}</span>
                {inputSentence.trim() && (
                  <button
                    type="button"
                    onClick={() => handleTranslate(inputSentence)}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-mono font-bold text-red-700 hover:bg-red-100 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>다시 시도</span>
                  </button>
                )}
              </div>
            )}

            {isTranslating ? (
              <div
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="space-y-3 animate-pulse"
              >
                <span className="sr-only">
                  입력하신 한국어 문장을 한국수어 어순과 동작 카드로 변환하고 있습니다...
                </span>
                <div className="h-32 rounded-xl bg-stone-200/70 border border-stone-200" />
                <div className="h-40 rounded-xl bg-stone-200/70 border border-stone-200" />
                <div className="h-40 rounded-xl bg-stone-200/70 border border-stone-200" />
              </div>
            ) : translationResult ? (
              <>
                <NonManualTipBanner
                  result={translationResult}
                  isSaved={currentSentenceIsSaved}
                  onSaveToPhrasebook={handleSaveCurrentPhrase}
                  isLargeMode={isLargeMode}
                />

                <SignSequenceList
                  sequence={translationResult.kslSequence}
                  onSwapAlternative={handleSwapAlternative}
                  isLargeMode={isLargeMode}
                />
              </>
            ) : (
              <div className="rounded-xl border border-stone-200 bg-white p-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <MessageSquareHeart className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-extrabold text-stone-900 tracking-tight">
                    농인과 나누고 싶은 말을 입력해 보세요
                  </h2>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    한국어 문장을 입력하거나 음성으로 말하면, 한국수어(KSL) 어순과 문맥에 맞는 수어 영상·수형 카드로 변환해 드립니다.
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50/60 p-3 text-left text-[11px] text-amber-950 space-y-1 border border-amber-200/80">
                  <div className="font-mono font-bold text-amber-900 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                    <span>이렇게 활용해 보세요</span>
                  </div>
                  <p>• 위 입력창에 문장을 입력하거나 음성으로 말하면 <strong>최근 검색한 문장</strong>에 자동 저장되어 언제든 다시 꺼내 쓸 수 있습니다.</p>
                  <p>• 동음이의어(예: 명절을 <strong>보내다→지내다</strong>, 대회를 <strong>나가다→참가하다</strong>)도 문맥에 맞게 자동 선택됩니다.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === [탭 2: 대화 상황별 문장함] === */}
        {activeTab === "phrasebook" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50/60 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-950 leading-relaxed">
              <strong className="font-mono font-bold text-amber-900 mr-1">
                [원터치 대화 문장함]
              </strong>
              자주 쓰는 상황별 문장을 터치하면 검색 기다림 없이{" "}
              <strong className="font-mono tabular-nums font-bold text-emerald-800">
                0.1초 만에
              </strong>{" "}
              수어 순서와 동작 카드가 펼쳐집니다.
            </div>

            <CategoryTabs
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              countsByCategory={countsByCategory}
            />

            {filteredPhrases.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3">
                <p className="text-sm font-bold text-stone-900">
                  이 카테고리에 저장된 문장이 없습니다.
                </p>
                <p className="text-xs text-stone-600">
                  문장 번역 탭에서 자주 쓰는 문장을 변환한 뒤 문장함에 저장하거나, 전체 카테고리를 확인해 보세요.
                </p>
                {selectedCategory !== "all" && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-mono font-bold text-white hover:bg-emerald-800 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>전체 문장 보기</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPhrases.map((phrase, idx) => (
                  <PhraseItemCard
                    key={phrase.id}
                    item={phrase}
                    categoryLabel={
                      categoryLabelMap[phrase.categoryId] || "나만의 문장"
                    }
                    onDeleteCustom={handleDeleteCustomPhrase}
                    isLargeMode={isLargeMode}
                    defaultExpanded={idx === 0}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* === [탭 3: 손동작 묘사 기반 수어 역검색] === */}
        {activeTab === "reverse" && (
          <div className="space-y-4">
            <MotionSearchInput
              query={reverseQuery}
              onChangeQuery={setReverseQuery}
              selectedChips={selectedChips}
              onToggleChip={handleToggleChip}
              onReset={handleResetReverse}
              onSubmit={() => runReverseSearch(reverseQuery, selectedChips)}
              onSelectExample={handleSelectReverseExample}
              isLoading={isReverseSearching}
              resultCount={reverseCandidates.length}
            />

            <CandidateList
              candidates={reverseCandidates}
              isLargeMode={isLargeMode}
              isInitialBrowse={!reverseQuery.trim() && selectedChips.length === 0}
              onReset={handleResetReverse}
            />
          </div>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        savedCount={savedPhrases.length}
      />
    </div>
  );
}
