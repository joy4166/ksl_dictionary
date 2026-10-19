"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Gauge,
  Play,
  Sparkles,
  VideoOff,
} from "lucide-react";
import { useRef, useState } from "react";
import { SignWordEntry } from "@/types/sign";

interface SignCardProps {
  stepNumber?: number;
  sign: SignWordEntry;
  originalPart?: string;
  selectionReason?: string;
  alternativeSigns?: SignWordEntry[];
  onSelectAlternative?: (newSign: SignWordEntry) => void;
  isLargeMode?: boolean;
}

/**
 * 국립국어원(sldict.korean.go.kr) 미디어 URL을 로컬 프록시(/api/media-proxy) 경로로 변환하여
 * 브라우저 CORS / Referer / Mixed-Content 차단 없이 100% 재생되도록 보장합니다.
 */
function toProxiedMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (url.includes("sldict.korean.go.kr")) {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function SignCard({
  stepNumber,
  sign,
  originalPart,
  selectionReason,
  alternativeSigns = [],
  onSelectAlternative,
  isLargeMode = false,
}: SignCardProps) {
  const [showVideo, setShowVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [imgErrorMap, setImgErrorMap] = useState<Record<number, boolean>>({});
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const sldictSearchUrl = `https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=${encodeURIComponent(
    sign.word
  )}`;

  const proxiedVideoUrl = toProxiedMediaUrl(sign.videoUrl);
  const validImages = (sign.imageUrls || []).filter(
    (u) => u && u.includes("sldict.korean.go.kr")
  );

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  return (
    <article
      className={`rounded-2xl border bg-white transition-all shadow-xs overflow-hidden ${
        selectionReason
          ? "border-blue-300 ring-1 ring-blue-100"
          : "border-slate-200"
      }`}
    >
      {/* 상단 카드 헤더: 순서 번호 + 수어 표제어 + 동음이의어 전환 버튼 */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {typeof stepNumber === "number" && (
            <span
              className={`flex shrink-0 items-center justify-center rounded-xl bg-blue-600 font-extrabold text-white shadow-2xs ${
                isLargeMode ? "h-8 w-8 text-base" : "h-7 w-7 text-sm"
              }`}
            >
              {stepNumber}
            </span>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h3
                className={`font-extrabold text-slate-900 ${
                  isLargeMode ? "text-xl" : "text-lg"
                }`}
              >
                {sign.word}
              </h3>
              {originalPart && originalPart !== sign.word && (
                <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  원문: {originalPart}
                </span>
              )}
              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {sign.category}
              </span>
            </div>
            <p
              className={`text-slate-500 mt-0.5 ${
                isLargeMode ? "text-sm" : "text-xs"
              }`}
            >
              뜻: {sign.meaning}
            </p>
          </div>
        </div>

        {/* 동음이의어/유의어 수동 교체 버튼 */}
        {alternativeSigns.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAlternatives((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 active:scale-95"
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span>다른 뜻 ({alternativeSigns.length})</span>
          </button>
        )}
      </div>

      {/* AI 동음이의어 문맥 선택 이유 배너 (예: '보내다' -> '지내다') */}
      {selectionReason && (
        <div className="flex items-start gap-2 bg-blue-50/80 border-b border-blue-100 px-4 py-2 text-xs text-blue-900">
          <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-blue-700 mr-1">[문맥 맞춤 선택]</span>
            {selectionReason}
          </div>
        </div>
      )}

      {/* 동음이의어 교체 드로어 */}
      {showAlternatives && alternativeSigns.length > 0 && (
        <div className="border-b border-indigo-100 bg-indigo-50/50 px-4 py-3 space-y-2">
          <div className="text-xs font-bold text-indigo-900">
            문맥에 따라 다른 수어(동음이의어·유사어)로 변경할 수 있습니다:
          </div>
          <div className="space-y-1.5">
            {alternativeSigns.map((alt) => (
              <div
                key={alt.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white p-2.5 border border-indigo-200 shadow-2xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">
                      {alt.handShapeHint || "👐"} {alt.word}
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">
                      ({alt.meaning})
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    동작: {alt.signDescription || alt.actionSummary}
                  </p>
                </div>
                {onSelectAlternative && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAlternative(alt);
                      setShowAlternatives(false);
                    }}
                    className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    이 수어로 변경
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 본문 영역: 국립국어원 실제 수형 사진 + 핵심 손동작 설명 */}
      <div className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          {/* 수형 사진 카드 (터치 시 동영상 토글) */}
          <div
            onClick={() => {
              setVideoError(false);
              setShowVideo((prev) => !prev);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setVideoError(false);
                setShowVideo((prev) => !prev);
              }
            }}
            className={`group relative flex flex-col items-center justify-between rounded-2xl border-2 border-blue-200 bg-slate-900/5 p-2 cursor-pointer hover:border-blue-500 transition-all select-none overflow-hidden ${
              isLargeMode ? "min-h-44 sm:w-48" : "min-h-36 sm:w-40"
            }`}
          >
            {validImages.length > 0 && !imgErrorMap[0] ? (
              <div className="relative w-full flex-1 flex items-center justify-center gap-1 overflow-hidden rounded-xl bg-white">
                {validImages.slice(0, 2).map((imgUrl, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={imgUrl}
                    src={toProxiedMediaUrl(imgUrl)}
                    alt={`${sign.word} 수형 사진 ${i + 1}`}
                    onError={() =>
                      setImgErrorMap((prev) => ({ ...prev, [i]: true }))
                    }
                    className={`${
                      validImages.length > 1 ? "w-1/2" : "w-full"
                    } h-28 object-contain rounded-lg transition-transform group-hover:scale-105`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-3">
                <div
                  className={`leading-none transition-transform group-hover:scale-110 ${
                    isLargeMode ? "text-5xl" : "text-4xl"
                  }`}
                >
                  {sign.handShapeHint || "👐"}
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {sign.keywords.slice(0, 3).map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <span className="mt-1.5 w-full inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs group-hover:bg-blue-700">
              <Play className="h-3 w-3 fill-current" />
              {showVideo ? "동영상 닫기" : "수어 영상 재생"}
            </span>
          </div>

          {/* 핵심 손동작 요약 (현장에서 1초 만에 읽고 따라 하기) */}
          <div className="flex-1 flex flex-col justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                  핵심 손동작 가이드
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {sign.handShapeHint || "👐"}
                </span>
              </div>
              <p
                className={`mt-1.5 font-extrabold text-slate-900 leading-snug ${
                  isLargeMode ? "text-lg" : "text-base"
                }`}
              >
                {sign.actionSummary || sign.signDescription}
              </p>
              {sign.signDescription &&
                sign.actionSummary &&
                sign.signDescription !== sign.actionSummary && (
                  <p
                    className={`mt-1.5 text-slate-600 leading-relaxed ${
                      isLargeMode ? "text-sm" : "text-xs"
                    }`}
                  >
                    • 수형 설명: {sign.signDescription}
                  </p>
                )}
            </div>

            {/* 하단 액션 바 */}
            <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFullDesc((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700"
              >
                <span>키워드·유의어 보기</span>
                {showFullDesc ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {proxiedVideoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setVideoError(false);
                    setShowVideo((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-100/80 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-200"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{showVideo ? "영상 접기" : "영상 보기"}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 키워드 및 유의어 상세 정보 (펼쳤을 때 노출) */}
        {showFullDesc && (
          <div className="rounded-xl bg-slate-100/80 px-3.5 py-2.5 text-xs text-slate-700 space-y-1.5 border border-slate-200">
            <div>
              <span className="font-bold text-slate-900 mr-1.5">[수형 설명 원문]</span>
              {sign.signDescription}
            </div>
            {sign.synonyms && sign.synonyms.length > 0 && (
              <div>
                <span className="font-bold text-slate-900 mr-1.5">[한국어 대응표현]</span>
                {sign.synonyms.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* 수어 동영상 플레이어 (카드 터치 시 프록시 스트리밍으로 즉시 재생 + 0.5배속 지원) */}
        {showVideo && (
          <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 p-3 text-white space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-blue-300">
                🎥 국립국어원 수어 동영상 ({sign.word})
              </span>

              <div className="flex items-center gap-1.5">
                {/* 0.5배속(천천히 따라하기) / 1.0배속 토글 */}
                <button
                  type="button"
                  onClick={() =>
                    handleSpeedChange(playbackRate === 1.0 ? 0.5 : 1.0)
                  }
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-all ${
                    playbackRate === 0.5
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  <Gauge className="h-3 w-3" />
                  <span>
                    {playbackRate === 0.5 ? "0.5배속 (천천히)" : "1.0배속 (기본)"}
                  </span>
                </button>

                <a
                  href={sldictSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                >
                  <span>사전 원문</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {proxiedVideoUrl && !videoError ? (
              <video
                ref={videoRef}
                key={proxiedVideoUrl}
                src={proxiedVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                controls
                onLoadedMetadata={(e) => {
                  e.currentTarget.playbackRate = playbackRate;
                }}
                onError={() => setVideoError(true)}
                className="w-full max-h-64 rounded-xl bg-black object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 p-5 text-center space-y-2">
                <VideoOff className="h-7 w-7 text-slate-400" />
                <div className="text-xs text-slate-200 font-medium">
                  이 단어의 동영상을 불러오지 못했습니다.
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-300 pt-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{sign.signDescription}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
