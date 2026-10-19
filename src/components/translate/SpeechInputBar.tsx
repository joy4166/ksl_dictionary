"use client";

import { Loader2, Mic, MicOff, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SpeechInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (sentence: string) => void;
  isLoading: boolean;
}

const QUICK_EXAMPLES = [
  "추석 잘 보내세요",
  "오늘 점심 맛있게 드셨어요?",
  "어디 편찮으신 곳 있으세요?",
  "잠시 후 체조 시작해요",
  "조심히 들어가세요",
];

export default function SpeechInputBar({
  value,
  onChange,
  onSubmit,
  isLoading,
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
      onChange(transcript);
      if (event.results[0]?.isFinal) {
        setIsListening(false);
        if (transcript.trim()) {
          onSubmit(transcript.trim());
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
    recognition.start();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim());
  };

  return (
    <div className="space-y-2.5">
      <form onSubmit={handleFormSubmit} className="relative">
        <div
          className={`flex items-center gap-1.5 rounded-2xl border-2 bg-white p-1.5 shadow-sm transition-all ${
            isListening
              ? "border-rose-500 ring-4 ring-rose-100"
              : "border-blue-600 focus-within:ring-4 focus-within:ring-blue-100"
          }`}
        >
          {/* 음성 인식(STT) 버튼 */}
          <button
            type="button"
            onClick={handleToggleSpeech}
            title="음성으로 문장 입력하기 (한국어 STT)"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
              isListening
                ? "animate-pulse bg-rose-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>

          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              isListening
                ? "말씀해 주세요... (듣고 있습니다)"
                : "어르신께 전할 말을 입력하세요 (예: 추석 잘 보내세요)"
            }
            className="w-full min-w-0 bg-transparent px-1.5 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="입력 지우기"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 disabled:bg-slate-300"
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

      {speechError && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-200">
          {speechError}
        </p>
      )}

      {/* 현장 빈출 문장 원터치 예시 칩 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-500">
          <Sparkles className="h-3 w-3 text-blue-600" />
          빠른 예시:
        </span>
        {QUICK_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              onChange(example);
              onSubmit(example);
            }}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 ${
              value.trim() === example
                ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
