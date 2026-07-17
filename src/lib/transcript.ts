import { fetchTranscript as ytFetchTranscript } from "youtube-transcript";

export async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const items = await ytFetchTranscript(videoId, { lang: "ko" });
    if (items?.length) {
      return items.map((i) => i.text).join(" ");
    }
  } catch {
    // fall through to default language
  }

  try {
    const items = await ytFetchTranscript(videoId);
    if (items?.length) {
      return items.map((i) => i.text).join(" ");
    }
  } catch {
    // ignore
  }

  throw new Error(
    "이 영상의 자막을 가져올 수 없습니다. 자막이 켜져 있는 영상을 사용해 주세요.",
  );
}
