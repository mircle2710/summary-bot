import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AnalysisType } from "./types";

const FALLBACK_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
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

export function formatGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(message)) {
    if (/free_tier|free tier|무료/i.test(message)) {
      return "이 API 키가 아직 무료 등급으로 인식되고 있습니다. 설정에서 My First Project(결제/Tier 1) 키인지 확인하고, 업그레이드 직후라면 1~2분 뒤 다시 시도해 주세요.";
    }
    return "Gemini 요청 한도(분당/일일 제한)에 걸렸습니다. Tier 1도 요청 횟수 제한이 있습니다. 1~2분 기다린 뒤 한 번만 다시 시도해 주세요.";
  }
  if (/401|403|API_KEY_INVALID|API key not valid/i.test(message)) {
    return "Gemini API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.";
  }
  if (/404|not found|is not found for API version/i.test(message)) {
    return "사용할 수 있는 Gemini 모델을 찾지 못했습니다. GEMINI_MODEL 설정을 확인해 주세요.";
  }

  const short = message
    .replace(/\[GoogleGenerativeAI Error\]:\s*/i, "")
    .replace(/\s*\[\s*\{\s*"error"[\s\S]*$/, "")
    .trim();
  return short.slice(0, 280) || "Gemini 요청에 실패했습니다.";
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(message);
}

function isModelNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /404|not found|is not found for API version/i.test(message);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateJson(params: {
  apiKey?: string;
  temperature: number;
  prompt: string;
}) {
  const key = resolveApiKey(params.apiKey);
  const genAI = new GoogleGenerativeAI(key);
  let lastError: unknown;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: params.temperature,
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
        },
      });
      const result = await model.generateContent(params.prompt);
      return result.response.text() || "{}";
    } catch (error) {
      lastError = error;
      // 429면 다른 모델로 넘기지 않음 — 요청 1회만 소비
      if (isRateLimitError(error)) {
        throw new Error(formatGeminiError(error));
      }
      // 모델 없음(404)일 때만 다음 모델 시도
      if (!isModelNotFoundError(error)) {
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
      ? `- 이 요청은 자막이 없어 제목과 영상 설명만으로 정리합니다.
- 설명에 없는 내용을 지어내지 말고, 정보가 부족하면 그 사실을 명시하세요.
- 요약 첫머리에 "자막이 없어 제목·설명 기준으로 정리했습니다."를 한 문장 포함하세요.`
      : `- 자막을 기준으로 내용을 정리하세요.`;

  const prompt = `당신은 영상 내용을 명확하고 구조적으로 정리하는 한국어 요약 전문가입니다.
반드시 JSON으로만 답하세요.
형식:
{
  "summary": "전체 내용을 3~6문단으로 잘 정리한 요약 (마크다운 가능)",
  "keyPoints": ["핵심 포인트 5~10개"]
}
규칙:
- 원문의 사실과 맥락을 왜곡하지 말 것
- 교육/양육/훈육 관련 내용이면 실천 관점으로 정리
- 불필요한 수사나 이모지 금지
- 한국어로 작성
${sourceRule}

영상 제목: ${params.title}
채널: ${params.channelTitle}
설명:
${params.description.slice(0, 2500)}

${source === "caption" ? "자막/트랜스크립트:" : "제목·설명 기반 원문:"}
${params.transcript.slice(0, 18000)}`;

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
    instruction: `영상에서 다룬 '사건/상황/사례'를 분리 정리하세요.
JSON 형식:
{
  "content": "사건 전체에 대한 개요 설명",
  "items": ["사건/상황 항목들"]
}
무엇을 누가 어떤 상황에서 했는지를 중심으로 정리하세요.`,
  },
  cause: {
    title: "원인",
    instruction: `영상에서 제시된 사건의 '원인/배경/촉발 요인'을 분리 정리하세요.
JSON 형식:
{
  "content": "원인에 대한 개요 설명",
  "items": ["원인 항목들"]
}
표면적 원인과 깊은 원인을 구분해 정리하세요.`,
  },
  solution: {
    title: "해결책 & 훈육",
    instruction: `영상에서 제시된 '해결책/훈육법/실천 방법'을 분리 정리하세요.
JSON 형식:
{
  "content": "해결책과 훈육에 대한 개요 설명",
  "items": ["해결책 또는 훈육법 항목들"]
}
바로 적용 가능한 행동 지침 중심으로 정리하세요.`,
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

  const prompt = `당신은 교육/양육 영상 내용을 분석하는 한국어 전문가입니다.
${promptInfo.instruction}
반드시 JSON만 반환하고, 한국어로 작성하세요.

영상 제목: ${params.title}

요약:
${params.summary}

핵심 포인트:
${params.keyPoints.map((p) => `- ${p}`).join("\n")}

${params.transcript ? `참고 자막(일부):\n${params.transcript.slice(0, 8000)}` : ""}`;

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
