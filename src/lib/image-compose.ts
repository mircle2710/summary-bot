import type { SubtitleOptions } from "./shorts";
import { SUBTITLE_FONTS } from "./shorts";

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

  // Also break long Korean chunks without spaces
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
  canvas.width = img.naturalWidth || 768;
  canvas.height = img.naturalHeight || 1408;
  const ctx = canvas.getContext("2d");
  if (!ctx) return params.imageDataUrl;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const fontMeta =
    SUBTITLE_FONTS.find((f) => f.id === params.options.fontFamily) || SUBTITLE_FONTS[0];
  const fontSize = Math.max(18, Math.min(96, params.options.fontSize));
  ctx.font = `700 ${fontSize}px ${fontMeta.css}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = canvas.width * 0.86;
  const lines = wrapText(ctx, params.text.trim(), maxWidth);
  const lineHeight = fontSize * 1.35;
  const blockHeight = lines.length * lineHeight;
  const paddingY = fontSize * 0.8;

  let centerY =
    params.options.position === "top"
      ? paddingY + blockHeight / 2
      : params.options.position === "center"
        ? canvas.height / 2
        : canvas.height - paddingY - blockHeight / 2;

  // Dark translucent plate behind text
  const platePadX = fontSize * 0.6;
  const platePadY = fontSize * 0.35;
  const plateWidth = Math.min(
    maxWidth + platePadX * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + platePadX * 2,
  );
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(
    (canvas.width - plateWidth) / 2,
    centerY - blockHeight / 2 - platePadY,
    plateWidth,
    blockHeight + platePadY * 2,
  );

  ctx.lineWidth = Math.max(2, fontSize / 14);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#ffffff";

  lines.forEach((line, index) => {
    const y = centerY - blockHeight / 2 + lineHeight * index + lineHeight / 2;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });

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
