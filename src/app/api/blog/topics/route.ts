import { NextResponse } from "next/server";
import { formatVertexError, suggestBlogTopics } from "@/lib/ai";
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
      return NextResponse.json({ error: "본문 내용이 없습니다." }, { status: 400 });
    }
    const topics = await suggestBlogTopics({
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
