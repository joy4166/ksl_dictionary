"use client";

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import SignCard from "@/components/translate/SignCard";
import { convertSavedPhraseToTranslationResult } from "@/lib/storage";
import { SavedPhraseItem } from "@/types/sign";

interface PhraseItemCardProps {
  item: SavedPhraseItem;
  categoryLabel: string;
  onDeleteCustom?: (id: string) => void;
  isLargeMode?: boolean;
  defaultExpanded?: boolean;
}

const PhraseItemCard = memo(function PhraseItemCard({
  item,
  categoryLabel,
  onDeleteCustom,
  isLargeMode = false,
  defaultExpanded = false,
}: PhraseItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const translation = useMemo(
    () => convertSavedPhraseToTranslationResult(item),
    [item]
  );

  return (
    <div
      className={`rounded-xl border transition-colors duration-150 overflow-hidden ${
        isExpanded
          ? "border-emerald-700 bg-white"
          : "border-stone-200 bg-white hover:border-stone-300"
      }`}
    >
      {/* 상단 메타 및 삭제 액션 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800">
            {categoryLabel}
          </span>
          {!item.isPreset && (
            <span className="rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-mono text-stone-600">
              내가 추가한 문장
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!item.isPreset && onDeleteCustom && (
            <>
              {confirmingDelete ? (
                <div
                  role="group"
                  aria-label="문장 삭제 확인"
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 p-1"
                >
                  <button
                    type="button"
                    onClick={() => onDeleteCustom(item.id)}
                    className="inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-[11px] font-mono font-bold bg-red-600 text-white hover:bg-red-700 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    삭제 확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold text-stone-700 hover:bg-stone-200/70 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label={`'${item.title}' 문장함에서 삭제`}
                  title="문장함에서 삭제"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-stone-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-mono font-bold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
              isExpanded
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100"
            }`}
          >
            <span>{isExpanded ? "접기" : "수어 보기"}</span>
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 원터치 본문 클릭 영역 */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full text-left px-4 pb-4 pt-2 cursor-pointer select-none space-y-2.5 transition-colors duration-150 hover:bg-stone-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
      >
        <h3
          className={`font-extrabold text-stone-900 tracking-tight break-keep break-words ${
            isLargeMode ? "text-xl" : "text-base"
          }`}
        >
          “{item.title}”
        </h3>

        {/* 수어 어순 요약 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {translation.kslSequence.map((token, idx) => (
            <div
              key={`${item.id}_${token.selectedSign.id}_${idx}`}
              className="flex items-center gap-1"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 font-mono font-bold text-stone-900 ${
                  isLargeMode ? "text-sm" : "text-xs"
                }`}
              >
                <span className="select-none" aria-hidden="true">
                  {token.selectedSign.handShapeHint}
                </span>
                <span>
                  <span className="tabular-nums text-emerald-800">{idx + 1}.</span>{" "}
                  {token.selectedSign.word}
                </span>
              </span>
              {idx < translation.kslSequence.length - 1 && (
                <ArrowRight className="h-3 w-3 text-stone-500" />
              )}
            </div>
          ))}
        </div>

        {/* 표정·몸짓 비수지 기호 팁 */}
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
          <SmilePlus className="h-3.5 w-3.5 text-amber-800 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{item.nonManualTip}</span>
        </div>
      </button>

      {/* 원터치 펼침 상세 수어 시퀀스 카드 리스트 */}
      {isExpanded && (
        <div
          className={`motion-panel-reveal border-t border-stone-200 bg-stone-100/70 p-2.5 ${
            isLargeMode
              ? "space-y-3"
              : "grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start"
          }`}
        >
          {translation.kslSequence.map((token, idx) => (
            <SignCard
              key={`${item.id}_detail_${token.selectedSign.id}_${idx}`}
              stepNumber={idx + 1}
              sign={token.selectedSign}
              originalPart={token.originalPart}
              selectionReason={token.selectionReason}
              isLargeMode={isLargeMode}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default PhraseItemCard;
