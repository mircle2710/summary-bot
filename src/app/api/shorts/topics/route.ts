import { NextResponse } from "next/server";
import { formatVertexError, suggestShortsTopics } from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증/i.test(message)) return 401;
  if (/한도|quota|429/i.test(message)) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const body = (await request.json()) as {
      title?: string;
      summary?: string;
      keyPoints?: string[];
      customPrompt?: string;
    };
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "먼저 요약을 생성해 주세요." }, { status: 400 });
    }
    const topics = await suggestShortsTopics({
      title: body.title || "",
      summary: body.summary,
      keyPoints: body.keyPoints || [],
      customPrompt: body.customPrompt,
      credentials,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
