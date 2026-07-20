export type ApiSettings = {
  youtubeApiKey: string;
  geminiApiKey: string;
};

const STORAGE_KEY = "summary-bot:api-settings";

export const API_HEADER = {
  youtube: "x-youtube-api-key",
  gemini: "x-gemini-api-key",
} as const;

export function loadApiSettings(): ApiSettings {
  if (typeof window === "undefined") {
    return { youtubeApiKey: "", geminiApiKey: "" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { youtubeApiKey: "", geminiApiKey: "" };
    const parsed = JSON.parse(raw) as Partial<ApiSettings> & {
      openaiApiKey?: string;
    };
    return {
      youtubeApiKey: parsed.youtubeApiKey?.trim() || "",
      // 이전 OpenAI 칸에 Gemini 키를 넣었던 경우도 이어받음
      geminiApiKey:
        parsed.geminiApiKey?.trim() || parsed.openaiApiKey?.trim() || "",
    };
  } catch {
    return { youtubeApiKey: "", geminiApiKey: "" };
  }
}

export function saveApiSettings(settings: ApiSettings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      youtubeApiKey: settings.youtubeApiKey.trim(),
      geminiApiKey: settings.geminiApiKey.trim(),
    }),
  );
}

export function clearApiSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiSettings(settings: ApiSettings = loadApiSettings()) {
  return Boolean(settings.youtubeApiKey || settings.geminiApiKey);
}
