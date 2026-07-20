import { NextResponse } from "next/server";
import { formatVertexError } from "@/lib/ai";
import { BLOG_IMAGE_STYLE, BLOG_THUMBNAIL_STYLE } from "@/lib/blog";
import { generateImagenImage } from "@/lib/imagen";
import { getVertexCredentials } from "@/lib/request-keys";

function statusFromMessage(message: string) {
  if (/서비스 계정|프로젝트 ID|인증/i.test(message)) return 401;
  if (/한도|quota|429/i.test(message)) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const credentials = getVertexCredentials(request);
    const body = (await request.json()) as {
      kind?: "paragraph" | "thumbnail";
      text?: string;
      imagePrompt?: string;
      extraPrompt?: string;
      seed?: number;
    };

    const basePrompt = body.imagePrompt?.trim() || body.text?.trim();
    if (!basePrompt) {
      return NextResponse.json({ error: "이미지 프롬프트가 없습니다." }, { status: 400 });
    }

    const styleHint =
      body.kind === "thumbnail"
        ? BLOG_THUMBNAIL_STYLE.promptHint
        : BLOG_IMAGE_STYLE.promptHint;
    const extra = body.extraPrompt?.trim();

    const prompt = [
      styleHint,
      basePrompt,
      extra ? `User direction (highest priority): ${extra}` : "",
      "Do not include any unreadable tiny text, watermarks, or logos.",
      "Horizontal 16:9 framing for a blog.",
    ]
      .filter(Boolean)
      .join("\n");

    const image = await generateImagenImage({
      credentials,
      prompt,
      seed: body.seed,
      aspectRatio: "16:9",
    });

    return NextResponse.json({
      mimeType: image.mimeType,
      imageBase64: image.base64,
      dataUrl: `data:${image.mimeType};base64,${image.base64}`,
    });
  } catch (error) {
    const message = formatVertexError(error);
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
