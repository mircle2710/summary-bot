import { NextResponse } from "next/server";
import { summarizeTranscript } from "@/lib/ai";
import { fetchTranscript } from "@/lib/transcript";
import { extractVideoId, getVideoMeta } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url?.trim()) {
      return NextResponse.json({ error: "유튜브 URL을 입력해 주세요." }, { status: 400 });
    }

    const videoId = extractVideoId(body.url.trim());
    if (!videoId) {
      return NextResponse.json({ error: "올바른 유튜브 URL이 아닙니다." }, { status: 400 });
    }

    const meta = await getVideoMeta(videoId);
    const transcript = await fetchTranscript(videoId);
    const summarized = await summarizeTranscript({
      title: meta.title,
      channelTitle: meta.channelTitle,
      description: meta.description,
      transcript,
    });

    return NextResponse.json({
      title: meta.title,
      summary: summarized.summary,
      keyPoints: summarized.keyPoints,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      channelTitle: meta.channelTitle,
      thumbnailUrl: meta.thumbnailUrl,
      transcript,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요약에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
