import { GoogleAuth, type JWTInput } from "google-auth-library";
import type { VertexCredentials } from "./request-keys";
import { formatVertexError } from "./ai";

type AccessCache = {
  key: string;
  token: string;
  expiresAt: number;
};

let accessCache: AccessCache | null = null;

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const cacheKey = serviceAccountJson.slice(0, 120);
  if (accessCache && accessCache.key === cacheKey && accessCache.expiresAt > Date.now() + 60_000) {
    return accessCache.token;
  }
  const credentials = JSON.parse(serviceAccountJson) as JWTInput;
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) throw new Error("Vertex access token을 발급받지 못했습니다.");
  accessCache = {
    key: cacheKey,
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return token;
}

type GeminiImagePart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; mimeType?: string; data?: string };
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiImagePart[];
    };
    finishReason?: string;
    finishMessage?: string;
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  error?: { message?: string; status?: string; code?: number };
};

const IMAGE_MODELS = [
  process.env.VERTEX_IMAGEN_MODEL,
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

function formatImageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/NOT_FOUND|404|was not found|is not supported/i.test(message)) {
    return "이미지 생성 모델을 찾지 못했습니다. Vertex에서 gemini-2.5-flash-image(이미지 생성) 사용 가능 여부와 리전(us-central1)을 확인해 주세요.";
  }
  if (/PERMISSION_DENIED|403/i.test(message)) {
    return "이미지 생성 권한이 없습니다. 서비스 계정에 Vertex AI User 역할이 있는지 확인해 주세요.";
  }
  if (/SAFETY|blocked|blockReason|IMAGE_EMPTY/i.test(message)) {
    return "이미지 생성 결과가 비어 있거나 차단되었습니다. 장면 지시사항을 조금 바꿔 다시 시도해 주세요.";
  }
  return formatVertexError(error);
}

function extractImageFromParts(
  parts: GeminiImagePart[],
): { mimeType: string; base64: string } | null {
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    const data = inline?.data?.trim();
    if (!data) continue;
    const mimeType =
      inline?.mimeType ||
      ("mime_type" in (inline || {}) ? (inline as { mime_type?: string }).mime_type : undefined) ||
      "image/png";
    return { mimeType, base64: data };
  }
  return null;
}

async function requestImageOnce(params: {
  token: string;
  projectId: string;
  location: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  modalities: Array<"TEXT" | "IMAGE">;
}): Promise<{ mimeType: string; base64: string }> {
  const url = `https://${params.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(params.projectId)}/locations/${encodeURIComponent(params.location)}/publishers/google/models/${encodeURIComponent(params.model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    responseModalities: params.modalities,
  };
  // imageConfig is only valid when IMAGE is requested
  if (params.modalities.includes("IMAGE")) {
    generationConfig.imageConfig = {
      aspectRatio: params.aspectRatio,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig,
    }),
  });

  const data = (await res.json()) as GeminiImageResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const blockReason =
    data.promptFeedback?.blockReason ||
    data.promptFeedback?.blockReasonMessage ||
    data.candidates?.[0]?.finishReason ||
    "";
  if (/SAFETY|BLOCK|OTHER/i.test(blockReason) && !data.candidates?.[0]?.content?.parts?.length) {
    throw new Error(`IMAGE_EMPTY: blocked (${blockReason})`);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = extractImageFromParts(parts);
  if (!image) {
    const textHint = parts
      .map((p) => p.text || "")
      .join(" ")
      .trim()
      .slice(0, 180);
    throw new Error(
      textHint
        ? `IMAGE_EMPTY: ${textHint}`
        : "IMAGE_EMPTY: 이미지 데이터가 비어 있습니다.",
    );
  }
  return image;
}

export async function generateImagenImage(params: {
  credentials: VertexCredentials;
  prompt: string;
  seed?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3" | "3:4";
}): Promise<{ mimeType: string; base64: string }> {
  const token = await getAccessToken(params.credentials.serviceAccountJson);
  const { projectId, location } = params.credentials;
  let lastError: unknown;

  const prompt = params.prompt.slice(0, 2500);
  // seed is not reliably supported on Gemini image models; vary prompt slightly when refreshing
  const finalPrompt =
    typeof params.seed === "number"
      ? `${prompt}\nVariation seed: ${params.seed}. Create a fresh composition.`
      : prompt;
  const aspectRatio = params.aspectRatio || "9:16";
  const modalitySets: Array<Array<"TEXT" | "IMAGE">> = [
    ["IMAGE"],
    ["TEXT", "IMAGE"],
  ];

  for (const model of IMAGE_MODELS) {
    for (const modalities of modalitySets) {
      try {
        return await requestImageOnce({
          token,
          projectId,
          location,
          model,
          prompt: finalPrompt,
          aspectRatio,
          modalities,
        });
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
          throw new Error(formatImageError(error));
        }
        // Empty image / unsupported modality / missing model → try next combo
        if (
          /IMAGE_EMPTY|404|NOT_FOUND|was not found|is not supported|not found|INVALID_ARGUMENT|imageConfig|responseModalities/i.test(
            message,
          )
        ) {
          continue;
        }
        throw new Error(formatImageError(error));
      }
    }
  }

  throw new Error(
    formatImageError(
      lastError ||
        new Error("이미지 데이터가 비어 있습니다. 다른 프롬프트로 다시 시도해 주세요."),
    ),
  );
}
