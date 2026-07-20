import { NextResponse } from "next/server";
import { answerVeterinaryExpert, formatVertexError } from "@/lib/ai";
import { getVertexCredentials } from "@/lib/request-keys";

export const runtime = "nodejs";
export const maxDuration = 120;

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증|질문|이미지/i.test(message)) {
    if (/질문|이미지/i.test(message)) return 400;
    return 401;
  }
  if (/한도|quota|429/i.test(message)) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const body = (await request.json()) as {
      question?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "질문을 입력해 주세요." }, { status: 400 });
    }
    if (!body.imageBase64?.trim()) {
      return NextResponse.json({ error: "이미지를 업로드해 주세요." }, { status: 400 });
    }

    // rough payload guard (~6MB base64)
    if (body.imageBase64.length > 8_000_000) {
      return NextResponse.json(
        { error: "이미지가 너무 큽니다. 더 작은 사진으로 다시 올려 주세요." },
        { status: 400 },
      );
    }

    const result = await answerVeterinaryExpert({
      question: body.question,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType || "image/jpeg",
      credentials,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
