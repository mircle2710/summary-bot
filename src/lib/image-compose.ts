import type { SubtitleOptions } from "./shorts";
import { SUBTITLE_FONTS } from "./shorts";

export const SHORTS_CANVAS_WIDTH = 768;
export const SHORTS_CANVAS_HEIGHT = 1408;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);

  return lines.flatMap((line) => {
    if (ctx.measureText(line).width <= maxWidth) return [line];
    const chars = [...line];
    const out: string[] = [];
    let buf = "";
    for (const ch of chars) {
      const test = buf + ch;
      if (ctx.measureText(test).width <= maxWidth) buf = test;
      else {
        if (buf) out.push(buf);
        buf = ch;
      }
    }
    if (buf) out.push(buf);
    return out;
  });
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  text: string,
  options: SubtitleOptions,
) {
  if (!options.enabled || !text.trim()) return;

  const fontMeta =
    SUBTITLE_FONTS.find((f) => f.id === options.fontFamily) || SUBTITLE_FONTS[0];
  const fontSize = Math.max(18, Math.min(96, options.fontSize));
  ctx.font = `700 ${fontSize}px ${fontMeta.css}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = canvasWidth * 0.86;
  const lines = wrapText(ctx, text.trim(), maxWidth);
  const lineHeight = fontSize * 1.35;
  const blockHeight = lines.length * lineHeight;
  const paddingY = fontSize * 0.8;

  const centerY =
    options.position === "top"
      ? paddingY + blockHeight / 2
      : options.position === "center"
        ? canvasHeight / 2
        : canvasHeight - paddingY - blockHeight / 2;

  const platePadX = fontSize * 0.6;
  const platePadY = fontSize * 0.35;
  const plateWidth = Math.min(
    maxWidth + platePadX * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width), 0) + platePadX * 2,
  );
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(
    (canvasWidth - plateWidth) / 2,
    centerY - blockHeight / 2 - platePadY,
    plateWidth,
    blockHeight + platePadY * 2,
  );

  ctx.lineWidth = Math.max(2, fontSize / 14);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#ffffff";

  lines.forEach((line, index) => {
    const y = centerY - blockHeight / 2 + lineHeight * index + lineHeight / 2;
    ctx.strokeText(line, canvasWidth / 2, y);
    ctx.fillText(line, canvasWidth / 2, y);
  });
}

/** Black 9:16 frame with subtitle only — used as placeholder before image gen. */
export function createBlackSubtitlePreview(params: {
  text: string;
  options: SubtitleOptions;
  width?: number;
  height?: number;
}): string {
  const width = params.width ?? SHORTS_CANVAS_WIDTH;
  const height = params.height ?? SHORTS_CANVAS_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  drawSubtitle(ctx, width, height, params.text, {
    ...params.options,
    enabled: true,
  });

  return canvas.toDataURL("image/png");
}

export async function composeSubtitleOnImage(params: {
  imageDataUrl: string;
  text: string;
  options: SubtitleOptions;
}): Promise<string> {
  if (!params.options.enabled || !params.text.trim()) {
    return params.imageDataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    el.src = params.imageDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || SHORTS_CANVAS_WIDTH;
  canvas.height = img.naturalHeight || SHORTS_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return params.imageDataUrl;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawSubtitle(ctx, canvas.width, canvas.height, params.text, params.options);

  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function previewFontCss(fontFamilyId: string): string {
  return (
    SUBTITLE_FONTS.find((f) => f.id === fontFamilyId)?.css || SUBTITLE_FONTS[0].css
  );
}
