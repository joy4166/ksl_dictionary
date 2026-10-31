"use client";

import SignCard from "@/components/translate/SignCard";
import { SignWordEntry, TranslatedSignToken } from "@/types/sign";

interface SignSequenceListProps {
  sequence: TranslatedSignToken[];
  onSwapAlternative: (tokenIndex: number, newSign: SignWordEntry) => void;
  isLargeMode?: boolean;
}

export default function SignSequenceList({
  sequence,
  onSwapAlternative,
  isLargeMode = false,
}: SignSequenceListProps) {
  if (sequence.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold text-stone-900">
          순서대로 따라 하는 수어 카드{" "}
          <span className="font-mono tabular-nums text-emerald-800">
            ({sequence.length}단계)
          </span>
        </h2>
        <span className="text-[11px] font-mono text-stone-600">
          카드를 터치하면 영상이 재생됩니다
        </span>
      </div>

      <div
        className={
          isLargeMode
            ? "space-y-4"
            : "grid grid-cols-1 md:grid-cols-2 gap-3 items-start"
        }
      >
        {sequence.map((token, idx) => (
          <div
            key={`${token.selectedSign.id}_${idx}`}
            style={{ "--step-index": idx } as React.CSSProperties}
            className="motion-step-enter"
          >
            <SignCard
              stepNumber={idx + 1}
              sign={token.selectedSign}
              originalPart={token.originalPart}
              selectionReason={token.selectionReason}
              alternativeSigns={token.alternativeSigns}
              onSelectAlternative={(newSign) => onSwapAlternative(idx, newSign)}
              isLargeMode={isLargeMode}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
