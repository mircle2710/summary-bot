export type BlogTopic = {
  id: string;
  title: string;
  angle: string;
};

export type BlogToneId = "friendly" | "expert" | "warm" | "concise";

export type BlogFontId = "sans" | "serif" | "display";

export type BlogParagraph = {
  id: string;
  heading?: string;
  text: string;
  imagePrompt: string;
  extraPrompt: string;
  imageDataUrl: string | null;
  generating: boolean;
  error: string | null;
};

export const BLOG_TONE_OPTIONS: { id: BlogToneId; label: string; hint: string }[] = [
  { id: "friendly", label: "친근한 말투", hint: "보호자 이웃처럼 쉽게" },
  { id: "expert", label: "전문적 말투", hint: "근거 중심, 차분한 설명" },
  { id: "warm", label: "따뜻한 말투", hint: "공감과 위로를 담아" },
  { id: "concise", label: "간결한 말투", hint: "핵심만 짧고 명확하게" },
];

export const BLOG_FONT_OPTIONS: { id: BlogFontId; label: string; css: string }[] = [
  { id: "sans", label: "고딕", css: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif' },
  { id: "serif", label: "명조", css: '"Noto Serif KR", "Apple Myungjo", serif' },
  { id: "display", label: "강조체", css: "system-ui, sans-serif" },
];

export const BLOG_IMAGE_STYLE = {
  promptHint:
    "Editorial blog illustration, clean composition, high detail, natural lighting, horizontal 16:9 framing suitable for a blog article",
};

export const BLOG_THUMBNAIL_STYLE = {
  promptHint:
    "Eye-catching blog thumbnail, bold simple composition, high contrast, horizontal 16:9, no small unreadable text",
};
