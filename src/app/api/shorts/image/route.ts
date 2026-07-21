import { NextResponse } from "next/server";
import { generateImagenImage } from "@/lib/imagen";
import { getVertexCredentials } from "@/lib/request-keys";
import type { ImageStyleId } from "@/lib/shorts";
import { IMAGE_STYLE_OPTIONS } from "@/lib/shorts";

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증/i.test(message)) return 401;
  if (/한도|quota|429/i.test(message)) return 429;
  if (/비어|차단|프롬프트/i.test(message)) return 422;
  return 500;
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const body = (await request.json()) as {
      sceneText?: string;
      imagePrompt?: string;
      extraPrompt?: string;
      style?: ImageStyleId;
      seed?: number;
    };

    const style =
      IMAGE_STYLE_OPTIONS.find((s) => s.id === body.style) || IMAGE_STYLE_OPTIONS[0];
    const basePrompt = body.imagePrompt?.trim() || body.sceneText?.trim();
    if (!basePrompt) {
      return NextResponse.json({ error: "이미지 프롬프트가 없습니다." }, { status: 400 });
    }

    const extra = body.extraPrompt?.trim();
    const prompt = [
      style.promptHint,
      basePrompt,
      extra ? `Additional direction: ${extra}` : "",
      "Do not include any text, captions, subtitles, watermarks, or logos in the image.",
      "Vertical 9:16 framing for YouTube Shorts.",
    ]
      .filter(Boolean)
      .join("\n");

    const image = await generateImagenImage({
      credentials,
      prompt,
      seed: body.seed,
    });

    return NextResponse.json({
      mimeType: image.mimeType,
      imageBase64: image.base64,
      dataUrl: `data:${image.mimeType};base64,${image.base64}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
