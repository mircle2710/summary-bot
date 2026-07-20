import type { AnalysisSection, Framework } from "./types";

export function buildSummaryMarkdown(params: {
  title: string;
  videoUrl: string;
  channelTitle?: string;
  genreHint?: string;
  summary: string;
  keyPoints: string[];
  framework?: Framework | null;
  sections: AnalysisSection[];
}) {
  const lines: string[] = [];
  lines.push(`# ${params.title}`);
  lines.push("");
  if (params.channelTitle) lines.push(`- 채널: ${params.channelTitle}`);
  lines.push(`- URL: ${params.videoUrl}`);
  if (params.genreHint) lines.push(`- 장르: ${params.genreHint}`);
  if (params.framework) lines.push(`- 프레임: ${params.framework.label}`);
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(params.summary.trim());
  lines.push("");

  if (params.keyPoints.length > 0) {
    lines.push("## 핵심 포인트");
    lines.push("");
    for (const point of params.keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  if (params.sections.length > 0) {
    lines.push("## 분리 정리");
    lines.push("");
    for (const section of params.sections) {
      lines.push(`### ${section.title}`);
      lines.push("");
      if (section.content.trim()) {
        lines.push(section.content.trim());
        lines.push("");
      }
      if (section.items.length > 0) {
        for (const item of section.items) {
          lines.push(`- ${item}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n").trim() + "\n";
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(title: string) {
  const base = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${base || "youtube-summary"}.md`;
}
