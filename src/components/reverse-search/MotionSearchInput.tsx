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
}

const CHIP_GROUPS: Array<{ title: string; chips: string[] }> = [
  {
    title: "✋ 손 모양 / 손 개수",
    chips: ["주먹", "검지(1지)", "엄지", "손바닥 폄", "양손", "한손"],
  },
  {
    title: "📍 위치 / 신체 부위",
    chips: ["머리카락/이마", "눈/코/입", "볼/턱", "가슴 앞", "배"],
  },
  {
    title: "🔄 움직임 방향 / 동작",
    chips: ["위아래로", "좌우로", "돌리기", "두드리기", "스치기"],
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
    chips: ["한손", "손바닥 폄", "볼/턱", "스치기"],
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
}: MotionSearchInputProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="space-y-3">
      {/* 안내 배너 */}
      <div className="rounded-2xl bg-indigo-50/90 border border-indigo-200 px-3.5 py-2.5 text-xs text-indigo-950 flex items-start gap-2">
        <Hand className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold text-indigo-800">
            어르신의 수어 동작 뜻을 모를 때:
          </span>{" "}
          눈으로 본 <strong>손 모양·부위·움직임 태그</strong>를 고르거나 손동작을 그대로 적어보세요.
        </div>
      </div>

      {/* 빠른 부위/손모양 칩 선택 패널 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800">
            빠른 동작 특징 선택 ({selectedChips.length}개 선택됨)
          </span>
          {(selectedChips.length > 0 || query.trim().length > 0) && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600"
            >
              <RotateCcw className="h-3 w-3" />
              <span>초기화</span>
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {CHIP_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-500">
                {group.title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.chips.map((chip) => {
                  const isSelected = selectedChips.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => onToggleChip(chip)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-200"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
      <form onSubmit={handleFormSubmit}>
        <div className="flex items-center gap-1.5 rounded-2xl border-2 border-indigo-600 bg-white p-1.5 shadow-sm focus-within:ring-4 focus-within:ring-indigo-100">
          <input
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="예: 오른손 엄지를 코끝에 대고 앞으로 내민다"
            className="w-full min-w-0 bg-transparent px-2.5 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
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
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-500">
          <Sparkles className="h-3 w-3 text-indigo-600" />
          동작 묘사 예시:
        </span>
        {REVERSE_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => onSelectExample(ex.query, ex.chips)}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 active:scale-95"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
