import { NextResponse } from "next/server";
import { getChannelById, getChannelVideos, groupVideosByYear } from "@/lib/youtube";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("id");
    if (!channelId) {
      return NextResponse.json({ error: "채널 ID가 필요합니다." }, { status: 400 });
    }

    const channel = await getChannelById(channelId);
    if (!channel.uploadsPlaylistId) {
      return NextResponse.json({
        channel,
        videos: [],
        yearly: [],
      });
    }

    const videos = await getChannelVideos(channel.uploadsPlaylistId, {
      maxPages: 20,
      pageSize: 50,
    });
    const yearly = groupVideosByYear(videos);

    return NextResponse.json({
      channel,
      videos: videos.slice(0, 30),
      allVideoCount: videos.length,
      yearly,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "채널 상세 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
