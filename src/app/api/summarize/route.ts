import { NextResponse } from "next/server";
import { summarizeTranscript } from "@/lib/ai";
import { getOpenAIApiKey, getYoutubeApiKey } from "@/lib/request-keys";
import { buildMetadataTranscript, fetchTranscript } from "@/lib/transcript";
import { extractVideoId, getVideoMeta } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const youtubeApiKey = getYoutubeApiKey(request);
    const openaiApiKey = getOpenAIApiKey(request);
    const body = (await request.json()) as { url?: string };
    if (!body.url?.trim()) {
      return NextResponse.json({ error: "유튜브 URL을 입력해 주세요." }, { status: 400 });
    }

    const videoId = extractVideoId(body.url.trim());
    if (!videoId) {
      return NextResponse.json({ error: "올바른 유튜브 URL이 아닙니다." }, { status: 400 });
    }

    const meta = await getVideoMeta(videoId, youtubeApiKey);
    const caption = await fetchTranscript(videoId);

    const source = caption?.source === "caption" ? "caption" : "metadata";
    const transcript =
      caption?.text ||
      buildMetadataTranscript({
        title: meta.title,
        channelTitle: meta.channelTitle,
        description: meta.description,
      });

    if (source === "metadata" && !meta.description.trim()) {
      return NextResponse.json(
        {
          error:
            "자막과 영상 설명이 모두 없어 요약할 수 없습니다. 자막이 있는 영상을 사용해 주세요.",
        },
        { status: 400 },
      );
    }

    const summarized = await summarizeTranscript({
      title: meta.title,
      channelTitle: meta.channelTitle,
      description: meta.description,
      transcript,
      source,
      apiKey: openaiApiKey,
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
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요약에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
