"use client";

import { Check, HandHeart, KeyRound, Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";

interface HeaderProps {
  isLargeMode: boolean;
  onToggleLargeMode: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
}

export default function Header({
  isLargeMode,
  onToggleLargeMode,
  apiKey,
  onSaveApiKey,
}: HeaderProps) {
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [draftKey, setDraftKey] = useState(apiKey);

  const hasKey = Boolean(apiKey && apiKey.trim().length > 10);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <HandHeart className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-tight text-slate-900">
                나만의 수어 사전
              </h1>
              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                KSL 문맥번역
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              농아인주간보호시설 어르신 소통 도우미
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Gemini API 키 설정 버튼 */}
          <button
            type="button"
            onClick={() => {
              setDraftKey(apiKey);
              setShowKeyModal((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold transition-all active:scale-95 ${
              hasKey
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            title="Gemini API 키를 입력하면 AI 2단계 심층 문맥 번역이 활성화됩니다"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{hasKey ? "AI 연결됨" : "AI 키"}</span>
          </button>

          {/* 어르신 화면 공유 모드 (크게 보기) 토글 버튼 */}
          <button
            type="button"
            onClick={onToggleLargeMode}
            aria-pressed={isLargeMode}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold transition-all active:scale-95 ${
              isLargeMode
                ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-200"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            title="스마트폰 화면을 어르신께 함께 보여드릴 때 카드와 글씨를 크게 확대합니다"
          >
            {isLargeMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>기본</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>크게</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Gemini API 키 입력 드로어 */}
      {showKeyModal && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-blue-950">
              🔑 Google Gemini API 키 설정
            </span>
            <button
              type="button"
              onClick={() => setShowKeyModal(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            Gemini API 키(`AIza...`)를 입력하면 <strong>Gemini 2.5 Flash</strong>가 복잡한 구어체·관용 표현의 문맥 의역과 동음이의어 수형 설명 비교를 직접 수행합니다.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="AIzaSy... (Google AI Studio API Key)"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                onSaveApiKey(draftKey.trim());
                setShowKeyModal(false);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Check className="h-3.5 w-3.5" />
              <span>저장</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
