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

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
  error?: { message?: string; status?: string; code?: number };
};

const IMAGE_MODELS = [
  process.env.VERTEX_IMAGEN_MODEL,
  "gemini-2.5-flash-image",
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
  return formatVertexError(error);
}

export async function generateImagenImage(params: {
  credentials: VertexCredentials;
  prompt: string;
  seed?: number;
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

  for (const model of IMAGE_MODELS) {
    try {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: finalPrompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "9:16",
            },
          },
        }),
      });

      const data = (await res.json()) as GeminiImageResponse;
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((part) => part.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new Error("이미지 데이터가 비어 있습니다. 다른 프롬프트로 다시 시도해 주세요.");
      }

      return {
        mimeType: imagePart.inlineData.mimeType || "image/png",
        base64: imagePart.inlineData.data,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
        throw new Error(formatImageError(error));
      }
      if (!/404|NOT_FOUND|was not found|is not supported|not found/i.test(message)) {
        throw new Error(formatImageError(error));
      }
    }
  }

  throw new Error(formatImageError(lastError));
}
