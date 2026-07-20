import {
  API_HEADER,
  encodeVertexCredentialsForHeader,
  loadApiSettings,
} from "./settings";

export async function apiFetch(input: string, init: RequestInit = {}) {
  const settings = loadApiSettings();
  const headers = new Headers(init.headers);

  if (settings.youtubeApiKey) {
    headers.set(API_HEADER.youtube, settings.youtubeApiKey);
  }
  if (settings.vertexProjectId) {
    headers.set(API_HEADER.vertexProjectId, settings.vertexProjectId);
  }
  if (settings.vertexLocation) {
    headers.set(API_HEADER.vertexLocation, settings.vertexLocation);
  }
  if (settings.vertexServiceAccountJson) {
    headers.set(
      API_HEADER.vertexCredentials,
      encodeVertexCredentialsForHeader(settings.vertexServiceAccountJson),
    );
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
