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
        <h2 className="text-sm font-extrabold text-slate-800">
          순서대로 따라 하는 수어 카드 ({sequence.length}단계)
        </h2>
        <span className="text-[11px] text-slate-500">
          카드를 터치하면 영상이 재생됩니다
        </span>
      </div>

      <div className="space-y-3">
        {sequence.map((token, idx) => (
          <SignCard
            key={`${token.selectedSign.id}_${idx}`}
            stepNumber={idx + 1}
            sign={token.selectedSign}
            originalPart={token.originalPart}
            selectionReason={token.selectionReason}
            alternativeSigns={token.alternativeSigns}
            onSelectAlternative={(newSign) => onSwapAlternative(idx, newSign)}
            isLargeMode={isLargeMode}
          />
        ))}
      </div>
    </div>
  );
}
