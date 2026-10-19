import { NextRequest, NextResponse } from "next/server";
import { searchReverseSignByMotion } from "@/lib/gemini";

/**
 * POST /api/reverse-search
 * 어르신이 표현하신 수어의 손동작 묘사 텍스트(descriptionQuery)와
 * 빠른 선택 부위/손모양 칩 배열(selectedChips)을 받아 일치하는 수어 후보 리스트를 반환합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const descriptionQuery =
      typeof body?.descriptionQuery === "string"
        ? body.descriptionQuery.trim()
        : "";
    const selectedChips = Array.isArray(body?.selectedChips)
      ? body.selectedChips.filter(
          (c: unknown): c is string => typeof c === "string"
        )
      : [];
    const customApiKey =
      typeof body?.apiKey === "string" ? body.apiKey.trim() : undefined;

    const candidates = await searchReverseSignByMotion(
      descriptionQuery,
      selectedChips,
      customApiKey
    );

    return NextResponse.json(
      {
        query: descriptionQuery,
        selectedChips,
        candidates,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[POST /api/reverse-search] Error:", error);
    return NextResponse.json(
      { error: "수어 동작 역검색 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
