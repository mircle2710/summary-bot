import { NextResponse } from "next/server";
import { analyzeSummary, formatVertexError } from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";
import type { AnalysisType } from "@/lib/types";

const VALID: AnalysisType[] = ["incident", "cause", "solution"];

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증/i.test(message)) return 401;
  if (/한도|quota|429/i.test(message)) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
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
      credentials,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
