import { NextResponse } from "next/server";
import { formatVertexError, writeBlogArticle } from "@/lib/ai";
import type { BlogFontId, BlogToneId } from "@/lib/blog";
import { getVertexCredentials } from "@/lib/request-keys";

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증|단락/i.test(message)) {
    if (/단락/i.test(message)) return 500;
    return 401;
  }
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
      topicTitle?: string;
      topicAngle?: string;
      customPrompt?: string;
      tone?: BlogToneId;
      font?: BlogFontId;
    };

    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "본문 내용이 없습니다." }, { status: 400 });
    }

    const tone = (["friendly", "expert", "warm", "concise"] as BlogToneId[]).includes(
      body.tone as BlogToneId,
    )
      ? (body.tone as BlogToneId)
      : "friendly";
    const font = (["sans", "serif", "display"] as BlogFontId[]).includes(
      body.font as BlogFontId,
    )
      ? (body.font as BlogFontId)
      : "sans";

    const article = await writeBlogArticle({
      title: body.title || "",
      summary: body.summary,
      keyPoints: body.keyPoints || [],
      topicTitle: body.topicTitle,
      topicAngle: body.topicAngle,
      customPrompt: body.customPrompt,
      tone,
      font,
      credentials,
    });

    return NextResponse.json(article);
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
