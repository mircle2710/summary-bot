"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CopyButton } from "@/components/CopyButton";
import { ShortsFeedPanel } from "@/components/ShortsFeedPanel";
import { BlogPanel } from "@/components/BlogPanel";
import {
  buildSummaryMarkdown,
  downloadTextFile,
  safeFilename,
} from "@/lib/download";
import type { ShortsTopic } from "@/lib/shorts";
import type { SummaryResult } from "@/lib/types";

type SummarizeResponse = SummaryResult & {
  channelTitle?: string;
  thumbnailUrl?: string;
  transcript?: string;
  source?: "caption" | "metadata";
  shortsTopics?: ShortsTopic[];
  error?: string;
};

const PROGRESS_STEPS = [
  { atMs: 0, percent: 8, label: "요청 준비 중…" },
  { atMs: 700, percent: 22, label: "영상 정보 확인 중…" },
  { atMs: 1800, percent: 45, label: "자막/설명 수집 중…" },
  { atMs: 3200, percent: 68, label: "Vertex로 요약·주제 추천 중…" },
  { atMs: 5200, percent: 86, label: "결과 정리 중…" },
  { atMs: 8000, percent: 94, label: "거의 완료…" },
];

function buildSummaryCopyText(result: SummarizeResponse) {
  const lines = [result.summary.trim()];
  if (result.keyPoints?.length) {
    lines.push("", "핵심 포인트");
    for (const point of result.keyPoints) {
      lines.push(`- ${point}`);
    }
  }
  return lines.join("\n");
}

export default function SummarizePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const timeoutIdsRef = useRef<number[]>([]);
  const intervalIdRef = useRef<number | null>(null);

  function clearProgressTimers() {
    for (const id of timeoutIdsRef.current) window.clearTimeout(id);
    timeoutIdsRef.current = [];
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }

  function startProgress() {
    clearProgressTimers();
    setProgress(0);
    setProgressLabel(PROGRESS_STEPS[0].label);
    setElapsedSec(0);

    for (const step of PROGRESS_STEPS) {
      const id = window.setTimeout(() => {
        setProgress(step.percent);
        setProgressLabel(step.label);
      }, step.atMs);
      timeoutIdsRef.current.push(id);
    }

    intervalIdRef.current = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
  }

  function finishProgress() {
    clearProgressTimers();
    setProgress(100);
    setProgressLabel("완료");
  }

  useEffect(() => {
    return () => clearProgressTimers();
  }, []);

  const summaryCopyText = useMemo(
    () => (result ? buildSummaryCopyText(result) : ""),
    [result],
  );

  async function handleSummarize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);
    startProgress();

    try {
      const res = await apiFetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as SummarizeResponse;
      if (!res.ok) throw new Error(data.error || "요약에 실패했습니다.");
      finishProgress();
      setResult(data);
    } catch (err) {
      clearProgressTimers();
      setProgress(0);
      setProgressLabel("");
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const markdown = buildSummaryMarkdown({
      title: result.title,
      videoUrl: result.videoUrl,
      channelTitle: result.channelTitle,
      genreHint: result.genreHint,
      summary: result.summary,
      keyPoints: result.keyPoints || [],
      framework: null,
      sections: [],
    });
    downloadTextFile(safeFilename(result.title), markdown);
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="section-title">영상 요약</h1>
          <p className="section-desc">
            유튜브 URL을 요약하고, 동시에 숏츠 피드로 만들 주제를 추천합니다. 주제·밀도·스타일을
            고른 뒤 문장과 이미지를 생성·다운로드하세요.
          </p>
        </div>
      </div>

      <form className="panel" onSubmit={handleSummarize}>
        <div className="form-row">
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-dot" />
                요약 중
              </>
            ) : (
              "요약"
            )}
          </button>
        </div>

        {(loading || progress === 100) && progressLabel && (
          <div className="progress-panel" aria-live="polite">
            <div className="progress-meta">
              <span>{progressLabel}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {loading && (
              <p className="muted progress-elapsed">경과 시간 {elapsedSec}초</p>
            )}
          </div>
        )}

        {error && <div className="error-box">{error}</div>}
      </form>

      {result && (
        <div style={{ marginTop: "1.25rem" }}>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {result.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.thumbnailUrl}
                  alt=""
                  style={{
                    width: 180,
                    borderRadius: 12,
                    objectFit: "cover",
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ margin: "0 0 0.4rem", fontFamily: "var(--font-display)" }}>
                  {result.title}
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  {result.channelTitle}
                </p>
                {result.genreHint && (
                  <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                    장르 추정: {result.genreHint}
                  </p>
                )}
                <div className="form-row" style={{ marginTop: "0.85rem" }}>
                  <a
                    className="btn btn-secondary"
                    href={result.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    원본 영상 보기
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownload}
                  >
                    요약 다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
                요약 정리
              </h3>
              <CopyButton
                text={summaryCopyText}
                label="복사하기"
                className="btn btn-secondary"
              />
            </div>
            {result.source === "metadata" && (
              <div className="notice-box">
                자막을 찾지 못해 제목·영상 설명 기준으로 요약했습니다. 내용 정확도는
                자막 기반보다 낮을 수 있습니다.
              </div>
            )}
            <div className="prose-block">{result.summary}</div>
            {result.keyPoints?.length > 0 && (
              <>
                <h4 style={{ margin: "1.25rem 0 0.4rem" }}>핵심 포인트</h4>
                <ul className="key-list">
                  {result.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <ShortsFeedPanel
            key={result.videoId}
            title={result.title}
            summary={result.summary}
            keyPoints={result.keyPoints || []}
            initialTopics={result.shortsTopics || []}
          />

          <BlogPanel
            key={`blog-${result.videoId}`}
            title={result.title}
            summary={result.summary}
            keyPoints={result.keyPoints || []}
          />
        </div>
      )}
    </div>
  );
}
