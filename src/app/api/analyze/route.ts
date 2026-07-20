import { NextResponse } from "next/server";
import { analyzeSummary, formatGeminiError } from "@/lib/ai";
import { getGeminiApiKey } from "@/lib/request-keys";
import type { AnalysisType } from "@/lib/types";

const VALID: AnalysisType[] = ["incident", "cause", "solution"];

function statusFromMessage(message: string) {
  if (/API 키/i.test(message)) return 401;
  if (/쿼터/i.test(message)) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const geminiApiKey = getGeminiApiKey(request);
    const body = (await request.json()) as {
      type?: AnalysisType;
      title?: string;
      summary?: string;
      keyPoints?: string[];
      transcript?: string;
    };

    if (!body.type || !VALID.includes(body.type)) {
      return NextResponse.json({ error: "분석 유형이 올바르지 않습니다." }, { status: 400 });
    }
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "먼저 요약을 생성해 주세요." }, { status: 400 });
    }

    const result = await analyzeSummary({
      type: body.type,
      title: body.title || "",
      summary: body.summary,
      keyPoints: body.keyPoints || [],
      transcript: body.transcript,
      apiKey: geminiApiKey,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = formatGeminiError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
