export type SavedChannel = {
  id: string;
  title: string;
  handle?: string;
  thumbnailUrl: string;
  addedAt: string;
};

export type ChannelDetails = {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnailUrl: string;
  country?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId?: string;
};

export type ChannelVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  url: string;
  hashtags: string[];
};

export type YearlyCount = {
  year: number;
  count: number;
  viewCount: number;
};

export type FrameworkPart = {
  key: string;
  title: string;
};

export type Framework = {
  id: string;
  label: string;
  parts: FrameworkPart[];
};

export type AnalysisSection = {
  key: string;
  title: string;
  content: string;
  items: string[];
};

export type SummaryResult = {
  title: string;
  summary: string;
  keyPoints: string[];
  videoId: string;
  videoUrl: string;
  source?: "caption" | "metadata";
  genreHint?: string;
  shortsTopics?: import("./shorts").ShortsTopic[];
  frameworks?: Framework[];
  sections?: AnalysisSection[];
  activeFrameworkId?: string;
};

export const PET_PROBLEM_FRAMEWORK: Framework = {
  id: "pet-problem",
  label: "사건 · 원인 · 해결책&훈육",
  parts: [
    { key: "incident", title: "사건" },
    { key: "cause", title: "원인" },
    { key: "solution", title: "해결책 & 훈육" },
  ],
};

/** @deprecated use PET_PROBLEM_FRAMEWORK */
export const DEFAULT_PET_FRAMEWORK = PET_PROBLEM_FRAMEWORK;
