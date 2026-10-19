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
      className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 py-1.5"
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
              className={`relative flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-bold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`h-5 w-5 ${
                    isActive ? "text-blue-600 stroke-[2.5]" : "text-slate-500"
                  }`}
                />
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className=" -top-1.5 -right-3.5 absolute rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-xs leading-none">{item.label}</span>
              <span className="mt-0.5 text-[10px] text-slate-400 leading-none">
                {item.subLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
