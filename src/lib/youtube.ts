import type { ChannelDetails, ChannelVideo, YearlyCount } from "./types";

const YT_API = "https://www.googleapis.com/youtube/v3";

function resolveApiKey(apiKey?: string) {
  const key = apiKey?.trim() || process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "YouTube API 키가 없습니다. 설정에서 키를 입력하거나 서버 환경 변수를 설정해 주세요.",
    );
  }
  return key;
}

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
    const embed = url.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
    if (embed) return embed[2];
  } catch {
    return null;
  }
  return null;
}

export function extractChannelQuery(input: string): {
  type: "id" | "handle" | "username" | "url";
  value: string;
} {
  const trimmed = input.trim();

  if (trimmed.startsWith("UC") && trimmed.length >= 22) {
    return { type: "id", value: trimmed };
  }
  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed.slice(1) };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
      const handleMatch = url.pathname.match(/^\/@([^/]+)/);
      if (handleMatch) return { type: "handle", value: handleMatch[1] };

      const channelMatch = url.pathname.match(/^\/channel\/(UC[\w-]+)/);
      if (channelMatch) return { type: "id", value: channelMatch[1] };

      const userMatch = url.pathname.match(/^\/(user|c)\/([^/]+)/);
      if (userMatch) return { type: "username", value: userMatch[2] };
    }
  } catch {
    // not a URL
  }

  return { type: "handle", value: trimmed.replace(/^@/, "") };
}

async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
  apiKey?: string,
): Promise<T> {
  const key = resolveApiKey(apiKey);
  const search = new URLSearchParams({ ...params, key });
  const res = await fetch(`${YT_API}${path}?${search.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API 오류 (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

type ChannelListResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      publishedAt: string;
      country?: string;
      thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
    };
    statistics: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
      hiddenSubscriberCount?: boolean;
    };
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
};

function mapChannel(item: NonNullable<ChannelListResponse["items"]>[number]): ChannelDetails {
  const thumb =
    item.snippet.thumbnails.high?.url ||
    item.snippet.thumbnails.medium?.url ||
    item.snippet.thumbnails.default?.url ||
    "";

  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    customUrl: item.snippet.customUrl,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: thumb,
    country: item.snippet.country,
    subscriberCount: Number(item.statistics.subscriberCount || 0),
    viewCount: Number(item.statistics.viewCount || 0),
    videoCount: Number(item.statistics.videoCount || 0),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
  };
}

export async function resolveChannel(
  input: string,
  apiKey?: string,
): Promise<ChannelDetails> {
  const query = extractChannelQuery(input);
  const parts = "snippet,statistics,contentDetails";

  if (query.type === "id") {
    const data = await ytFetch<ChannelListResponse>(
      "/channels",
      {
        part: parts,
        id: query.value,
      },
      apiKey,
    );
    if (!data.items?.length) throw new Error("채널을 찾을 수 없습니다.");
    return mapChannel(data.items[0]);
  }

  if (query.type === "handle") {
    const data = await ytFetch<ChannelListResponse>(
      "/channels",
      {
        part: parts,
        forHandle: query.value,
      },
      apiKey,
    );
    if (data.items?.length) return mapChannel(data.items[0]);
  }

  if (query.type === "username") {
    const data = await ytFetch<ChannelListResponse>(
      "/channels",
      {
        part: parts,
        forUsername: query.value,
      },
      apiKey,
    );
    if (data.items?.length) return mapChannel(data.items[0]);
  }

  // fallback: search
  const search = await ytFetch<{ items?: Array<{ id: { channelId: string } }> }>(
    "/search",
    {
      part: "snippet",
      type: "channel",
      q: query.value,
      maxResults: "1",
    },
    apiKey,
  );

  const channelId = search.items?.[0]?.id?.channelId;
  if (!channelId) throw new Error("채널을 찾을 수 없습니다.");

  const data = await ytFetch<ChannelListResponse>(
    "/channels",
    {
      part: parts,
      id: channelId,
    },
    apiKey,
  );
  if (!data.items?.length) throw new Error("채널을 찾을 수 없습니다.");
  return mapChannel(data.items[0]);
}

export async function getChannelById(
  channelId: string,
  apiKey?: string,
): Promise<ChannelDetails> {
  return resolveChannel(channelId, apiKey);
}

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    contentDetails: { videoId: string; videoPublishedAt?: string };
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      thumbnails: { medium?: { url: string }; default?: { url: string } };
      resourceId: { videoId: string };
    };
  }>;
};

export async function getChannelVideos(
  uploadsPlaylistId: string,
  options: { maxPages?: number; pageSize?: number; apiKey?: string } = {},
): Promise<ChannelVideo[]> {
  const maxPages = options.maxPages ?? 10;
  const pageSize = String(options.pageSize ?? 50);
  const videos: ChannelVideo[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: pageSize,
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await ytFetch<PlaylistItemsResponse>(
      "/playlistItems",
      params,
      options.apiKey,
    );
    for (const item of data.items || []) {
      if (item.snippet.title === "Private video" || item.snippet.title === "Deleted video") {
        continue;
      }
      videos.push({
        id: item.contentDetails.videoId || item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt,
        thumbnailUrl:
          item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || "",
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return videos;
}

export function groupVideosByYear(videos: ChannelVideo[]): YearlyCount[] {
  const map = new Map<number, number>();
  for (const video of videos) {
    const year = new Date(video.publishedAt).getFullYear();
    if (Number.isNaN(year)) continue;
    map.set(year, (map.get(year) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

export async function getVideoMeta(videoId: string, apiKey?: string) {
  const data = await ytFetch<{
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        description: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: { high?: { url: string }; medium?: { url: string } };
      };
    }>;
  }>(
    "/videos",
    {
      part: "snippet",
      id: videoId,
    },
    apiKey,
  );

  const item = data.items?.[0];
  if (!item) throw new Error("영상을 찾을 수 없습니다.");
  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl:
      item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || "",
  };
}
