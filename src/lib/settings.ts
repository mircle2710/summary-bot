export type ApiSettings = {
  youtubeApiKey: string;
  openaiApiKey: string;
};

const STORAGE_KEY = "summary-bot:api-settings";

export const API_HEADER = {
  youtube: "x-youtube-api-key",
  openai: "x-openai-api-key",
} as const;

export function loadApiSettings(): ApiSettings {
  if (typeof window === "undefined") {
    return { youtubeApiKey: "", openaiApiKey: "" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { youtubeApiKey: "", openaiApiKey: "" };
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    return {
      youtubeApiKey: parsed.youtubeApiKey?.trim() || "",
      openaiApiKey: parsed.openaiApiKey?.trim() || "",
    };
  } catch {
    return { youtubeApiKey: "", openaiApiKey: "" };
  }
}

export function saveApiSettings(settings: ApiSettings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      youtubeApiKey: settings.youtubeApiKey.trim(),
      openaiApiKey: settings.openaiApiKey.trim(),
    }),
  );
}

export function clearApiSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiSettings(settings: ApiSettings = loadApiSettings()) {
  return Boolean(settings.youtubeApiKey || settings.openaiApiKey);
}
