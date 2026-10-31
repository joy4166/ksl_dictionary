"use client";

import { Clock, Loader2, Mic, MicOff, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SpeechInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (sentence: string) => void;
  onClear?: () => void;
  isLoading: boolean;
  recentSearches: string[];
  onDeleteRecentSearch?: (sentence: string) => void;
  onClearRecentSearches?: () => void;
}

const MAX_SENTENCE_LENGTH = 200;

export default function SpeechInputBar({
  value,
  onChange,
  onSubmit,
  onClear,
  isLoading,
  recentSearches,
  onDeleteRecentSearch,
  onClearRecentSearches,
}: SpeechInputBarProps) {
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    setSpeechError(null);

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    if (typeof window === "undefined") return;
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError(
        "현재 브라우저에서 음성 인식을 지원하지 않습니다. Chrome 또는 모바일 브라우저를 이용해 주세요."
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const bounded = transcript.slice(0, MAX_SENTENCE_LENGTH);
      onChange(bounded);
      const lastResult = event.results[event.results.length - 1];
      if (lastResult?.isFinal) {
        setIsListening(false);
        if (bounded.trim()) {
          onSubmit(bounded.trim());
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== "aborted") {
        setSpeechError("음성 인식 중 오류가 발생했습니다. 마이크 권한을 확인해 주세요.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim().slice(0, MAX_SENTENCE_LENGTH));
  };

  return (
    <div className="space-y-2.5">
      <form onSubmit={handleFormSubmit} className="relative" noValidate>
        <label htmlFor="translate-sentence-input" className="sr-only">
          수어로 변환할 한국어 문장 입력 (최대 200자)
        </label>
        <div
          className={`flex items-center gap-1.5 rounded-xl border bg-white p-1.5 transition-all duration-150 ${
            isListening
              ? "border-emerald-700 ring-2 ring-emerald-700 ring-offset-1"
              : "border-stone-300 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700 focus-within:ring-offset-1"
          }`}
        >
          {/* 음성 인식(STT) 버튼 */}
          <button
            type="button"
            onClick={handleToggleSpeech}
            aria-pressed={isListening}
            aria-label={
              isListening
                ? "음성 인식 중지"
                : "음성으로 한국어 문장 입력하기"
            }
            title="음성으로 문장 입력하기 (한국어 STT)"
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
              isListening
                ? "bg-emerald-700 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-white animate-ping" />
              </>
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>

          <input
            id="translate-sentence-input"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, MAX_SENTENCE_LENGTH))}
            maxLength={MAX_SENTENCE_LENGTH}
            aria-describedby="translate-input-counter"
            placeholder={
              isListening
                ? "말씀해 주세요... (음성 인식 대기 중)"
                : "농인과 나눌 대화를 입력하세요 (예: 추석 잘 보내세요)"
            }
            className="w-full min-w-0 bg-transparent px-1.5 py-2 text-base sm:text-sm font-medium text-stone-900 placeholder:text-stone-500 focus:outline-none"
          />

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                onClear?.();
              }}
              aria-label="입력 지우기 및 초기화"
              title="입력 문장 및 결과 초기화"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-mono font-bold text-white transition-all duration-150 hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-emerald-950/50 disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>수어 변환</span>
          </button>
        </div>
      </form>

      {/* 장문 입력 시 글자수 제한 카운터 표시 (120자 이상일 때 노출, 스크린 리더에는 항상 제공) */}
      <div
        id="translate-input-counter"
        className={
          value.length >= 120
            ? "flex justify-end px-1 text-[11px] font-mono tabular-nums text-stone-600"
            : "sr-only"
        }
      >
        {value.length} / {MAX_SENTENCE_LENGTH}자
      </div>

      {speechError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200"
        >
          <span className="break-words min-w-0">{speechError}</span>
          <button
            type="button"
            onClick={handleToggleSpeech}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <RotateCcw className="h-3 w-3" />
            <span>다시 시도</span>
          </button>
        </div>
      )}

      {/* 최근 검색한 문장 원터치 칩 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-mono font-semibold text-stone-600">
          <Clock className="h-3 w-3 text-emerald-700" />
          최근 검색한 문장:
        </span>
        {recentSearches.length === 0 ? (
          <span className="text-xs text-stone-600 py-1.5">
            변환한 문장이 이곳에 자동 저장됩니다
          </span>
        ) : (
          <>
            {recentSearches.map((sentence) => {
              const isSelected = value.trim() === sentence;
              return (
                <div
                  key={sentence}
                  className={`inline-flex min-h-9 shrink-0 items-center rounded-md border transition-all duration-150 ${
                    isSelected
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      onChange(sentence);
                      onSubmit(sentence);
                    }}
                    className={`touch-target inline-flex min-h-9 items-center pl-3 pr-1.5 py-1.5 text-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      isSelected ? "font-bold text-white" : "font-medium text-stone-700"
                    }`}
                  >
                    {sentence}
                  </button>
                  {onDeleteRecentSearch && (
                    <button
                      type="button"
                      onClick={() => onDeleteRecentSearch(sentence)}
                      aria-label={`최근 검색 '${sentence}' 삭제`}
                      title="이 검색 기록 삭제"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded mr-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                        isSelected
                          ? "text-white hover:bg-emerald-800"
                          : "text-stone-500 hover:bg-stone-200 hover:text-stone-900"
                      }`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {onClearRecentSearches && recentSearches.length > 1 && (
              <button
                type="button"
                onClick={onClearRecentSearches}
                className="touch-target inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-stone-100 px-2.5 py-1.5 text-[11px] font-mono font-semibold text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <Trash2 className="h-3 w-3" />
                <span>전체 삭제</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
