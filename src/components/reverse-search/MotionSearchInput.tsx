"use client";

import { Hand, Loader2, RotateCcw, Search, Sparkles } from "lucide-react";

interface MotionSearchInputProps {
  query: string;
  onChangeQuery: (val: string) => void;
  selectedChips: string[];
  onToggleChip: (chip: string) => void;
  onReset: () => void;
  onSubmit: () => void;
  onSelectExample: (exampleQuery: string, exampleChips: string[]) => void;
  isLoading: boolean;
  resultCount?: number;
}

const MAX_REVERSE_QUERY_LENGTH = 150;

const CHIP_GROUPS: Array<{ code: string; title: string; chips: string[] }> = [
  {
    code: "01",
    title: "수형 · 손 모양 / 손 개수",
    chips: [
      "주먹",
      "검지(1지)",
      "엄지",
      "V자(2지)",
      "손바닥 폄",
      "손가락 접기",
      "양손",
      "한손",
    ],
  },
  {
    code: "02",
    title: "수위 · 위치 / 신체 부위",
    chips: [
      "머리카락/이마",
      "눈/코/입",
      "볼/턱",
      "귀/목",
      "어깨",
      "가슴 앞",
      "배",
      "손목/손등",
    ],
  },
  {
    code: "03",
    title: "수동 · 움직임 방향 / 동작",
    chips: [
      "위아래로",
      "좌우로",
      "앞으로 내밀기",
      "돌리기",
      "두드리기",
      "스치기/비비기",
      "흔들기",
      "맞대기",
    ],
  },
];

const REVERSE_EXAMPLES: Array<{
  label: string;
  query: string;
  chips: string[];
}> = [
  {
    label: "엄지를 코끝에 대고 앞으로",
    query: "오른손 엄지를 펴서 코끝에 댔다가 앞으로 내민다",
    chips: ["한손", "엄지", "눈/코/입"],
  },
  {
    label: "양손 주먹 가슴 앞 위아래",
    query: "양손 주먹을 쥐고 어깨·가슴 앞에서 위아래로 움직인다",
    chips: ["양손", "주먹", "가슴 앞", "위아래로"],
  },
  {
    label: "볼을 손끝으로 쓸어내리기",
    query: "오른손을 펴서 오른쪽 볼과 턱을 가볍게 스쳐 내린다",
    chips: ["한손", "손바닥 폄", "볼/턱", "스치기/비비기"],
  },
  {
    label: "손바닥 비빈 뒤 입으로",
    query: "왼손 바닥을 비빈 뒤 오른손을 입으로 가져간다",
    chips: ["양손", "손바닥 폄", "눈/코/입", "돌리기"],
  },
];

export default function MotionSearchInput({
  query,
  onChangeQuery,
  selectedChips,
  onToggleChip,
  onReset,
  onSubmit,
  onSelectExample,
  isLoading,
  resultCount,
}: MotionSearchInputProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    onSubmit();
  };

  const hasActiveFilter = selectedChips.length > 0 || query.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* 안내 배너 */}
      <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-950 flex items-start gap-2">
        <Hand className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
        <div className="min-w-0 break-words">
          <span className="font-mono font-bold text-amber-900 mr-1">
            어르신의 수어 동작 뜻을 모를 때:
          </span>
          눈으로 본 <strong>손 모양·부위·움직임 태그</strong>를 고르거나 손동작을 그대로 적어보세요.
        </div>
      </div>

      {/* 빠른 부위/손모양 칩 선택 패널 */}
      <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-stone-900">
              동작 특징 선택
            </span>
            <span className="rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-mono font-semibold tabular-nums text-stone-700">
              {selectedChips.length}개 선택
            </span>
            {typeof resultCount === "number" && (
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-bold tabular-nums ${
                  hasActiveFilter
                    ? "bg-emerald-700 text-white"
                    : "border border-stone-200 bg-stone-50 text-stone-600"
                }`}
              >
                일치 후보 {resultCount}건
              </span>
            )}
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-mono font-bold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span>초기화</span>
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {CHIP_GROUPS.map((group) => (
            <div key={group.code} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600">
                <span className="rounded bg-emerald-50 px-1.5 py-0.2 font-mono text-[10px] font-bold tabular-nums text-emerald-800 border border-emerald-200">
                  {group.code}
                </span>
                <span>{group.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.chips.map((chip) => {
                  const isSelected = selectedChips.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => onToggleChip(chip)}
                      aria-pressed={isSelected}
                      className={`touch-target inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
                        isSelected
                          ? "border-emerald-700 bg-emerald-700 font-bold text-white"
                          : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 손동작 자유 묘사 검색창 */}
      <form onSubmit={handleFormSubmit} noValidate>
        <label htmlFor="reverse-motion-query-input" className="sr-only">
          어르신의 손동작 묘사 입력 (최대 150자)
        </label>
        <div className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white p-1.5 transition-all duration-150 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700 focus-within:ring-offset-1">
          <input
            id="reverse-motion-query-input"
            type="text"
            value={query}
            onChange={(e) =>
              onChangeQuery(e.target.value.slice(0, MAX_REVERSE_QUERY_LENGTH))
            }
            maxLength={MAX_REVERSE_QUERY_LENGTH}
            placeholder="예: 오른손 엄지를 코끝에 대고 앞으로 내민다"
            className="w-full min-w-0 bg-transparent px-2.5 py-2 text-base sm:text-sm font-medium text-stone-900 placeholder:text-stone-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-mono font-bold text-white hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-emerald-950/50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>동작 역검색</span>
          </button>
        </div>
      </form>

      {/* 역검색 예시 버튼 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-mono font-semibold text-stone-600">
          <Sparkles className="h-3 w-3 text-emerald-700" />
          동작 묘사 예시:
        </span>
        {REVERSE_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            disabled={isLoading}
            onClick={() => onSelectExample(ex.query, ex.chips)}
            className="touch-target inline-flex min-h-9 shrink-0 items-center rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
