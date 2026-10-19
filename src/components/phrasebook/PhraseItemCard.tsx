"use client";

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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

export default function PhraseItemCard({
  item,
  categoryLabel,
  onDeleteCustom,
  isLargeMode = false,
  defaultExpanded = false,
}: PhraseItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const translation = convertSavedPhraseToTranslationResult(item);

  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden ${
        isExpanded
          ? "border-blue-400 bg-blue-50/20 shadow-sm"
          : "border-slate-200 bg-white hover:border-blue-300 shadow-2xs"
      }`}
    >
      {/* 원터치 헤더 영역 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        className="w-full text-left p-4 cursor-pointer select-none space-y-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                {categoryLabel}
              </span>
              {!item.isPreset && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  내가 추가한 문장
                </span>
              )}
            </div>
            <h3
              className={`font-extrabold text-slate-900 ${
                isLargeMode ? "text-xl" : "text-base"
              }`}
            >
              “{item.title}”
            </h3>
          </div>

          <div className="flex items-center gap-1">
            {!item.isPreset && onDeleteCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCustom(item.id);
                }}
                title="문장함에서 삭제"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              <span>{isExpanded ? "접기" : "수어 보기"}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
        </div>

        {/* 수어 어순 요약 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {translation.kslSequence.map((token, idx) => (
            <div
              key={`${item.id}_${token.selectedSign.id}_${idx}`}
              className="flex items-center gap-1"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-800 border border-slate-200 ${
                  isLargeMode ? "text-sm" : "text-xs"
                }`}
              >
                <span>{token.selectedSign.handShapeHint}</span>
                <span>
                  {idx + 1}. {token.selectedSign.word}
                </span>
              </span>
              {idx < translation.kslSequence.length - 1 && (
                <ArrowRight className="h-3 w-3 text-slate-400" />
              )}
            </div>
          ))}
        </div>

        {/* 표정·몸짓 비수지 기호 팁 */}
        <div className="flex items-start gap-1.5 rounded-xl bg-amber-50/80 border border-amber-200/70 px-3 py-2 text-xs text-amber-950">
          <SmilePlus className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>{item.nonManualTip}</span>
        </div>
      </div>

      {/* 원터치 펼침 상세 수어 시퀀스 카드 리스트 */}
      {isExpanded && (
        <div className="border-t border-blue-200 bg-slate-50/80 p-3.5 space-y-3">
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
}
