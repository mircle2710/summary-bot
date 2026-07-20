import { NextResponse } from "next/server";
import {
  analyzeByCustomPrompt,
  analyzeByFramework,
  formatVertexError,
} from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";
import type { Framework } from "@/lib/types";

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증/i.test(message)) return 401;
  if (/한도|quota|429/i.test(message)) return 429;
  return 500;
}

function isFramework(value: unknown): value is Framework {
  if (!value || typeof value !== "object") return false;
  const row = value as Framework;
  return (
    typeof row.id === "string" &&
    typeof row.label === "string" &&
    Array.isArray(row.parts) &&
    row.parts.length === 3 &&
    row.parts.every(
      (part) =>
        part &&
        typeof part.key === "string" &&
        typeof part.title === "string" &&
        part.key.trim() &&
        part.title.trim(),
    )
  );
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const body = (await request.json()) as {
      framework?: Framework;
      customPrompt?: string;
      title?: string;
      summary?: string;
      keyPoints?: string[];
      transcript?: string;
    };

    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "먼저 요약을 생성해 주세요." }, { status: 400 });
    }

    const customPrompt = body.customPrompt?.trim();
    if (customPrompt) {
      const result = await analyzeByCustomPrompt({
        customPrompt,
        title: body.title || "",
        summary: body.summary,
        keyPoints: body.keyPoints || [],
        transcript: body.transcript,
        credentials,
      });
      return NextResponse.json({
        framework: result.framework,
        sections: result.sections,
      });
    }

    if (!isFramework(body.framework)) {
      return NextResponse.json(
        { error: "프레임 정보가 올바르지 않습니다. 파트 3개가 필요합니다." },
        { status: 400 },
      );
    }

    const result = await analyzeByFramework({
      framework: body.framework,
      title: body.title || "",
      summary: body.summary,
      keyPoints: body.keyPoints || [],
      transcript: body.transcript,
      credentials,
    });

    return NextResponse.json({
      framework: result.framework,
      sections: result.sections,
    });
  } catch (error) {
    const message = formatVertexError(error);
    const status = /프롬프트를 입력/i.test(message)
      ? 400
      : statusFromMessage(message);
    return NextResponse.json({ error: message }, { status });
  }
}
