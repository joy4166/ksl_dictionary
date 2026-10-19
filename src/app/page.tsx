"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  getSignById,
  searchReverseByMotionLocal,
} from "@/lib/ksl-dictionary";
import {
  deleteCustomPhraseFromStorage,
  getAllSavedPhrases,
  isSentenceSaved,
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

function createInitialDemoResult(): TranslationResult {
  const chuseok = getSignById("ksl_002")!;
  const well = getSignById("ksl_003")!;
  const spendTime = getSignById("ksl_004")!;
  const sendItem = getSignById("ksl_005")!;

  return {
    inputSentence: "추석 잘 보내세요",
    glossSummary: "[추석] → [잘] → [지내다]",
    nonManualTip:
      "환하게 웃으며 따뜻한 명절 덕담을 건네듯 고개를 부드럽게 끄덕이며 표현하세요.",
    kslSequence: [
      {
        originalPart: "추석",
        kslGloss: "추석",
        selectedSign: chuseok,
        alternativeSigns: [],
      },
      {
        originalPart: "잘",
        kslGloss: "잘",
        selectedSign: well,
        alternativeSigns: [],
      },
      {
        originalPart: "보내세요",
        kslGloss: "지내다",
        selectedSign: spendTime,
        alternativeSigns: sendItem ? [sendItem] : [],
        selectionReason:
          "시간·명절을 '보내다'는 물건 발송('보내다')이 아닌 '지내다/생활하다' 수어를 사용합니다.",
      },
    ],
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<ActiveTabId>("translate");
  const [isLargeMode, setIsLargeMode] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // --- [탭 1: 문장 번역 상태] ---
  const [inputSentence, setInputSentence] = useState("추석 잘 보내세요");
  const [translationResult, setTranslationResult] =
    useState<TranslationResult>(createInitialDemoResult);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

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

  // 초기 문장함 및 저장된 API 키 로드
  useEffect(() => {
    setSavedPhrases(getAllSavedPhrases());
    try {
      const savedKey = window.localStorage.getItem(API_KEY_STORAGE);
      if (savedKey) setApiKey(savedKey);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    try {
      if (newKey) {
        window.localStorage.setItem(API_KEY_STORAGE, newKey);
      } else {
        window.localStorage.removeItem(API_KEY_STORAGE);
      }
    } catch {
      // ignore
    }
  };

  // 문장 번역 실행
  const handleTranslate = useCallback(
    async (sentenceToTranslate: string) => {
      const clean = sentenceToTranslate.trim();
      if (!clean) return;

      setIsTranslating(true);
      setTranslateError(null);

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: clean, apiKey }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "번역 요청에 실패했습니다.");
        }

        const data = (await res.json()) as TranslationResult;
        setTranslationResult(data);
      } catch (err) {
        setTranslateError(
          err instanceof Error
            ? err.message
            : "수어 변환 중 일시적인 오류가 발생했습니다."
        );
      } finally {
        setIsTranslating(false);
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
    savePhraseToStorage(translationResult, categoryId);
    setSavedPhrases(getAllSavedPhrases());
  };

  // 커스텀 저장 문장 삭제
  const handleDeleteCustomPhrase = (id: string) => {
    deleteCustomPhraseFromStorage(id);
    setSavedPhrases(getAllSavedPhrases());
  };

  // 역검색 실행
  const runReverseSearch = useCallback(
    async (queryText: string, chips: string[]) => {
      const localFast = searchReverseByMotionLocal(queryText, chips);
      setReverseCandidates(localFast);

      if (!queryText.trim() && chips.length === 0) {
        return;
      }

      setIsReverseSearching(true);
      try {
        const res = await fetch("/api/reverse-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            descriptionQuery: queryText,
            selectedChips: chips,
            apiKey,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.candidates)) {
            setReverseCandidates(data.candidates);
          }
        }
      } catch {
        // 네트워크 오류 시 이미 반영된 로컬 결과 유지
      } finally {
        setIsReverseSearching(false);
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
    () => isSentenceSaved(translationResult.inputSentence),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translationResult.inputSentence, savedPhrases]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <Header
        isLargeMode={isLargeMode}
        onToggleLargeMode={() => setIsLargeMode((prev) => !prev)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* 어르신 화면 공유 모드 활성화 안내 바 */}
      {isLargeMode && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-extrabold text-white shadow-2xs">
          🔍 어르신 화면 공유 모드 (글자와 수어 동작 카드를 큼직하게 표시합니다)
        </div>
      )}

      {/* 메인 탭 컨텐츠 영역 */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {/* === [탭 1: 문장 번역] === */}
        {activeTab === "translate" && (
          <div className="space-y-4">
            <SpeechInputBar
              value={inputSentence}
              onChange={setInputSentence}
              onSubmit={handleTranslate}
              isLoading={isTranslating}
            />

            {translateError && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-medium text-rose-700">
                {translateError}
              </div>
            )}

            {isTranslating ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-32 rounded-2xl bg-slate-200/80" />
                <div className="h-40 rounded-2xl bg-slate-200/80" />
                <div className="h-40 rounded-2xl bg-slate-200/80" />
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* === [탭 2: 주간보호시설 상황별 문장함] === */}
        {activeTab === "phrasebook" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-blue-50/90 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-950">
              <strong className="font-extrabold text-blue-800">
                현장 원터치 문장함:
              </strong>{" "}
              자주 쓰는 상황별 문장을 터치하면 검색 기다림 없이{" "}
              <strong>0.1초 만에</strong> 수어 순서와 동작 카드가 펼쳐집니다.
            </div>

            <CategoryTabs
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              countsByCategory={countsByCategory}
            />

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
            />

            <CandidateList
              candidates={reverseCandidates}
              isLargeMode={isLargeMode}
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
