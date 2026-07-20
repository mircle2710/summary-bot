import { API_HEADER } from "./settings";

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

export function getOpenAIApiKey(request: Request): string {
  const fromHeader = request.headers.get(API_HEADER.openai)?.trim();
  const key = fromHeader || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OpenAI API 키가 없습니다. 설정에서 키를 입력하거나 서버 환경 변수를 설정해 주세요.",
    );
  }
  return key;
}
