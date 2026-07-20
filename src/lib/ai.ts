import type { AnalysisType } from "./types";

const FALLBACK_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

function resolveApiKey(apiKey?: string) {
  const key = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Gemini API 키가 없습니다. 설정에서 키를 입력하거나 서버 환경 변수를 설정해 주세요.",
    );
  }
  return key;
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

function extractQuotaMetric(message: string): string | null {
  const match = message.match(/quotaMetric["']?\s*[:=]\s*["']?([a-zA-Z0-9_./-]+)/i);
  return match?.[1] || null;
}

export function formatGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const metric = extractQuotaMetric(message);

  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(message)) {
    if (/free_tier|FreeTier|generate_content_free_tier/i.test(message) || /free_tier/i.test(metric || "")) {
      return [
        "이 키는 아직 무료 한도(free_tier)로 인식되고 있습니다. (Tier 1로 보여도 API는 예전 키를 무료로 취급하는 경우가 많습니다.)",
        "해결: Google Cloud Console → API 및 서비스 → 사용자 인증 정보에서 My First Project로 '새 API 키'를 만든 뒤, 설정에 그 새 키를 넣고 저장하세요.",
        "업그레이드 전에 만든 AI Studio 키는 무료 한도에 남을 수 있습니다.",
      ].join(" ");
    }
    return "Gemini 요청 한도(분당/일일)에 걸렸습니다. 1~2분 기다린 뒤 한 번만 다시 시도해 주세요.";
  }
  if (/401|403|API_KEY_INVALID|API key not valid/i.test(message)) {
    return "Gemini API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.";
  }
  if (/404|not found|is not found for API version/i.test(message)) {
    return "사용할 수 있는 Gemini 모델을 찾지 못했습니다. 설정에서 키를 저장한 뒤 다시 시도해 주세요.";
  }

  const short = message
    .replace(/\[GoogleGenerativeAI Error\]:\s*/i, "")
    .replace(/\s*\[\s*\{\s*"error"[\s\S]*$/, "")
    .trim();
  return short.slice(0, 320) || "Gemini 요청에 실패했습니다.";
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
  };
};

async function callGeminiOnce(params: {
  apiKey: string;
  model: string;
  temperature: number;
  prompt: string;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok || data.error) {
    const detail = data.error ? JSON.stringify(data.error) : await Promise.resolve("");
    const message = data.error?.message || detail || `HTTP ${res.status}`;
    throw new Error(message);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }
  return text;
}

async function generateJson(params: {
  apiKey?: string;
  temperature: number;
  prompt: string;
}) {
  const key = resolveApiKey(params.apiKey);
  let lastError: unknown;

  for (const modelName of FALLBACK_MODELS) {
    try {
      return await callGeminiOnce({
        apiKey: key,
        model: modelName,
        temperature: params.temperature,
        prompt: params.prompt,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // 한도 초과면 다른 모델로 넘기지 않음 (요청 낭비 방지)
      if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED|free_tier/i.test(message)) {
        throw new Error(formatGeminiError(error));
      }
      // 모델 없음만 다음 후보로
      if (!/404|not found|is not found for API version/i.test(message)) {
        throw new Error(formatGeminiError(error));
      }
    }
  }

  throw new Error(formatGeminiError(lastError));
}

/** 키가 유료(Tier)로 동작하는지 아주 작은 요청으로 확인 */
export async function pingGemini(apiKey?: string) {
  const key = resolveApiKey(apiKey);
  const models = FALLBACK_MODELS;
  let lastError: unknown;

  for (const model of models) {
    try {
      const raw = await callGeminiOnce({
        apiKey: key,
        model,
        temperature: 0,
        prompt: 'JSON만 답하세요: {"ok":true}',
      });
      parseJson<{ ok?: boolean }>(raw);
      return { ok: true as const, model };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|quota|RESOURCE_EXHAUSTED|free_tier/i.test(message)) {
        throw new Error(formatGeminiError(error));
      }
      if (!/404|not found/i.test(message)) {
        throw new Error(formatGeminiError(error));
      }
    }
  }

  throw new Error(formatGeminiError(lastError));
}

export async function summarizeTranscript(params: {
  title: string;
  channelTitle: string;
  description: string;
  transcript: string;
  source?: "caption" | "metadata";
  apiKey?: string;
}) {
  const source = params.source || "caption";

  const sourceRule =
    source === "metadata"
      ? `- 자막이 없어 제목·설명만 사용. 없는 내용은 지어내지 말 것.
- 요약 첫머리에 "자막이 없어 제목·설명 기준으로 정리했습니다." 포함.`
      : `- 자막을 기준으로 정리.`;

  // 토큰(한도) 소모 줄이기: 설명/자막을 짧게 자름
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
    apiKey: params.apiKey,
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
  apiKey?: string;
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
    apiKey: params.apiKey,
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
