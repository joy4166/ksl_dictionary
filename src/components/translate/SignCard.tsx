"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Gauge,
  Play,
  RotateCcw,
  Sparkles,
  VideoOff,
} from "lucide-react";
import { memo, useRef, useState } from "react";
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

const SignCard = memo(function SignCard({
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
  const [videoRetryKey, setVideoRetryKey] = useState(0);
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
  const vttCaptionDataUri = `data:text/vtt;charset=utf-8,${encodeURIComponent(
    `WEBVTT\n\n00:00.000 --> 00:30.000\n[${sign.word}] ${
      sign.actionSummary || sign.signDescription
    }`
  )}`;

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleToggleVideo = () => {
    setVideoError(false);
    setShowVideo((prev) => !prev);
  };

  const handleRetryVideo = () => {
    setVideoError(false);
    setVideoRetryKey((prev) => prev + 1);
  };

  return (
    <article className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      {/* 상단 카드 헤더: 순서 번호 + 수어 표제어 + 동음이의어 전환 버튼 */}
      <div className="flex items-start justify-between gap-2 border-b border-stone-200 bg-stone-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof stepNumber === "number" && (
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg bg-emerald-700 font-mono font-bold tabular-nums text-white ${
                isLargeMode ? "h-9 w-9 text-lg" : "h-7 w-7 text-sm"
              }`}
            >
              {stepNumber}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3
                className={`font-extrabold text-stone-900 tracking-tight break-words ${
                  isLargeMode ? "text-2xl" : "text-lg"
                }`}
              >
                {sign.word}
              </h3>
              {!isLargeMode && originalPart && originalPart !== sign.word && (
                <span className="max-w-44 truncate rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] font-mono text-stone-600">
                  원문: {originalPart}
                </span>
              )}
              {!isLargeMode && (
                <span className="rounded-md border border-emerald-200 bg-emerald-50/70 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-800">
                  {sign.category}
                </span>
              )}
            </div>
            <p
              className={`text-stone-600 mt-0.5 break-words ${
                isLargeMode ? "text-base font-medium" : "text-xs"
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
            aria-expanded={showAlternatives}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-mono font-bold text-stone-800 transition-all duration-150 hover:bg-stone-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
          >
            <ArrowLeftRight className="h-3 w-3 text-emerald-700" />
            <span>
              다른 뜻 <span className="tabular-nums">({alternativeSigns.length})</span>
            </span>
          </button>
        )}
      </div>

      {/* AI 동음이의어 문맥 선택 이유 배너 (예: '보내다' -> '지내다') */}
      {selectionReason && (
        <div className="flex items-start gap-2 bg-amber-50/60 border-b border-amber-200/70 px-4 py-2 text-xs text-amber-950">
          <Sparkles className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">
            <span className="font-mono font-bold text-amber-900 mr-1.5">[문맥 맞춤 선택]</span>
            {selectionReason}
          </div>
        </div>
      )}

      {/* 동음이의어 교체 드로어 */}
      {showAlternatives && alternativeSigns.length > 0 && (
        <div className="motion-panel-reveal border-b border-stone-200 bg-stone-50 p-3 space-y-2">
          <div className="text-xs font-semibold text-stone-900">
            문맥에 따라 다른 수어(동음이의어·유사어)로 변경할 수 있습니다:
          </div>
          <div className="space-y-1.5">
            {alternativeSigns.map((alt) => (
              <div
                key={alt.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white p-2.5 border border-stone-200"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-stone-900">
                      <span className="select-none mr-1" aria-hidden="true">
                        {alt.handShapeHint || "👐"}
                      </span>
                      {alt.word}
                    </span>
                    <span className="text-[11px] text-stone-600 truncate">
                      ({alt.meaning})
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5 break-words">
                    동작: {alt.actionSummary || alt.signDescription}
                  </p>
                </div>
                {onSelectAlternative && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAlternative(alt);
                      setShowAlternatives(false);
                    }}
                    className="inline-flex min-h-8 shrink-0 items-center rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-mono font-bold text-white hover:bg-emerald-800 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1"
                  >
                    이 수어로 변경
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 본문 영역: 국립국어원 실제 수형 사진 + 1초 핵심 손동작 요약 */}
      <div className="p-3.5 space-y-3">
        <div
          className={`flex items-stretch gap-3 ${
            isLargeMode ? "flex-col" : "flex-col sm:flex-row"
          }`}
        >
          {/* 수형 사진 및 단일 동영상 재생 토글 버튼 */}
          <button
            type="button"
            onClick={handleToggleVideo}
            aria-expanded={showVideo}
            aria-label={`${sign.word} 수어 영상 ${showVideo ? "닫기" : "재생하기"}`}
            className={`group relative flex flex-col items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-2 text-left cursor-pointer hover:border-emerald-700 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 overflow-hidden ${
              isLargeMode ? "w-full min-h-52" : "min-h-36 sm:w-40 shrink-0"
            }`}
          >
            {validImages.length > 0 && !imgErrorMap[0] ? (
              <div className="relative w-full flex-1 flex items-center justify-center gap-1.5 overflow-hidden rounded-md bg-white border border-stone-200 p-1">
                {validImages.slice(0, 2).map((imgUrl, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={imgUrl}
                    src={toProxiedMediaUrl(imgUrl)}
                    alt={`${sign.word} 수형 사진 ${i + 1}`}
                    width={215}
                    height={161}
                    loading="lazy"
                    decoding="async"
                    onError={() =>
                      setImgErrorMap((prev) => ({ ...prev, [i]: true }))
                    }
                    className={`${
                      validImages.length > 1 ? "w-1/2" : "w-full"
                    } ${
                      isLargeMode ? "h-44" : "h-28"
                    } object-contain rounded-md transition-transform duration-150 group-hover:scale-105`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-3 w-full">
                <div
                  className={`select-none leading-none transition-transform duration-150 group-hover:scale-110 ${
                    isLargeMode ? "text-6xl" : "text-4xl"
                  }`}
                  aria-hidden="true"
                >
                  {sign.handShapeHint || "👐"}
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {sign.keywords.slice(0, 3).map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-mono text-stone-600 border border-stone-200"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <span className="mt-2 w-full inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-mono font-bold text-white transition-colors duration-150 group-hover:bg-emerald-800">
              <Play className="h-3 w-3 fill-current" />
              <span>{showVideo ? "동영상 닫기" : "수어 영상 재생"}</span>
            </span>
          </button>

          {/* 핵심 손동작 요약 (현장에서 1초 만에 읽고 따라 하기) */}
          <div className="flex-1 min-w-0 flex flex-col justify-between rounded-lg bg-stone-50/90 p-3.5 border border-stone-200">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-emerald-800 uppercase tracking-wider">
                  1초 핵심 손동작
                </span>
                <span className="text-xs select-none" aria-hidden="true">
                  {sign.handShapeHint || "👐"}
                </span>
              </div>
              <p
                className={`mt-1.5 font-extrabold text-stone-900 leading-snug break-keep break-words ${
                  isLargeMode ? "text-xl" : "text-base"
                }`}
              >
                {sign.actionSummary || sign.signDescription}
              </p>
            </div>

            {/* 하단 보조 정보 토글 */}
            <div className="mt-3 pt-2 border-t border-stone-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFullDesc((prev) => !prev)}
                aria-expanded={showFullDesc}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1 -ml-2 text-xs font-mono font-semibold text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>수형 원문·유의어 보기</span>
                {showFullDesc ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 국립국어원 수형 원문 및 유의어 상세 정보 */}
        {showFullDesc && (
          <div className="motion-panel-reveal rounded-lg bg-stone-100/80 px-3.5 py-2.5 text-xs text-stone-800 space-y-1.5 border border-stone-200 leading-relaxed break-words">
            <div>
              <span className="font-mono font-bold text-stone-900 mr-1.5">
                [국립국어원 수형 설명]
              </span>
              {sign.signDescription}
            </div>
            {sign.synonyms && sign.synonyms.length > 0 && (
              <div>
                <span className="font-mono font-bold text-stone-900 mr-1.5">
                  [한국어 대응표현]
                </span>
                {sign.synonyms.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* 수어 동영상 플레이어 (0.5배속 및 에러 재시도 지원) */}
        {showVideo && (
          <div className="motion-panel-reveal rounded-lg overflow-hidden bg-stone-900 border border-stone-800 p-3 text-white space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-mono font-bold text-stone-100">
                <Film className="h-3.5 w-3.5 text-emerald-400" />
                <span>국립국어원 수어 영상 ({sign.word})</span>
              </span>

              <div className="flex items-center gap-1.5">
                {/* 0.5배속(천천히 따라하기) / 1.0배속 토글 */}
                <button
                  type="button"
                  onClick={() =>
                    handleSpeedChange(playbackRate === 1.0 ? 0.5 : 1.0)
                  }
                  aria-pressed={playbackRate === 0.5}
                  aria-label={`영상 재생 속도 전환 (현재 ${
                    playbackRate === 0.5 ? "0.5배속 느리게" : "1.0배속 기본"
                  })`}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-mono font-bold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    playbackRate === 0.5
                      ? "bg-emerald-600 text-white"
                      : "border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700"
                  }`}
                >
                  <Gauge className="h-3 w-3" />
                  <span className="tabular-nums">
                    {playbackRate === 0.5 ? "0.5배속" : "1.0배속"}
                  </span>
                </button>

                <a
                  href={sldictSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1 text-[11px] font-mono text-stone-300 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span>사전 원문</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {proxiedVideoUrl && !videoError ? (
              <video
                ref={videoRef}
                key={`${proxiedVideoUrl}_${videoRetryKey}`}
                src={proxiedVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                controls
                aria-label={`${sign.word} 수어 동작 시연 영상 (${sign.actionSummary || sign.signDescription})`}
                onLoadedMetadata={(e) => {
                  e.currentTarget.playbackRate = playbackRate;
                }}
                onError={() => setVideoError(true)}
                className={`w-full rounded-md bg-black object-contain ${
                  isLargeMode ? "max-h-80" : "max-h-64"
                }`}
              >
                <track
                  kind="captions"
                  srcLang="ko"
                  label="한국수어 동작 설명"
                  src={vttCaptionDataUri}
                  default
                />
              </video>
            ) : (
              <div
                role="alert"
                className="flex flex-col items-center justify-center rounded-md bg-stone-800 p-5 text-center space-y-2.5 border border-stone-700"
              >
                <VideoOff className="h-7 w-7 text-stone-400" />
                <div className="text-xs text-stone-200 font-medium">
                  이 단어의 동영상을 불러오지 못했습니다.
                </div>
                <div className="flex items-center gap-1 text-[11px] text-stone-300 break-words">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{sign.signDescription}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetryVideo}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-mono font-bold text-white hover:bg-emerald-500 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>영상 다시 불러오기</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
});

export default SignCard;
