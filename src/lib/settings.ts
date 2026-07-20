export type ApiSettings = {
  youtubeApiKey: string;
  vertexProjectId: string;
  vertexLocation: string;
  vertexServiceAccountJson: string;
};

const STORAGE_KEY = "summary-bot:api-settings";

export const API_HEADER = {
  youtube: "x-youtube-api-key",
  vertexProjectId: "x-vertex-project-id",
  vertexLocation: "x-vertex-location",
  vertexCredentials: "x-vertex-credentials",
} as const;

function encodeCredentials(json: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf8").toString("base64");
}

export function decodeCredentialsHeader(value: string): string {
  try {
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(value)));
    }
  } catch {
    // fall through
  }
  return Buffer.from(value, "base64").toString("utf8");
}

export function loadApiSettings(): ApiSettings {
  if (typeof window === "undefined") {
    return {
      youtubeApiKey: "",
      vertexProjectId: "",
      vertexLocation: "us-central1",
      vertexServiceAccountJson: "",
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        youtubeApiKey: "",
        vertexProjectId: "",
        vertexLocation: "us-central1",
        vertexServiceAccountJson: "",
      };
    }
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    return {
      youtubeApiKey: parsed.youtubeApiKey?.trim() || "",
      vertexProjectId: parsed.vertexProjectId?.trim() || "",
      vertexLocation: parsed.vertexLocation?.trim() || "us-central1",
      vertexServiceAccountJson: parsed.vertexServiceAccountJson?.trim() || "",
    };
  } catch {
    return {
      youtubeApiKey: "",
      vertexProjectId: "",
      vertexLocation: "us-central1",
      vertexServiceAccountJson: "",
    };
  }
}

export function saveApiSettings(settings: ApiSettings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      youtubeApiKey: settings.youtubeApiKey.trim(),
      vertexProjectId: settings.vertexProjectId.trim(),
      vertexLocation: settings.vertexLocation.trim() || "us-central1",
      vertexServiceAccountJson: settings.vertexServiceAccountJson.trim(),
    }),
  );
}

export function clearApiSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiSettings(settings: ApiSettings = loadApiSettings()) {
  return Boolean(
    settings.youtubeApiKey ||
      (settings.vertexProjectId && settings.vertexServiceAccountJson),
  );
}

export function encodeVertexCredentialsForHeader(json: string) {
  return encodeCredentials(json);
}
