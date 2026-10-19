import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/media-proxy?url=https://sldict.korean.go.kr/multimedia/...
 * 국립국어원 한국수어사전(sldict.korean.go.kr)의 동영상(.mp4) 및 수형 사진(.jpg)을
 * 브라우저 CORS / Referer / Mixed-Content 차단 없이 안정적으로 스트리밍하는 프록시 라우트입니다.
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl.replace(/^http:\/\//i, "https://"));
  } catch {
    return new NextResponse("Invalid url parameter", { status: 400 });
  }

  // 보안: sldict.korean.go.kr 도메인만 허용
  if (targetUrl.hostname !== "sldict.korean.go.kr") {
    return new NextResponse("Forbidden domain", { status: 403 });
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://sldict.korean.go.kr/",
  };

  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const resHeaders = new Headers();
    const contentType =
      upstream.headers.get("content-type") ||
      (targetUrl.pathname.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
    resHeaders.set("Content-Type", contentType);
    resHeaders.set("Cache-Control", "public, max-age=86400, immutable");
    resHeaders.set("Accept-Ranges", "bytes");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      resHeaders.set("Content-Length", contentLength);
    }

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      resHeaders.set("Content-Range", contentRange);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("[GET /api/media-proxy] Error:", err);
    return new NextResponse("Media fetch failed", { status: 502 });
  }
}
