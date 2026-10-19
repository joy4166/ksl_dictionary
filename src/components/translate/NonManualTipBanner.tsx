"use client";

import { ArrowRight, Bookmark, Check, SmilePlus, Sparkles } from "lucide-react";
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

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/60 p-4 shadow-xs space-y-3">
      {/* 한국수어(KSL) 어순 시퀀스 한눈에 보기 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
            한국수어(KSL) 어순
          </span>
          {result.engineUsed === "gemini" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
              <Sparkles className="h-3 w-3" />
              Gemini AI 3계층 문맥번역
            </span>
          ) : (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              총 {result.kslSequence.length}동작 · KSL 문맥엔진
            </span>
          )}
        </div>

        {/* 문장함에 저장 버튼 */}
        {isSaved ? (
          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            <Check className="h-3.5 w-3.5" />
            문장함에 저장됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowCategoryPicker((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-xl bg-white border border-blue-300 px-2.5 py-1 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-50 active:scale-95"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span>나만의 문장함 저장</span>
          </button>
        )}
      </div>

      {/* 카테고리 선택기 (저장 버튼 클릭 시 노출) */}
      {showCategoryPicker && !isSaved && (
        <div className="rounded-xl bg-white p-3 border border-blue-200 space-y-2">
          <div className="text-xs font-bold text-slate-700">
            저장할 대화 상황 카테고리를 선택하세요:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(false)}
              className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveToPhrasebook(selectedCategory);
                setShowCategoryPicker(false);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
            >
              저장 완료
            </button>
          </div>
        </div>
      )}

      {/* 수어 단어 어순 칩 플로우 */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {result.kslSequence.map((token, idx) => (
          <div
            key={`${token.selectedSign.id}_${idx}`}
            className="flex items-center gap-1.5"
          >
            <div
              className={`inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 font-extrabold text-slate-900 shadow-xs border border-blue-200 ${
                isLargeMode ? "text-base" : "text-sm"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {idx + 1}
              </span>
              <span>{token.selectedSign.handShapeHint || "👐"}</span>
              <span>{token.selectedSign.word}</span>
            </div>
            {idx < result.kslSequence.length - 1 && (
              <ArrowRight className="h-4 w-4 text-blue-400 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* 문맥·문법 변환 해설 */}
      {result.contextExplanation && (
        <div className="flex items-start gap-2 rounded-xl bg-indigo-50/80 border border-indigo-200/80 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
          <div
            className={`leading-snug text-indigo-950 ${
              isLargeMode ? "text-sm font-medium" : "text-xs"
            }`}
          >
            <span className="font-extrabold text-indigo-800 mr-1">
              [문맥·어순 변환]
            </span>
            {result.contextExplanation}
          </div>
        </div>
      )}

      {/* 비수지 기호(표정·고개짓) 한 줄 팁 */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50/90 border border-amber-200/80 px-3 py-2.5">
        <SmilePlus className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div
          className={`leading-snug text-amber-950 ${
            isLargeMode ? "text-sm font-semibold" : "text-xs"
          }`}
        >
          <span className="font-extrabold text-amber-800 mr-1">
            [표정·몸짓 팁]
          </span>
          {result.nonManualTip}
        </div>
      </div>
    </div>
  );
}
