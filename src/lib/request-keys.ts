import {
  API_HEADER,
  decodeCredentialsHeader,
  type ApiSettings,
} from "./settings";

export type VertexCredentials = {
  projectId: string;
  location: string;
  serviceAccountJson: string;
};

export function getYoutubeApiKey(request: Request): string {
  const fromHeader = request.headers.get(API_HEADER.youtube)?.trim();
  const key = fromHeader || process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "YouTube API 키가 없습니다. 설정에서 키를 입력하거나 서버 환경 변수를 설정해 주세요.",
    );
  }
  return key;
}

export function getVertexCredentials(request: Request): VertexCredentials {
  const projectId =
    request.headers.get(API_HEADER.vertexProjectId)?.trim() ||
    process.env.VERTEX_PROJECT_ID?.trim() ||
    "";
  const location =
    request.headers.get(API_HEADER.vertexLocation)?.trim() ||
    process.env.VERTEX_LOCATION?.trim() ||
    "us-central1";
  const encoded = request.headers.get(API_HEADER.vertexCredentials)?.trim();
  const fromHeader = encoded ? decodeCredentialsHeader(encoded).trim() : "";
  const serviceAccountJson =
    fromHeader || process.env.VERTEX_SERVICE_ACCOUNT_JSON?.trim() || "";

  if (!projectId) {
    throw new Error(
      "Vertex 프로젝트 ID가 없습니다. 설정에서 입력하거나 VERTEX_PROJECT_ID를 설정해 주세요.",
    );
  }
  if (!serviceAccountJson) {
    throw new Error(
      "Vertex 서비스 계정 JSON이 없습니다. 설정에서 붙여넣거나 VERTEX_SERVICE_ACCOUNT_JSON을 설정해 주세요.",
    );
  }

  // validate JSON early
  try {
    const parsed = JSON.parse(serviceAccountJson) as { type?: string; client_email?: string };
    if (parsed.type !== "service_account" || !parsed.client_email) {
      throw new Error("invalid");
    }
  } catch {
    throw new Error(
      "서비스 계정 JSON 형식이 올바르지 않습니다. Google Cloud에서 다운로드한 JSON 키 전체를 붙여넣어 주세요.",
    );
  }

  return { projectId, location, serviceAccountJson };
}

export function settingsHaveVertex(settings: Pick<ApiSettings, "vertexProjectId" | "vertexServiceAccountJson">) {
  return Boolean(settings.vertexProjectId?.trim() && settings.vertexServiceAccountJson?.trim());
}
