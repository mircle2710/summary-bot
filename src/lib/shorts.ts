export type ShortsTopic = {
  id: string;
  title: string;
  angle: string;
};

export type ImageDensity = 1 | 2 | 3;

export type ImageStyleId = "anime-jp" | "disney" | "photoreal";

export type SubtitlePosition = "top" | "center" | "bottom";

export type SubtitleOptions = {
  enabled: boolean;
  position: SubtitlePosition;
  fontFamily: string;
  fontSize: number;
};

export type ShortsScene = {
  id: string;
  text: string;
  imagePrompt: string;
  extraPrompt: string;
  imageRawDataUrl: string | null;
  imageDataUrl: string | null;
  generating: boolean;
  error: string | null;
};

export const IMAGE_DENSITY_OPTIONS: {
  value: ImageDensity;
  label: string;
  hint: string;
}[] = [
  { value: 1, label: "문장 1개당 이미지 1장", hint: "장면이 많고 리듬이 빠름" },
  { value: 2, label: "문장 2개당 이미지 1장", hint: "균형 잡힌 구성" },
  { value: 3, label: "문장 3개당 이미지 1장", hint: "이미지가 적고 문장 밀도 높음" },
];

export const IMAGE_STYLE_OPTIONS: {
  id: ImageStyleId;
  label: string;
  promptHint: string;
}[] = [
  {
    id: "anime-jp",
    label: "일본풍 애니메이션",
    promptHint:
      "Japanese anime style illustration, clean line art, vibrant colors, cinematic lighting, vertical 9:16 composition",
  },
  {
    id: "disney",
    label: "디즈니풍",
    promptHint:
      "Disney-pixar style 3D animation look, soft lighting, expressive characters, family-friendly, vertical 9:16 composition",
  },
  {
    id: "photoreal",
    label: "실사체",
    promptHint:
      "Photorealistic photography, natural lighting, high detail, vertical 9:16 composition",
  },
];

export const SUBTITLE_FONTS = [
  { id: "sans", label: "고딕", css: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif' },
  { id: "serif", label: "명조", css: '"Noto Serif KR", "Apple Myungjo", serif' },
  { id: "display", label: "강조체", css: "system-ui, sans-serif" },
];

export function estimateSentenceCount(text: string): number {
  const parts = text
    .split(/(?<=[.!?。！？]|다\.|요\.|까\.|네\.|죠\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (parts.length > 0) return parts.length;
  const rough = Math.max(1, Math.round(text.replace(/\s+/g, " ").trim().length / 45));
  return Math.min(24, rough);
}

export function estimateImageCount(sentenceCount: number, density: ImageDensity): number {
  return Math.max(1, Math.ceil(sentenceCount / density));
}
