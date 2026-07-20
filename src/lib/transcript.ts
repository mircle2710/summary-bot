export type TranscriptResult = {
  text: string;
  source: "caption" | "metadata";
};

function joinCaptionItems(items: Array<{ text: string }>): string {
  return items
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithYoutubeTranscript(videoId: string): Promise<string | null> {
  try {
    const { fetchTranscript } = await import("youtube-transcript");
    const langs = ["ko", "en", "en-US", "en-GB", "ja", "zh-Hans", "zh-Hant"];

    for (const lang of langs) {
      try {
        const items = await fetchTranscript(videoId, { lang });
        if (items?.length) return joinCaptionItems(items);
      } catch {
        // try next language
      }
    }

    try {
      const items = await fetchTranscript(videoId);
      if (items?.length) return joinCaptionItems(items);
    } catch {
      // ignore
    }
  } catch {
    // package unavailable
  }

  return null;
}

type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseCaptionXml(xml: string): string {
  const matches = Array.from(
    xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g),
  );
  const parts = matches.map((m) =>
    decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " ")).trim(),
  );
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  const patterns = [
    /"captionTracks":(\[.*?\])/,
    /"captions":\{"playerCaptionsTracklistRenderer":\{"captionTracks":(\[.*?\])/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      const tracks = JSON.parse(match[1]) as CaptionTrack[];
      if (Array.isArray(tracks) && tracks.length) return tracks;
    } catch {
      // try next pattern
    }
  }
  return [];
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const priority = ["ko", "en", "en-US", "ja"];
  for (const lang of priority) {
    const found = tracks.find((t) => t.languageCode?.toLowerCase().startsWith(lang.toLowerCase()));
    if (found) return found;
  }
  const manual = tracks.find((t) => t.kind !== "asr");
  return manual || tracks[0];
}

async function fetchWithCaptionTracks(videoId: string): Promise<string | null> {
  try {
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });
    if (!watchRes.ok) return null;

    const html = await watchRes.text();
    const tracks = extractCaptionTracks(html);
    const track = pickCaptionTrack(tracks);
    if (!track?.baseUrl) return null;

    const captionUrl = track.baseUrl.includes("fmt=")
      ? track.baseUrl
      : `${track.baseUrl}&fmt=srv3`;

    const captionRes = await fetch(captionUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!captionRes.ok) return null;

    const xml = await captionRes.text();
    const text = parseCaptionXml(xml);
    return text || null;
  } catch {
    return null;
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  const fromPackage = await fetchWithYoutubeTranscript(videoId);
  if (fromPackage) {
    return { text: fromPackage, source: "caption" };
  }

  const fromTracks = await fetchWithCaptionTracks(videoId);
  if (fromTracks) {
    return { text: fromTracks, source: "caption" };
  }

  return null;
}

export function buildMetadataTranscript(params: {
  title: string;
  channelTitle: string;
  description: string;
}): string {
  return [
    `제목: ${params.title}`,
    `채널: ${params.channelTitle}`,
    "",
    "영상 설명:",
    params.description.trim() || "(설명 없음)",
  ].join("\n");
}
