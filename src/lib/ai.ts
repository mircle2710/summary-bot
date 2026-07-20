import { GoogleAuth, type JWTInput } from "google-auth-library";
import type {
  AnalysisSection,
  Framework,
  FrameworkPart,
} from "./types";
import { PET_PROBLEM_FRAMEWORK } from "./types";
import type { VertexCredentials } from "./request-keys";
import type { ImageDensity, ImageStyleId, ShortsTopic } from "./shorts";
import { IMAGE_STYLE_OPTIONS } from "./shorts";
import type { BlogFontId, BlogMeta, BlogToneId, BlogTopic } from "./blog";
import { BLOG_TONE_OPTIONS, slugifyBlogTitle } from "./blog";

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

function extractJsonText(raw: string): string {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function repairJsonText(text: string): string {
  // Remove trailing commas before } or ]
  return text.replace(/,\s*([}\]])/g, "$1");
}

function parseJson<T>(raw: string): T {
  const extracted = extractJsonText(raw);
  try {
    return JSON.parse(extracted) as T;
  } catch (firstError) {
    try {
      return JSON.parse(repairJsonText(extracted)) as T;
    } catch {
      const message =
        firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(`JSON_PARSE_FAILED: ${message}`);
    }
  }
}

export function formatVertexError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/JSON_PARSE_FAILED|Unterminated string|Unexpected token|JSON/i.test(message)) {
    return "AI 응답을 해석하지 못했습니다. 잠시 후 다시 요약해 주세요.";
  }
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
    finishReason?: string;
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
  maxOutputTokens?: number;
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
        maxOutputTokens: params.maxOutputTokens ?? 8192,
      },
    }),
  });

  const data = (await res.json()) as VertexResponse;
  if (!res.ok || data.error) {
    const message = data.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }

  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    throw new Error("Vertex AI 응답이 비어 있습니다.");
  }
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("JSON_PARSE_FAILED: 응답이 중간에 잘렸습니다.");
  }
  return text;
}

async function generateJson(params: {
  credentials: VertexCredentials;
  temperature: number;
  prompt: string;
  maxOutputTokens?: number;
}) {
  let lastError: unknown;

  for (const modelName of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt =
          attempt === 0
            ? params.prompt
            : `${params.prompt}

중요: 반드시 완전한 JSON 객체만 출력하세요. 문자열 안의 따옴표는 이스케이프하고, 잘린 응답 금지.`;
        const raw = await callVertexOnce({
          credentials: params.credentials,
          model: modelName,
          temperature: attempt === 0 ? params.temperature : Math.min(params.temperature, 0.15),
          prompt,
          maxOutputTokens: params.maxOutputTokens,
        });
        // Validate JSON now so model fallback/retry can happen
        parseJson<unknown>(raw);
        return raw;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
          throw new Error(formatVertexError(error));
        }
        if (/JSON_PARSE_FAILED|Unterminated string|Unexpected token/i.test(message)) {
          // retry same model once, then try next model
          continue;
        }
        if (!/404|NOT_FOUND|was not found|is not supported/i.test(message)) {
          throw new Error(formatVertexError(error));
        }
        break;
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

  const prompt = `한국어 요약·숏츠 기획 전문가. 완전한 JSON 객체만 반환.

형식:
{
  "summary":"2~4문단",
  "keyPoints":["핵심1","핵심2","핵심3","핵심4","핵심5"],
  "genreHint":"장르 한 줄",
  "shortsTopics":[
    {"id":"t1","title":"숏츠 주제 제목","angle":"왜 이 주제가 숏츠로 좋은지 한 줄"},
    {"id":"t2","title":"...","angle":"..."},
    {"id":"t3","title":"...","angle":"..."}
  ]
}

규칙:
- 사실 왜곡 금지, 이모지 금지, JSON을 중간에 자르지 말 것
- shortsTopics는 요약 내용을 바탕으로 숏츠 피드로 만들기 좋은 주제 3~5개
- 각 주제는 클릭베이트가 아닌, 실제로 뽑아낼 수 있는 구체적 각도
${sourceRule}

제목: ${params.title}
채널: ${params.channelTitle}
설명:
${params.description.slice(0, 1200)}

${source === "caption" ? "자막:" : "원문:"}
${params.transcript.slice(0, 6000)}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.25,
    prompt,
    maxOutputTokens: 4096,
  });
  const parsed = parseJson<{
    summary?: string;
    keyPoints?: string[];
    genreHint?: string;
    shortsTopics?: unknown;
  }>(raw);

  return {
    summary: parsed.summary || "",
    keyPoints: parsed.keyPoints || [],
    genreHint: parsed.genreHint?.trim() || "",
    shortsTopics: normalizeTopics(parsed.shortsTopics),
  };
}

function normalizeTopics(raw: unknown): ShortsTopic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: string; title?: string; angle?: string };
      const title = row.title?.trim();
      if (!title) return null;
      return {
        id: row.id?.trim() || `topic-${index + 1}`,
        title,
        angle: row.angle?.trim() || "",
      };
    })
    .filter((t): t is ShortsTopic => Boolean(t))
    .slice(0, 5);
}

export async function suggestShortsTopics(params: {
  title: string;
  summary: string;
  keyPoints: string[];
  customPrompt?: string;
  credentials: VertexCredentials;
}): Promise<ShortsTopic[]> {
  const custom = params.customPrompt?.trim();
  const prompt = `한국어 숏츠 기획. 완전한 JSON만 반환.
형식: {"shortsTopics":[{"id":"t1","title":"주제","angle":"한 줄 설명"}]}
규칙: 주제 3~5개, 이모지 금지, 요약 기반.
${custom ? `사용자 추가 요청:\n${custom.slice(0, 800)}` : ""}

제목: ${params.title}
요약:
${params.summary.slice(0, 2500)}
핵심:
${params.keyPoints
  .slice(0, 8)
  .map((p) => `- ${p}`)
  .join("\n")}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.35,
    prompt,
    maxOutputTokens: 2048,
  });
  const parsed = parseJson<{ shortsTopics?: unknown }>(raw);
  return normalizeTopics(parsed.shortsTopics);
}

function normalizeBlogTopics(raw: unknown): BlogTopic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: string; title?: string; angle?: string };
      const title = row.title?.trim();
      if (!title) return null;
      return {
        id: row.id?.trim() || `blog-topic-${index + 1}`,
        title,
        angle: row.angle?.trim() || "",
      };
    })
    .filter((t): t is BlogTopic => Boolean(t))
    .slice(0, 5);
}

export async function suggestBlogTopics(params: {
  title: string;
  summary: string;
  keyPoints: string[];
  customPrompt?: string;
  credentials: VertexCredentials;
}): Promise<BlogTopic[]> {
  const custom = params.customPrompt?.trim();
  const prompt = `한국어 블로그 기획. 완전한 JSON만 반환.
형식: {"blogTopics":[{"id":"b1","title":"블로그 주제","angle":"한 줄 설명"}]}
규칙: 주제 3~5개, 이모지 금지, 요약/전문답변 기반의 블로그 글감.
${custom ? `사용자 추가 요청(최우선):\n${custom.slice(0, 800)}` : ""}

제목: ${params.title}
본문 요약:
${params.summary.slice(0, 2500)}
핵심:
${params.keyPoints
  .slice(0, 8)
  .map((p) => `- ${p}`)
  .join("\n")}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.35,
    prompt,
    maxOutputTokens: 2048,
  });
  const parsed = parseJson<{ blogTopics?: unknown }>(raw);
  return normalizeBlogTopics(parsed.blogTopics);
}

export async function writeBlogArticle(params: {
  title: string;
  summary: string;
  keyPoints: string[];
  topicTitle?: string;
  topicAngle?: string;
  customPrompt?: string;
  tone: BlogToneId;
  font: BlogFontId;
  credentials: VertexCredentials;
}): Promise<{
  title: string;
  intro: string;
  paragraphs: Array<{ id: string; heading?: string; text: string; imagePrompt: string }>;
  thumbnailPrompt: string;
  meta: BlogMeta;
}> {
  const toneLabel =
    BLOG_TONE_OPTIONS.find((t) => t.id === params.tone)?.label || "친근한 말투";
  const custom = params.customPrompt?.trim();
  const focus =
    custom ||
    [params.topicTitle, params.topicAngle].filter(Boolean).join(" — ") ||
    "요약 내용을 블로그 글로";

  const prompt = `한국어 블로그 작가. 완전한 JSON만 반환.
목표: 블로그 본문을 단락으로 나누고, 단락별 이미지 프롬프트·썸네일 프롬프트와 SEO/발행용 메타를 만든다.

형식:
{
  "title":"블로그 제목",
  "intro":"도입 문단",
  "paragraphs":[
    {"id":"p1","heading":"소제목(선택)","text":"본문 단락","imagePrompt":"English visual prompt for this paragraph"}
  ],
  "thumbnailPrompt":"English thumbnail prompt",
  "slug":"url-friendly-slug-in-english-or-romanized-korean",
  "cardSummary":"검색·카드 노출용 요약 1~2문장",
  "hashtags":["키워드1","키워드2"],
  "seoTitle":"검색 결과에 보일 SEO 제목 (50자 내외)",
  "seoDescription":"검색 스니펫용 설명 (120~155자 권장)"
}

규칙:
- 사용자 프롬프트/요청이 있으면 최우선 반영: ${custom || "(없음)"}
- 말투: ${toneLabel}
- 글씨체 선택은 화면 표시용이므로 문체에만 톤을 맞출 것 (font=${params.font})
- paragraphs 4~7개, 각 text는 2~5문장
- imagePrompt/thumbnailPrompt는 영어, 이미지 안 텍스트/워터마크 금지
- slug: 소문자, 하이픈, 영문/숫자 위주, 공백·특수문자 없음
- cardSummary: 본문과 다른 짧은 요약, 클릭을 유도하되 과장 금지
- hashtags: 3~8개, # 기호 없이 단어만, 한국어 가능
- seoTitle / seoDescription: 검색 노출용, 핵심 키워드 포함
- 이모지 금지, JSON 완전하게
포커스: ${focus}

원본 제목: ${params.title}
원본 내용:
${params.summary.slice(0, 3500)}
핵심:
${params.keyPoints
  .slice(0, 8)
  .map((p) => `- ${p}`)
  .join("\n")}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.35,
    prompt,
    maxOutputTokens: 6144,
  });
  const parsed = parseJson<{
    title?: string;
    intro?: string;
    paragraphs?: unknown;
    thumbnailPrompt?: string;
    slug?: string;
    cardSummary?: string;
    hashtags?: unknown;
    seoTitle?: string;
    seoDescription?: string;
  }>(raw);

  const paragraphsRaw = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
  const paragraphs = paragraphsRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as {
        id?: string;
        heading?: string;
        text?: string;
        imagePrompt?: string;
      };
      const text = row.text?.trim();
      if (!text) return null;
      const heading = row.heading?.trim();
      return {
        id: row.id?.trim() || `p-${index + 1}`,
        ...(heading ? { heading } : {}),
        text,
        imagePrompt:
          row.imagePrompt?.trim() ||
          `Editorial blog illustration for: ${text.slice(0, 180)}`,
      };
    })
    .filter(
      (
        p,
      ): p is {
        id: string;
        heading?: string;
        text: string;
        imagePrompt: string;
      } => p !== null,
    )
    .slice(0, 8);

  if (paragraphs.length === 0) {
    throw new Error("블로그 단락을 만들지 못했습니다. 주제를 바꿔 다시 시도해 주세요.");
  }

  const title =
    parsed.title?.trim() || params.topicTitle || params.title || "블로그 글";
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map((t) => (typeof t === "string" ? t.trim().replace(/^#/, "") : ""))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const cardSummary =
    parsed.cardSummary?.trim() ||
    parsed.intro?.trim().slice(0, 160) ||
    params.summary.slice(0, 160);
  const seoTitle = parsed.seoTitle?.trim() || title.slice(0, 60);
  const seoDescription =
    parsed.seoDescription?.trim() || cardSummary.slice(0, 155);
  const slugRaw = parsed.slug?.trim().toLowerCase().replace(/\s+/g, "-") || "";
  const slug =
    slugRaw.replace(/[^a-z0-9가-힣-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") ||
    slugifyBlogTitle(title);

  return {
    title,
    intro: parsed.intro?.trim() || "",
    paragraphs,
    thumbnailPrompt:
      parsed.thumbnailPrompt?.trim() ||
      `Blog thumbnail about ${params.topicTitle || params.title}`,
    meta: {
      slug,
      cardSummary,
      hashtags:
        hashtags.length > 0
          ? hashtags
          : [],
      seoTitle,
      seoDescription,
    },
  };
}

export async function buildShortsScript(params: {
  title: string;
  summary: string;
  keyPoints: string[];
  topicTitle?: string;
  topicAngle?: string;
  customPrompt?: string;
  density: ImageDensity;
  style: ImageStyleId;
  credentials: VertexCredentials;
}): Promise<{
  sentences: string[];
  scenes: Array<{ id: string; text: string; imagePrompt: string }>;
}> {
  const styleHint =
    IMAGE_STYLE_OPTIONS.find((s) => s.id === params.style)?.promptHint || "";
  const focus =
    params.customPrompt?.trim() ||
    [params.topicTitle, params.topicAngle].filter(Boolean).join(" — ");

  const prompt = `한국어 숏츠 대본 작가. 완전한 JSON만 반환.
목표: 세로 숏츠 피드용 문장과 장면별 이미지 프롬프트.

형식:
{
  "sentences":["숏츠 자막용 짧은 문장1","문장2"],
  "scenes":[
    {"id":"s1","text":"이 장면에 들어갈 문장(들)","imagePrompt":"English visual prompt for the image"}
  ]
}

규칙:
- sentences는 8~16개, 각 문장은 숏츠 자막으로 읽기 좋게 짧게
- density=${params.density} → 문장 ${params.density}개당 이미지 장면 1개 (scenes 수 ≈ ceil(sentences/${params.density}))
- scenes[].text는 해당 장면에 묶인 문장들을 공백으로 이어 붙인 한글
- scenes[].imagePrompt는 영어, 스타일 힌트 반영, 텍스트/자막/워터마크/로고 넣지 말 것
- 스타일 힌트: ${styleHint}
- 이모지 금지, JSON 잘림 금지
포커스 주제/요청: ${focus || "(요약 전체에서 가장 숏츠감 있는 각도)"}

제목: ${params.title}
요약:
${params.summary.slice(0, 2500)}
핵심:
${params.keyPoints
  .slice(0, 8)
  .map((p) => `- ${p}`)
  .join("\n")}`;

  const raw = await generateJson({
    credentials: params.credentials,
    temperature: 0.3,
    prompt,
    maxOutputTokens: 4096,
  });
  const parsed = parseJson<{
    sentences?: unknown;
    scenes?: unknown;
  }>(raw);

  const sentences = Array.isArray(parsed.sentences)
    ? parsed.sentences
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 24)
    : [];

  const scenesRaw = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  let scenes = scenesRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: string; text?: string; imagePrompt?: string };
      const text = row.text?.trim();
      const imagePrompt = row.imagePrompt?.trim();
      if (!text || !imagePrompt) return null;
      return {
        id: row.id?.trim() || `scene-${index + 1}`,
        text,
        imagePrompt,
      };
    })
    .filter((s): s is { id: string; text: string; imagePrompt: string } => Boolean(s));

  // Fallback: pack sentences by density if scenes missing
  if (scenes.length === 0 && sentences.length > 0) {
    scenes = [];
    for (let i = 0; i < sentences.length; i += params.density) {
      const chunk = sentences.slice(i, i + params.density);
      scenes.push({
        id: `scene-${scenes.length + 1}`,
        text: chunk.join(" "),
        imagePrompt: `${styleHint}. Scene illustrating: ${chunk.join(" / ")}`,
      });
    }
  }

  return { sentences, scenes };
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

type GroundingChunk = {
  web?: { uri?: string; title?: string };
};

type GroundedVertexResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: GroundingChunk[];
      webSearchQueries?: string[];
    };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

function extractGroundingReferences(
  chunks: GroundingChunk[] | undefined,
): Array<{ title: string; url: string }> {
  if (!chunks?.length) return [];
  const seen = new Set<string>();
  const refs: Array<{ title: string; url: string }> = [];
  for (const chunk of chunks) {
    const url = chunk.web?.uri?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    refs.push({
      title: chunk.web?.title?.trim() || url,
      url,
    });
  }
  return refs.slice(0, 12);
}

export async function answerVeterinaryExpert(params: {
  question: string;
  imageBase64: string;
  mimeType: string;
  credentials: VertexCredentials;
}): Promise<{
  title: string;
  answer: string;
  keyPoints: string[];
  references: Array<{ title: string; url: string }>;
  shortsTopics: ShortsTopic[];
  disclaimer: string;
}> {
  const question = params.question.trim();
  if (!question) throw new Error("질문을 입력해 주세요.");
  if (!params.imageBase64.trim()) throw new Error("이미지를 업로드해 주세요.");

  const token = await getAccessToken(params.credentials.serviceAccountJson);
  const { projectId, location } = params.credentials;
  const mimeType = params.mimeType || "image/jpeg";
  const rawBase64 = params.imageBase64.replace(/^data:[^;]+;base64,/, "");

  const prompt = `당신은 수의학 지식을 바탕으로 보호자에게 설명하는 전문 어시스턴트입니다.
업로드된 이미지와 질문을 보고, 가능한 한 아래 출처 유형을 우선해 답하세요.
- 수의학 학술지 / peer-reviewed 논문
- 수의학회·대학 동물병원·공신력 있는 수의학 기관의 공식 안내
- 면허 수의사/전문의가 공식 매체에 남긴 권위 있는 설명

규칙:
1) 한국어로 자세히 답변. 과장·공포 마케팅 금지.
2) 진단/처방처럼 단정하지 말고, 가능한 소견과 추가 확인이 필요한 점을 구분.
3) 응급 가능성이 있으면 즉시 동물병원 방문을 권고.
4) Google 검색 결과를 활용해 근거를 찾고, 답변에 핵심을 정리.
5) 이모지 금지.

보호자 질문:
${question.slice(0, 2000)}`;

  let lastError: unknown;
  let groundedText = "";
  let groundingRefs: Array<{ title: string; url: string }> = [];

  for (const modelName of FALLBACK_MODELS) {
    try {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`;
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
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: rawBase64,
                  },
                },
              ],
            },
          ],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      });
      const data = (await res.json()) as GroundedVertexResponse;
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      groundedText =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
        "";
      if (!groundedText.trim()) {
        throw new Error("전문 답변 응답이 비어 있습니다.");
      }
      groundingRefs = extractGroundingReferences(
        data.candidates?.[0]?.groundingMetadata?.groundingChunks,
      );
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
        throw new Error(formatVertexError(error));
      }
      // If googleSearch tool unsupported, retry without tools once at end
      if (!/404|NOT_FOUND|was not found|is not supported|INVALID_ARGUMENT/i.test(message)) {
        // continue trying other models for tool issues too
      }
    }
  }

  if (!groundedText.trim()) {
    // Fallback without grounding tool
    for (const modelName of FALLBACK_MODELS) {
      try {
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`;
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
                parts: [
                  {
                    text: `${prompt}

추가: 검색 도구를 쓸 수 없으니, 알고 있는 공신력 있는 수의학 출처(학회/대학/논문명)를 명시하고, 가능하면 공식 URL도 함께 제안하세요.`,
                  },
                  {
                    inlineData: {
                      mimeType,
                      data: rawBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
            },
          }),
        });
        const data = (await res.json()) as GroundedVertexResponse;
        if (!res.ok || data.error) {
          throw new Error(data.error?.message || `HTTP ${res.status}`);
        }
        groundedText =
          data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
          "";
        if (groundedText.trim()) {
          lastError = null;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!groundedText.trim()) {
    throw new Error(formatVertexError(lastError));
  }

  const structurePrompt = `아래 수의학 전문 답변을 JSON으로만 재구성하세요.
형식:
{
  "title":"짧은 제목",
  "answer":"보호자에게 보여줄 자세한 본문(문단)",
  "keyPoints":["핵심1","핵심2","핵심3","핵심4","핵심5"],
  "references":[{"title":"출처명","url":"https://..."}],
  "shortsTopics":[
    {"id":"t1","title":"숏츠 주제","angle":"왜 숏츠로 좋은지"}
  ],
  "disclaimer":"수의사 대면 진료를 대체하지 않는다는 한 줄 고지"
}
규칙:
- answer는 원문 내용을 충실히 유지(한국어)
- references는 원문에 나온 URL/출처 + 제공된 검색 출처를 합쳐 최대 8개. url이 없으면 공식 사이트를 추정하지 말고 title만 두고 url은 빈 문자열
- shortsTopics 3~5개 (이 답변으로 만들 숏츠 각도)
- 이모지 금지, JSON 완전하게

검색/그라운딩 출처:
${groundingRefs.map((r) => `- ${r.title}: ${r.url}`).join("\n") || "(없음)"}

원문 답변:
${groundedText.slice(0, 6000)}`;

  const structuredRaw = await generateJson({
    credentials: params.credentials,
    temperature: 0.2,
    prompt: structurePrompt,
    maxOutputTokens: 4096,
  });
  const parsed = parseJson<{
    title?: string;
    answer?: string;
    keyPoints?: string[];
    references?: Array<{ title?: string; url?: string }>;
    shortsTopics?: unknown;
    disclaimer?: string;
  }>(structuredRaw);

  const modelRefs = Array.isArray(parsed.references)
    ? parsed.references
        .map((r) => ({
          title: r?.title?.trim() || "",
          url: r?.url?.trim() || "",
        }))
        .filter((r) => r.title || r.url)
    : [];

  const mergedRefs = [...groundingRefs, ...modelRefs]
    .filter((r) => r.url || r.title)
    .filter((r, i, arr) => {
      const key = r.url || r.title;
      return arr.findIndex((x) => (x.url || x.title) === key) === i;
    })
    .slice(0, 10);

  const topics = normalizeTopics(parsed.shortsTopics);
  const fallbackTopics =
    topics.length > 0
      ? topics
      : await suggestShortsTopics({
          title: parsed.title || "전문 답변",
          summary: parsed.answer || groundedText,
          keyPoints: parsed.keyPoints || [],
          credentials: params.credentials,
        });

  return {
    title: parsed.title?.trim() || "전문 답변",
    answer: parsed.answer?.trim() || groundedText.trim(),
    keyPoints: parsed.keyPoints || [],
    references: mergedRefs,
    shortsTopics: fallbackTopics,
    disclaimer:
      parsed.disclaimer?.trim() ||
      "본 내용은 일반 정보이며 수의사 대면 진료·처방을 대체하지 않습니다.",
  };
}

/** @deprecated use formatVertexError */
export const formatGeminiError = formatVertexError;
