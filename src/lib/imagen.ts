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

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  error?: { message?: string };
};

const IMAGEN_MODELS = [
  process.env.VERTEX_IMAGEN_MODEL,
  "imagen-3.0-generate-002",
  "imagen-3.0-generate-001",
  "imagen-3.0-fast-generate-001",
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

export async function generateImagenImage(params: {
  credentials: VertexCredentials;
  prompt: string;
  seed?: number;
}): Promise<{ mimeType: string; base64: string }> {
  const token = await getAccessToken(params.credentials.serviceAccountJson);
  const { projectId, location } = params.credentials;
  let lastError: unknown;

  for (const model of IMAGEN_MODELS) {
    try {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predict`;
      const body: Record<string, unknown> = {
        instances: [{ prompt: params.prompt.slice(0, 2500) }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "9:16",
          addWatermark: false,
          personGeneration: "allow_adult",
          safetySetting: "block_some",
        },
      };
      if (typeof params.seed === "number") {
        (body.parameters as Record<string, unknown>).seed = params.seed;
        (body.parameters as Record<string, unknown>).addWatermark = false;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ImagenPredictResponse;
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      const pred = data.predictions?.[0];
      if (!pred?.bytesBase64Encoded) {
        throw new Error("이미지 데이터가 비어 있습니다.");
      }
      return {
        mimeType: pred.mimeType || "image/png",
        base64: pred.bytesBase64Encoded,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
      if (!/404|NOT_FOUND|was not found|is not supported|not found/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
    }
  }

  throw new Error(formatVertexError(lastError));
}
