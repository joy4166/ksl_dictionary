"use client";

import {
  ArrowRight,
  Bookmark,
  Check,
  SmilePlus,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { PhraseCategoryId, TranslationResult } from "@/types/sign";

interface NonManualTipBannerProps {
  result: TranslationResult;
  isSaved: boolean;
  onSaveToPhrasebook: (categoryId: PhraseCategoryId) => void;
  isLargeMode?: boolean;
}

const CATEGORY_OPTIONS: Array<{ id: PhraseCategoryId; label: string }> = [
  { id: "greeting", label: "인사/안부" },
  { id: "meal", label: "식사/간식" },
  { id: "health", label: "복약/건강" },
  { id: "program", label: "프로그램" },
  { id: "farewell", label: "귀가/송영" },
];

export default function NonManualTipBanner({
  result,
  isSaved,
  onSaveToPhrasebook,
  isLargeMode = false,
}: NonManualTipBannerProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<PhraseCategoryId>("greeting");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const selectedCategoryLabel =
    CATEGORY_OPTIONS.find((c) => c.id === selectedCategory)?.label || "인사/안부";

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3.5 overflow-hidden">
      {/* 어르신 대면 공유 및 전체 문장 가독성을 위한 한국어 원문 헤더 */}
      <div className="border-b border-stone-200 pb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-mono font-bold text-white">
              KSL 어순
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-mono text-stone-700">
              <Sparkles className="h-3 w-3 text-emerald-700" />
              <span className="tabular-nums font-semibold">
                {result.kslSequence.length}개 동작 시퀀스
              </span>
            </span>
          </div>

          {/* 문장함에 저장 버튼 */}
          {isSaved ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-mono font-semibold text-emerald-900"
            >
              <Check className="h-3.5 w-3.5 text-emerald-700" />
              <span>{selectedCategoryLabel}에 저장됨</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowCategoryPicker((prev) => !prev)}
              aria-expanded={showCategoryPicker}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-mono font-semibold text-stone-800 transition-all duration-150 hover:bg-stone-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
            >
              <Bookmark className="h-3.5 w-3.5 text-emerald-700" />
              <span>문장함 저장</span>
            </button>
          )}
        </div>

        <p
          className={`font-extrabold tracking-tight text-stone-900 leading-snug break-keep break-words ${
            isLargeMode ? "text-xl sm:text-2xl pt-1" : "text-base"
          }`}
        >
          “{result.inputSentence}”
        </p>
      </div>

      {/* 카테고리 선택기 (저장 버튼 클릭 시 노출) */}
      {showCategoryPicker && !isSaved && (
        <div
          role="region"
          aria-label="문장함 카테고리 선택"
          className="motion-panel-reveal rounded-lg bg-stone-50 p-3 border border-stone-200 space-y-2.5"
        >
          <div className="text-xs font-semibold text-stone-800">
            저장할 대화 상황 카테고리를 선택하세요:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={selectedCategory === cat.id}
                className={`inline-flex min-h-8 items-center rounded-md border px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
                  selectedCategory === cat.id
                    ? "border-emerald-700 bg-emerald-700 font-bold text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1.5 border-t border-stone-200/80">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(false)}
              className="inline-flex min-h-8 items-center rounded-md border border-transparent px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveToPhrasebook(selectedCategory);
                setShowCategoryPicker(false);
              }}
              className="inline-flex min-h-8 items-center rounded-md bg-emerald-700 px-3.5 py-1 text-xs font-mono font-bold text-white hover:bg-emerald-800 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
            >
              저장 완료
            </button>
          </div>
        </div>
      )}

      {/* 수어 단어 어순 칩 플로우 (Focal Moment: 한국어 어순이 KSL 수어 시퀀스로 재배열되는 단계적 흐름) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {result.kslSequence.map((token, idx) => (
          <div
            key={`${token.selectedSign.id}_${idx}`}
            style={{ "--step-index": idx } as React.CSSProperties}
            className="motion-step-enter flex items-center gap-1.5"
          >
            <div
              className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-extrabold text-stone-900 tracking-tight ${
                isLargeMode
                  ? "text-lg py-2 px-3.5 border-emerald-700 bg-emerald-50/40"
                  : "text-sm"
              }`}
            >
              <span
                className={`flex items-center justify-center rounded-full bg-emerald-700 font-mono font-bold tabular-nums text-white ${
                  isLargeMode ? "h-6 w-6 text-xs" : "h-5 w-5 text-[11px]"
                }`}
              >
                {idx + 1}
              </span>
              <span className="select-none" aria-hidden="true">
                {token.selectedSign.handShapeHint || "👐"}
              </span>
              <span className="break-words">{token.selectedSign.word}</span>
            </div>
            {idx < result.kslSequence.length - 1 && (
              <ArrowRight className="h-4 w-4 text-stone-500 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* 문맥·문법 변환 해설 */}
      {result.contextExplanation && (
        <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
          <div
            className={`min-w-0 break-words leading-snug text-stone-800 ${
              isLargeMode ? "text-sm font-medium" : "text-xs"
            }`}
          >
            <span className="font-mono font-bold text-emerald-900 mr-1.5">
              [문맥·어순 변환]
            </span>
            {result.contextExplanation}
          </div>
        </div>
      )}

      {/* 비수지 기호(표정·고개짓) 한 줄 팁 (따뜻한 앰버 틴트로 대화 표정 팁 강조) */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200/90 bg-amber-50/70 px-3 py-2.5">
        <SmilePlus className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
        <div
          className={`min-w-0 break-words leading-snug text-amber-950 ${
            isLargeMode ? "text-base font-bold" : "text-xs"
          }`}
        >
          <span className="font-mono font-bold text-amber-900 mr-1.5">
            [표정·몸짓 팁]
          </span>
          {result.nonManualTip}
        </div>
      </div>
    </div>
  );
}
