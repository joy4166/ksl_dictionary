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
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
      <button
        type="button"
        onClick={() => onSelectCategory("all")}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
          selectedCategory === "all"
            ? "bg-blue-600 text-white shadow-xs"
            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>전체</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            selectedCategory === "all"
              ? "bg-blue-500 text-white"
              : "bg-slate-100 text-slate-600"
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
              isSelected
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{cat.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 text-slate-600"
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
