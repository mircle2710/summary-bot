import OpenAI from "openai";
import type { AnalysisType } from "./types";

function getClient(apiKey?: string) {
  const key = apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OpenAI API 키가 없습니다. 설정에서 키를 입력하거나 서버 환경 변수를 설정해 주세요.",
    );
  }
  return new OpenAI({ apiKey: key });
}

export async function summarizeTranscript(params: {
  title: string;
  channelTitle: string;
  description: string;
  transcript: string;
  source?: "caption" | "metadata";
  apiKey?: string;
}) {
  const client = getClient(params.apiKey);
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const source = params.source || "caption";

  const sourceRule =
    source === "metadata"
      ? `- 이 요청은 자막이 없어 제목과 영상 설명만으로 정리합니다.
- 설명에 없는 내용을 지어내지 말고, 정보가 부족하면 그 사실을 명시하세요.
- 요약 첫머리에 "자막이 없어 제목·설명 기준으로 정리했습니다."를 한 문장 포함하세요.`
      : `- 자막을 기준으로 내용을 정리하세요.`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `당신은 영상 내용을 명확하고 구조적으로 정리하는 한국어 요약 전문가입니다.
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
${sourceRule}`,
      },
      {
        role: "user",
        content: `영상 제목: ${params.title}
채널: ${params.channelTitle}
설명:
${params.description.slice(0, 4000)}

${source === "caption" ? "자막/트랜스크립트:" : "제목·설명 기반 원문:"}
${params.transcript.slice(0, 50000)}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as { summary?: string; keyPoints?: string[] };
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
  const client = getClient(params.apiKey);
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = ANALYSIS_PROMPTS[params.type];

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `당신은 교육/양육 영상 내용을 분석하는 한국어 전문가입니다.
${prompt.instruction}
반드시 JSON만 반환하고, 한국어로 작성하세요.`,
      },
      {
        role: "user",
        content: `영상 제목: ${params.title}

요약:
${params.summary}

핵심 포인트:
${params.keyPoints.map((p) => `- ${p}`).join("\n")}

${params.transcript ? `참고 자막(일부):\n${params.transcript.slice(0, 20000)}` : ""}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as { content?: string; items?: string[] };
  return {
    type: params.type,
    title: prompt.title,
    content: parsed.content || "",
    items: parsed.items || [],
  };
}
