import { GoogleAuth, type JWTInput } from "google-auth-library";
import type { AnalysisType } from "./types";
import type { VertexCredentials } from "./request-keys";

const FALLBACK_MODELS = [
  process.env.VERTEX_MODEL,
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

type AccessCache = {
  key: string;
  token: string;
  expiresAt: number;
};

let accessCache: AccessCache | null = null;

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

export function formatVertexError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/PERMISSION_DENIED|403/i.test(message)) {
    return "Vertex AI 권한이 없습니다. 서비스 계정에 'Vertex AI User' 역할을 부여하고, Vertex AI API를 사용 설정했는지 확인해 주세요.";
  }
  if (/NOT_FOUND|404|was not found/i.test(message)) {
    return "Vertex 모델/프로젝트를 찾지 못했습니다. 프로젝트 ID·리전(us-central1)·모델명을 확인해 주세요.";
  }
  if (/UNAUTHENTICATED|401|invalid_grant|invalid_client/i.test(message)) {
    return "서비스 계정 인증에 실패했습니다. JSON 키 전체가 올바른지 확인해 주세요.";
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return "Vertex AI 요청 한도에 걸렸습니다. 1~2분 뒤 다시 시도해 주세요.";
  }
  if (/billing|결제|CREDIT|credit/i.test(message)) {
    return "결제/크레딧 문제입니다. Cloud Console에서 해당 프로젝트 결제와 Vertex AI API 사용 설정을 확인해 주세요.";
  }

  const short = message.replace(/\s+/g, " ").trim();
  return short.slice(0, 360) || "Vertex AI 요청에 실패했습니다.";
}

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
  if (!token) {
    throw new Error("Vertex access token을 발급받지 못했습니다.");
  }

  accessCache = {
    key: cacheKey,
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return token;
}

type VertexResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

async function callVertexOnce(params: {
  credentials: VertexCredentials;
  model: string;
  temperature: number;
  prompt: string;
}): Promise<string> {
  const token = await getAccessToken(params.credentials.serviceAccountJson);
  const { projectId, location } = params.credentials;
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(params.model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      generationConfig: {
        temperature: params.temperature,
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
      },
    }),
  });

  const data = (await res.json()) as VertexResponse;
  if (!res.ok || data.error) {
    const message = data.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    throw new Error("Vertex AI 응답이 비어 있습니다.");
  }
  return text;
}

async function generateJson(params: {
  credentials: VertexCredentials;
  temperature: number;
  prompt: string;
}) {
  let lastError: unknown;

  for (const modelName of FALLBACK_MODELS) {
    try {
      return await callVertexOnce({
        credentials: params.credentials,
        model: modelName,
        temperature: params.temperature,
        prompt: params.prompt,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
      if (!/404|NOT_FOUND|was not found|is not supported/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
    }
  }

  throw new Error(formatVertexError(lastError));
}

export async function pingVertex(credentials: VertexCredentials) {
  let lastError: unknown;
  for (const model of FALLBACK_MODELS) {
    try {
      const raw = await callVertexOnce({
        credentials,
        model,
        temperature: 0,
        prompt: 'JSON만 답하세요: {"ok":true}',
      });
      parseJson<{ ok?: boolean }>(raw);
      return { ok: true as const, model };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|NOT_FOUND|was not found|is not supported/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
    }
  }
  throw new Error(formatVertexError(lastError));
}

export async function summarizeTranscript(params: {
  title: string;
  channelTitle: string;
  description: string;
  transcript: string;
  source?: "caption" | "metadata";
  credentials: VertexCredentials;
}) {
  const source = params.source || "caption";
  const sourceRule =
    source === "metadata"
      ? `- 자막이 없어 제목·설명만 사용. 없는 내용은 지어내지 말 것.
- 요약 첫머리에 "자막이 없어 제목·설명 기준으로 정리했습니다." 포함.`
      : `- 자막을 기준으로 정리.`;

  const prompt = `한국어 요약 전문가. JSON만 반환.
형식: {"summary":"3~5문단","keyPoints":["5~8개"]}
규칙: 사실 왜곡 금지, 훈육/양육이면 실천 중심으로, 이모지 금지
${sourceRule}

제목: ${params.title}
채널: ${params.channelTitle}
설명:
${params.description.slice(0, 1200)}

${source === "caption" ? "자막:" : "원문:"}
${params.transcript.slice(0, 8000)}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.3,
    prompt,
  });
  const parsed = parseJson<{ summary?: string; keyPoints?: string[] }>(raw);
  return {
    summary: parsed.summary || "",
    keyPoints: parsed.keyPoints || [],
  };
}

const ANALYSIS_PROMPTS: Record<
  AnalysisType,
  { title: string; instruction: string }
> = {
  incident: {
    title: "사건",
    instruction: `사건의 상황/사례를 분리.
{"content":"개요","items":["항목들"]}`,
  },
  cause: {
    title: "원인",
    instruction: `원인/배경을 분리.
{"content":"개요","items":["항목들"]}`,
  },
  solution: {
    title: "해결책 & 훈육",
    instruction: `해결책/훈육법을 분리.
{"content":"개요","items":["항목들"]}`,
  },
};

export async function analyzeSummary(params: {
  type: AnalysisType;
  title: string;
  summary: string;
  keyPoints: string[];
  transcript?: string;
  credentials: VertexCredentials;
}) {
  const promptInfo = ANALYSIS_PROMPTS[params.type];
  const prompt = `한국어 분석. JSON만 반환.
${promptInfo.instruction}

제목: ${params.title}
요약:
${params.summary.slice(0, 2500)}
핵심:
${params.keyPoints
  .slice(0, 8)
  .map((p) => `- ${p}`)
  .join("\n")}
${params.transcript ? `참고:\n${params.transcript.slice(0, 3000)}` : ""}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.2,
    prompt,
  });
  const parsed = parseJson<{ content?: string; items?: string[] }>(raw);
  return {
    type: params.type,
    title: promptInfo.title,
    content: parsed.content || "",
    items: parsed.items || [],
  };
}

/** @deprecated use formatVertexError */
export const formatGeminiError = formatVertexError;
