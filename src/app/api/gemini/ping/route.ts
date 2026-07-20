import { NextResponse } from "next/server";
import { formatGeminiError, pingGemini } from "@/lib/ai";
import { getGeminiApiKey } from "@/lib/request-keys";

export async function POST(request: Request) {
  try {
    const geminiApiKey = getGeminiApiKey(request);
    const result = await pingGemini(geminiApiKey);
    return NextResponse.json({
      ok: true,
      model: result.model,
      message: `연결 성공 (${result.model}). 유료/체험 키가 정상 동작합니다.`,
    });
  } catch (error) {
    const message = formatGeminiError(error);
    const status = /무료 한도|free_tier|한도/i.test(message)
      ? 429
      : /API 키/i.test(message)
        ? 401
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
