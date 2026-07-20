import { API_HEADER, loadApiSettings } from "./settings";

export async function apiFetch(input: string, init: RequestInit = {}) {
  const settings = loadApiSettings();
  const headers = new Headers(init.headers);

  if (settings.youtubeApiKey) {
    headers.set(API_HEADER.youtube, settings.youtubeApiKey);
  }
  if (settings.geminiApiKey) {
    headers.set(API_HEADER.gemini, settings.geminiApiKey);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
