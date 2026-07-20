import { GoogleAuth, type JWTInput } from "google-auth-library";
import type {
  AnalysisSection,
  Framework,
  FrameworkPart,
} from "./types";
import { PET_PROBLEM_FRAMEWORK } from "./types";
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

function normalizeParts(parts: unknown): FrameworkPart[] {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((part, index) => {
      if (!part || typeof part !== "object") return null;
      const row = part as { key?: string; title?: string };
      const title = row.title?.trim();
      if (!title) return null;
      const key =
        row.key?.trim() ||
        `part-${index + 1}-${title.toLowerCase().replace(/\s+/g, "-")}`;
      return { key, title };
    })
    .filter((part): part is FrameworkPart => Boolean(part))
    .slice(0, 3);
}

function normalizeFramework(raw: unknown): Framework | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { id?: string; label?: string; parts?: unknown };
  const parts = normalizeParts(row.parts);
  if (parts.length !== 3) return null;
  return {
    id: row.id?.trim() || `framework-${parts.map((p) => p.key).join("-")}`,
    label: row.label?.trim() || parts.map((p) => p.title).join(" · "),
    parts,
  };
}

function normalizeFrameworkList(raw: unknown, primary: Framework): Framework[] {
  const byId = new Map<string, Framework>();
  byId.set(primary.id, primary);

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const framework = normalizeFramework(item);
      if (!framework || byId.has(framework.id)) continue;
      byId.set(framework.id, framework);
      if (byId.size >= 3) break;
    }
  }

  // Keep pet framework available as an alternate when primary is Shorts-style.
  if (primary.id !== PET_PROBLEM_FRAMEWORK.id && byId.size < 3) {
    byId.set(PET_PROBLEM_FRAMEWORK.id, PET_PROBLEM_FRAMEWORK);
  }

  return Array.from(byId.values());
}

function normalizeSections(
  raw: unknown,
  framework: Framework,
): AnalysisSection[] {
  const byKey = new Map<string, AnalysisSection>();
  const byTitle = new Map<string, AnalysisSection>();
  const ordered: AnalysisSection[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as {
        key?: string;
        title?: string;
        content?: string;
        items?: unknown;
      };
      const title = row.title?.trim() || "";
      const key =
        row.key?.trim() ||
        (title
          ? `part-${title.toLowerCase().replace(/\s+/g, "-")}`
          : "");
      if (!key && !title) continue;
      const section: AnalysisSection = {
        key: key || `part-${ordered.length + 1}`,
        title: title || key,
        content: row.content?.trim() || "",
        items: Array.isArray(row.items)
          ? row.items
              .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
              .map((v) => v.trim())
          : [],
      };
      ordered.push(section);
      byKey.set(section.key, section);
      byTitle.set(section.title, section);
    }
  }

  if (framework.parts.length === 3) {
    return framework.parts.map((part, index) => {
      const found =
        byKey.get(part.key) ||
        byTitle.get(part.title) ||
        ordered[index];
      return {
        key: part.key,
        title: found?.title || part.title,
        content: found?.content || "",
        items: found?.items || [],
      };
    });
  }

  return ordered.slice(0, 3);
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

  const prompt = `한국어 요약·숏츠 기획 전문가. JSON만 반환.
이 결과는 유튜브 숏츠 피드를 만들기 위한 재료입니다.

형식:
{
  "summary":"3~5문단",
  "keyPoints":["5~8개"],
  "genreHint":"장르 한 줄",
  "usePetFramework": false,
  "primaryFramework":{
    "id":"shorts-...",
    "label":"훅 · 핵심 · 여운",
    "parts":[
      {"key":"hook","title":"훅"},
      {"key":"core","title":"핵심"},
      {"key":"payoff","title":"여운"}
    ]
  },
  "frameworks":[
    {"id":"alt-1","label":"...","parts":[{"key":"a","title":"파트1"},{"key":"b","title":"파트2"},{"key":"c","title":"파트3"}]}
  ],
  "sections":[
    {"key":"...","title":"...","content":"개요","items":["숏츠에 쓸 문장/장면"]}
  ]
}

규칙:
- 사실 왜곡 금지, 이모지 금지
- usePetFramework=true 는 "문제 상황 → 원인 → 해결/훈육"이 영상의 주된 서사일 때만 (문제행동 교정, 훈련 갈등 해결 등)
- 백과/정보/리뷰/브이로그/요리 등 설명형이면 usePetFramework=false
- usePetFramework=true 이면 primaryFramework는 반드시 id="pet-problem", parts=사건/원인/해결책 & 훈육
- usePetFramework=false 이면 primaryFramework는 숏츠용 3파트. "이 영상으로 숏츠를 만든다면 무엇을 뽑을지" 기준으로 파트명 정하기
  예: 견종백과 → 한줄 매력 / 핵심 특징 / 키울 때 주의점
  예: 요리 → 비주얼 훅 / 핵심 레시피 / 실패 방지 팁
- sections는 primaryFramework의 3파트를 채울 것. items는 숏츠 대본/자막에 바로 쓸 짧은 문장 위주
- frameworks에는 primary 외 대안 1개만 (숏츠 관점 또는 pet-problem 중 안 쓴 쪽)
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
  const parsed = parseJson<{
    summary?: string;
    keyPoints?: string[];
    genreHint?: string;
    usePetFramework?: boolean;
    primaryFramework?: unknown;
    frameworks?: unknown;
    sections?: unknown;
  }>(raw);

  const usePet = Boolean(parsed.usePetFramework);
  const fallbackShorts: Framework = {
    id: "shorts-default",
    label: "훅 · 핵심 · 여운",
    parts: [
      { key: "hook", title: "훅" },
      { key: "core", title: "핵심" },
      { key: "payoff", title: "여운" },
    ],
  };
  const primary =
    (usePet
      ? PET_PROBLEM_FRAMEWORK
      : normalizeFramework(parsed.primaryFramework)) ||
    (usePet ? PET_PROBLEM_FRAMEWORK : fallbackShorts);
  const frameworks = normalizeFrameworkList(parsed.frameworks, primary);
  const sections = normalizeSections(parsed.sections, primary);

  return {
    summary: parsed.summary || "",
    keyPoints: parsed.keyPoints || [],
    genreHint: parsed.genreHint?.trim() || "",
    frameworks,
    sections,
    activeFrameworkId: primary.id,
  };
}

export async function analyzeByFramework(params: {
  framework: Framework;
  title: string;
  summary: string;
  keyPoints: string[];
  transcript?: string;
  credentials: VertexCredentials;
}) {
  const parts = normalizeParts(params.framework.parts);
  if (parts.length !== 3) {
    throw new Error("프레임은 정확히 3개 파트가 필요합니다.");
  }
  const framework: Framework = {
    id: params.framework.id?.trim() || "custom",
    label:
      params.framework.label?.trim() ||
      parts.map((p) => p.title).join(" · "),
    parts,
  };

  const partSpec = parts
    .map((p, index) => `${index + 1}) key=${p.key}, title=${p.title}`)
    .join("\n");

  const prompt = `한국어 숏츠 기획 분석. JSON만 반환.
주어진 3개 파트로 내용을 나눠, 숏츠 피드로 바로 쓸 재료를 정리하세요.
형식:
{
  "sections":[
    {"key":"...","title":"...","content":"개요","items":["짧은 숏츠용 문장"]}
  ]
}
규칙: 사실 왜곡 금지, 이모지 금지, sections는 아래 3개 key/title을 모두 포함할 것. items는 숏츠 자막/대본에 쓸 짧은 문장.

프레임: ${framework.label}
파트 목록:
${partSpec}

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
  const parsed = parseJson<{ sections?: unknown }>(raw);
  return {
    framework,
    sections: normalizeSections(parsed.sections, framework),
  };
}

export async function analyzeByCustomPrompt(params: {
  customPrompt: string;
  title: string;
  summary: string;
  keyPoints: string[];
  transcript?: string;
  credentials: VertexCredentials;
}) {
  const customPrompt = params.customPrompt.trim();
  if (!customPrompt) {
    throw new Error("프롬프트를 입력해 주세요.");
  }

  const prompt = `한국어 숏츠 기획 분석. JSON만 반환.
사용자는 아래 요약으로 숏츠를 만들려 합니다. 사용자 요청에 맞게 3개 파트로 나눠 주세요.

형식:
{
  "framework":{
    "id":"custom",
    "label":"프레임 라벨",
    "parts":[
      {"key":"a","title":"파트1"},
      {"key":"b","title":"파트2"},
      {"key":"c","title":"파트3"}
    ]
  },
  "sections":[
    {"key":"a","title":"파트1","content":"개요","items":["짧은 숏츠용 문장"]}
  ]
}
규칙:
- 사실 왜곡 금지, 이모지 금지
- parts/sections는 정확히 3개
- 숏츠로 뽑을 훅·핵심·여운/CTA 관점을 우선하되, 사용자 요청을 최우선 반영
- items는 숏츠 자막/대본에 바로 쓸 짧은 문장

사용자 요청:
${customPrompt.slice(0, 1200)}

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
    temperature: 0.35,
    prompt,
  });
  const parsed = parseJson<{ framework?: unknown; sections?: unknown }>(raw);
  const framework =
    normalizeFramework(parsed.framework) ||
    ({
      id: "custom",
      label: "맞춤 정리",
      parts: [
        { key: "part-1", title: "파트 1" },
        { key: "part-2", title: "파트 2" },
        { key: "part-3", title: "파트 3" },
      ],
    } satisfies Framework);

  return {
    framework: { ...framework, id: framework.id || "custom" },
    sections: normalizeSections(parsed.sections, framework),
  };
}

/** @deprecated use formatVertexError */
export const formatGeminiError = formatVertexError;
