"use client";

import { CheckCircle2, SearchX } from "lucide-react";
import SignCard from "@/components/translate/SignCard";
import { ReverseSearchCandidate } from "@/types/sign";

interface CandidateListProps {
  candidates: ReverseSearchCandidate[];
  isLargeMode?: boolean;
}

export default function CandidateList({
  candidates,
  isLargeMode = false,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
        <SearchX className="h-8 w-8 text-slate-400 mx-auto" />
        <div className="text-sm font-bold text-slate-800">
          일치하는 수어 동작 후보를 찾지 못했습니다.
        </div>
        <p className="text-xs text-slate-500">
          손 모양(주먹, 검지, 엄지)이나 손이 닿는 부위(코, 볼, 가슴) 태그를 선택해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold text-slate-800">
          일치하는 수어 동작 후보 ({candidates.length}건)
        </h2>
        <span className="text-[11px] text-slate-500">
          수형 설명 유사도 순 정렬
        </span>
      </div>

      <div className="space-y-3.5">
        {candidates.map((item, idx) => (
          <div
            key={item.sign.id}
            className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-2.5 space-y-2"
          >
            {/* 매칭 유사도 및 이유 배지 */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                    idx === 0
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-100 text-indigo-800"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    {idx + 1}순위 후보 ({item.score}% 일치)
                  </span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {item.matchedKeywords.slice(0, 4).map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="px-1.5 text-xs font-medium text-indigo-950">
              💡 {item.matchReason}
            </p>

            <SignCard sign={item.sign} isLargeMode={isLargeMode} />
          </div>
        ))}
      </div>
    </div>
  );
}
