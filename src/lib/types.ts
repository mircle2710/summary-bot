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

export type SummaryResult = {
  title: string;
  summary: string;
  keyPoints: string[];
  videoId: string;
  videoUrl: string;
};

export type AnalysisType = "incident" | "cause" | "solution";

export type AnalysisResult = {
  type: AnalysisType;
  title: string;
  content: string;
  items: string[];
};
