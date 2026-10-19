import { NextRequest, NextResponse } from "next/server";
import { translateKoreanToKsl } from "@/lib/gemini";

/**
 * POST /api/translate
 * 한국어 자연어 문장을 입력받아 KSL 어순 분해, 동음이의어 문맥 선택, 비수지 기호(표정) 팁이 포함된
 * TranslationResult JSON을 반환합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sentence =
      typeof body?.sentence === "string" ? body.sentence.trim() : "";
    const customApiKey =
      typeof body?.apiKey === "string" ? body.apiKey.trim() : undefined;

    if (!sentence) {
      return NextResponse.json(
        { error: "번역할 한국어 문장을 입력해 주세요." },
        { status: 400 }
      );
    }

    if (sentence.length > 200) {
      return NextResponse.json(
        { error: "문장은 200자 이내로 입력해 주세요." },
        { status: 400 }
      );
    }

    const result = await translateKoreanToKsl(sentence, customApiKey);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[POST /api/translate] Error:", error);
    return NextResponse.json(
      { error: "수어 문맥 변환 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
