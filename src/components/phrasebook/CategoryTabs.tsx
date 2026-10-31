"use client";

import {
  Activity,
  Bookmark,
  HeartPulse,
  Home,
  LayoutGrid,
  Smile,
  Utensils,
} from "lucide-react";
import { PhraseCategoryId, PhraseCategoryInfo } from "@/types/sign";

export type FilterCategoryType = "all" | PhraseCategoryId;

interface CategoryTabsProps {
  categories: PhraseCategoryInfo[];
  selectedCategory: FilterCategoryType;
  onSelectCategory: (cat: FilterCategoryType) => void;
  countsByCategory: Record<string, number>;
}

const ICON_MAP: Record<string, typeof Smile> = {
  Smile,
  Utensils,
  HeartPulse,
  Activity,
  Home,
};

export default function CategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  countsByCategory,
}: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar touch-pan-x">
      <button
        type="button"
        onClick={() => onSelectCategory("all")}
        aria-pressed={selectedCategory === "all"}
        className={`touch-target inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
          selectedCategory === "all"
            ? "border-emerald-700 bg-emerald-700 font-bold text-white"
            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>전체</span>
        <span
          className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums ${
            selectedCategory === "all"
              ? "bg-emerald-800 text-white"
              : "bg-stone-100 text-stone-600"
          }`}
        >
          {countsByCategory.all || 0}
        </span>
      </button>

      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.iconName] || Bookmark;
        const isSelected = selectedCategory === cat.id;
        const count = countsByCategory[cat.id] || 0;

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            aria-pressed={isSelected}
            className={`touch-target inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
              isSelected
                ? "border-emerald-700 bg-emerald-700 font-bold text-white"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{cat.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums ${
                isSelected
                  ? "bg-emerald-800 text-white"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
