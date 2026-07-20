import { NextResponse } from "next/server";
import { formatVertexError, pingVertex } from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const result = await pingVertex(credentials);
    return NextResponse.json({
      ok: true,
      model: result.model,
      message: `Vertex AI 연결 성공 (${result.model}). Cloud 체험 크레딧이 이 프로젝트로 청구됩니다.`,
    });
  } catch (error) {
    const message = formatVertexError(error);
    const status = /권한|인증|서비스 계정|프로젝트/i.test(message)
      ? 401
      : /한도/i.test(message)
        ? 429
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
