"use client";

import { BookmarkCheck, Hand, MessageSquareText } from "lucide-react";

export type ActiveTabId = "translate" | "phrasebook" | "reverse";

interface BottomNavProps {
  activeTab: ActiveTabId;
  onChangeTab: (tab: ActiveTabId) => void;
  savedCount: number;
}

export default function BottomNav({
  activeTab,
  onChangeTab,
  savedCount,
}: BottomNavProps) {
  const navItems: Array<{
    id: ActiveTabId;
    label: string;
    subLabel: string;
    icon: typeof MessageSquareText;
    badge?: number;
  }> = [
    {
      id: "translate",
      label: "문장 번역",
      subLabel: "어순·동음이의어",
      icon: MessageSquareText,
    },
    {
      id: "phrasebook",
      label: "상황별 문장함",
      subLabel: "원터치 즐겨찾기",
      icon: BookmarkCheck,
      badge: savedCount,
    },
    {
      id: "reverse",
      label: "수어 역검색",
      subLabel: "손동작으로 찾기",
      icon: Hand,
    },
  ];

  return (
    <nav
      aria-label="하단 메인 메뉴"
      className="sticky bottom-0 z-30 border-t border-stone-200 bg-stone-50/95 backdrop-blur-md px-2 pt-1.5 safe-bottom"
    >
      <div className="grid grid-cols-3 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center rounded-xl py-2 px-1 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
                isActive
                  ? "bg-emerald-50/90 text-emerald-950 font-bold border border-emerald-200"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`h-5 w-5 ${
                    isActive ? "text-emerald-700 stroke-[2.5]" : "text-stone-500"
                  }`}
                />
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className="-top-1.5 -right-3.5 absolute rounded-full bg-emerald-700 px-1.5 py-0.2 text-[10px] font-mono tabular-nums font-bold text-white border border-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-xs leading-none">{item.label}</span>
              <span
                className={`mt-0.5 text-[10px] leading-none ${
                  isActive ? "text-emerald-800 font-semibold" : "text-stone-500"
                }`}
              >
                {item.subLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
