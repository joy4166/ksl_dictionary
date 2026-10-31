"use client";

import { HandHeart, Maximize2, Minimize2 } from "lucide-react";

interface HeaderProps {
  isLargeMode: boolean;
  onToggleLargeMode: () => void;
}

export default function Header({
  isLargeMode,
  onToggleLargeMode,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur-md px-4 pb-3 safe-top space-y-2.5">
      {/* 키보드 및 스크린 리더 사용자를 위한 본문 바로가기 스킵 링크 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-emerald-800 focus:px-3 focus:py-2 focus:text-xs focus:font-mono focus:font-bold focus:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
      >
        본문으로 바로가기
      </a>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <HandHeart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-tight text-stone-900 whitespace-nowrap">
                KSL 번역
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                AI
              </span>
            </div>
            <p className="text-[11px] text-stone-600 truncate">
              농인과 대화를 위한 소통 앱
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 어르신 화면 공유 모드 (크게 보기) 토글 버튼 */}
          <button
            type="button"
            onClick={onToggleLargeMode}
            aria-pressed={isLargeMode}
            className={`touch-target inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
              isLargeMode
                ? "border-emerald-800 bg-emerald-700 text-white"
                : "border-stone-200 bg-white text-stone-800 hover:bg-stone-100"
            }`}
            title="스마트폰 화면을 어르신께 함께 보여드릴 때 카드와 글씨를 크게 확대합니다"
          >
            {isLargeMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 shrink-0" />
                <span>기본 화면</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span>크게 보기</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
