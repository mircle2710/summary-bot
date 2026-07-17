import { NextResponse } from "next/server";
import { resolveChannel } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    if (!body.query?.trim()) {
      return NextResponse.json({ error: "채널 URL 또는 핸들을 입력해 주세요." }, { status: 400 });
    }

    const channel = await resolveChannel(body.query.trim());
    return NextResponse.json({ channel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "채널 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
