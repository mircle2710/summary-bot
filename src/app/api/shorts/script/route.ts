import { NextResponse } from "next/server";
import { buildShortsScript, formatVertexError } from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";
import type { ImageDensity, ImageStyleId } from "@/lib/shorts";

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
      topicTitle?: string;
      topicAngle?: string;
      customPrompt?: string;
      density?: ImageDensity;
      style?: ImageStyleId;
    };
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "먼저 요약을 생성해 주세요." }, { status: 400 });
    }
    const density = ([1, 2, 3] as ImageDensity[]).includes(body.density as ImageDensity)
      ? (body.density as ImageDensity)
      : 2;
    const style = (["anime-jp", "disney", "photoreal"] as ImageStyleId[]).includes(
      body.style as ImageStyleId,
    )
      ? (body.style as ImageStyleId)
      : "anime-jp";

    const result = await buildShortsScript({
      title: body.title || "",
      summary: body.summary,
      keyPoints: body.keyPoints || [],
      topicTitle: body.topicTitle,
      topicAngle: body.topicAngle,
      customPrompt: body.customPrompt,
      density,
      style,
      credentials,
    });

    if (!result.scenes.length) {
      return NextResponse.json(
        { error: "숏츠 문장을 만들지 못했습니다. 주제를 바꿔 다시 시도해 주세요." },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
