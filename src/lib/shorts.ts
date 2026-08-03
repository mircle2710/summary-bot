export type ShortsTopic = {
  id: string;
  title: string;
  angle: string;
};

export type ImageDensity = 1 | 2 | 3;

export type ImageStyleId =
  | "anime-jp"
  | "disney"
  | "photoreal"
  | "watercolor"
  | "ghibli"
  | "pixar-3d"
  | "minimal-vector"
  | "acrylic-oil"
  | "cinematic"
  | "vintage-retro"
  | "miniature-clay"
  | "pop-art"
  | "crayon-pencil";

export type SubtitlePosition = "top" | "center" | "bottom";

export type SubtitleOptions = {
  enabled: boolean;
  position: SubtitlePosition;
  /** Fine vertical nudge from the base position, in % of frame height (-40 ~ 40). */
  offset: number;
  fontFamily: string;
  fontSize: number;
};

export type ShortsScene = {
  id: string;
  text: string;
  imagePrompt: string;
  extraPrompt: string;
  /** Per-scene subtitle placement; falls back to global options when unset. */
  subtitlePosition: SubtitlePosition;
  subtitleOffset: number;
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
  {
    id: "watercolor",
    label: "수채화 스타일",
    promptHint:
      "Delicate watercolor painting style, soft wet-on-wet washes, translucent pigments, paper texture, gentle color blooms, vertical 9:16 composition",
  },
  {
    id: "ghibli",
    label: "지브리 스타일",
    promptHint:
      "Studio Ghibli inspired hand-drawn animation style, warm nostalgic colors, soft painted backgrounds, whimsical atmosphere, vertical 9:16 composition",
  },
  {
    id: "pixar-3d",
    label: "3D 픽사 / 3D 카툰",
    promptHint:
      "Pixar-like 3D cartoon render, smooth subsurface lighting, expressive stylized characters, clean CGI look, vertical 9:16 composition",
  },
  {
    id: "minimal-vector",
    label: "미니멀 벡터 / 동화책",
    promptHint:
      "Minimal vector illustration, cute storybook style, flat shapes, clean outlines, cozy pastel palette, vertical 9:16 composition",
  },
  {
    id: "acrylic-oil",
    label: "아크릴 / 유화 텍스처",
    promptHint:
      "Acrylic and oil painting texture, visible brush strokes, rich impasto paint, layered pigment, gallery art look, vertical 9:16 composition",
  },
  {
    id: "cinematic",
    label: "시네마틱 영화 샷",
    promptHint:
      "Cinematic movie still, dramatic lighting, shallow depth of field, film color grading, widescreen storytelling framed vertically 9:16",
  },
  {
    id: "vintage-retro",
    label: "빈티지 / 레트로 (70·80)",
    promptHint:
      "1970s-1980s vintage retro illustration, grainy print texture, muted warm tones, nostalgic poster art vibe, vertical 9:16 composition",
  },
  {
    id: "miniature-clay",
    label: "미니어처 / 클레이아트",
    promptHint:
      "Miniature claymation / stop-motion clay art style, soft sculpted forms, tactile polymer clay texture, playful diorama look, vertical 9:16 composition",
  },
  {
    id: "pop-art",
    label: "팝아트 / 화려한 컬러",
    promptHint:
      "Bold pop art illustration, high-contrast vivid colors, graphic halftone accents, energetic comic-poster style, vertical 9:16 composition",
  },
  {
    id: "crayon-pencil",
    label: "색연필 / 크레파스 손그림",
    promptHint:
      "Hand-drawn colored pencil and crayon illustration, visible stroke texture, childlike warmth, soft paper grain, vertical 9:16 composition",
  },
];

export const IMAGE_STYLE_IDS = IMAGE_STYLE_OPTIONS.map((opt) => opt.id);
export const SUBTITLE_FONTS = [
  { id: "sans", label: "고딕", css: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif' },
  { id: "serif", label: "명조", css: '"Noto Serif KR", "Apple Myungjo", serif' },
  { id: "display", label: "강조체", css: "system-ui, sans-serif" },
];

/** Vertical center of the subtitle block as % of frame height (8–92). */
export function subtitleVerticalPercent(
  options: Pick<SubtitleOptions, "position" | "offset">,
): number {
  const base =
    options.position === "top" ? 12 : options.position === "center" ? 50 : 88;
  const offset = Math.max(-40, Math.min(40, options.offset ?? 0));
  return Math.max(8, Math.min(92, base + offset));
}
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
