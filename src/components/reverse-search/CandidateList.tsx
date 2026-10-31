"use client";

import { CheckCircle2, RotateCcw, SearchX } from "lucide-react";
import SignCard from "@/components/translate/SignCard";
import { ReverseSearchCandidate } from "@/types/sign";

interface CandidateListProps {
  candidates: ReverseSearchCandidate[];
  isLargeMode?: boolean;
  isInitialBrowse?: boolean;
  onReset?: () => void;
}

export default function CandidateList({
  candidates,
  isLargeMode = false,
  isInitialBrowse = false,
  onReset,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3"
      >
        <SearchX className="h-8 w-8 text-stone-500 mx-auto" />
        <div className="space-y-1">
          <div className="text-sm font-bold text-stone-900">
            일치하는 수어 동작 후보를 찾지 못했습니다.
          </div>
          <p className="text-xs text-stone-600">
            선택한 태그를 줄이거나 손이 닿는 신체 부위(코, 볼, 가슴 등) 위주로 다시 선택해 보세요.
          </p>
        </div>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-mono font-bold text-white hover:bg-emerald-800 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>선택 조건 초기화</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-extrabold text-stone-900 tracking-tight">
          {isInitialBrowse ? "기본 추천 수어 동작 " : "일치하는 수어 동작 후보 "}
          <span className="font-mono tabular-nums text-emerald-800">
            ({candidates.length}건)
          </span>
        </h2>
        <span className="text-[11px] font-mono text-stone-600">
          {isInitialBrowse ? "태그·묘사 입력 시 즉시 필터링" : "음운 유사도 순 정렬"}
        </span>
      </div>

      <div
        className={
          isLargeMode
            ? "space-y-4"
            : "grid grid-cols-1 md:grid-cols-2 gap-3 items-start"
        }
      >
        {candidates.map((item, idx) => (
          <div
            key={item.sign.id}
            className="rounded-xl border border-stone-200 bg-stone-100/70 p-2.5 space-y-2 overflow-hidden"
          >
            {/* 매칭 유사도 및 이유 배지 */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono font-bold tabular-nums ${
                    !isInitialBrowse && idx === 0
                      ? "bg-emerald-700 text-white"
                      : "border border-stone-300 bg-white text-stone-800"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    {isInitialBrowse
                      ? "기본 추천 수어"
                      : `${idx + 1}순위 (${item.score}% 일치)`}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {item.matchedKeywords.slice(0, 4).map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-mono text-stone-700 border border-stone-200"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {!isInitialBrowse && (
              <p className="px-1 text-xs text-stone-700 leading-relaxed break-words">
                • {item.matchReason}
              </p>
            )}

            <SignCard sign={item.sign} isLargeMode={isLargeMode} />
          </div>
        ))}
      </div>
    </div>
  );
}
