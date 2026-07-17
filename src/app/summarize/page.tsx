"use client";

import { useState } from "react";
import type { AnalysisResult, AnalysisType, SummaryResult } from "@/lib/types";

type SummarizeResponse = SummaryResult & {
  channelTitle?: string;
  thumbnailUrl?: string;
  transcript?: string;
  error?: string;
};

const ANALYSIS_BUTTONS: { type: AnalysisType; label: string }[] = [
  { type: "incident", label: "사건" },
  { type: "cause", label: "원인" },
  { type: "solution", label: "해결책 & 훈육" },
];

export default function SummarizePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<AnalysisType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [analyses, setAnalyses] = useState<Partial<Record<AnalysisType, AnalysisResult>>>(
    {},
  );
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType | null>(null);

  async function handleSummarize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setAnalyses({});
    setActiveAnalysis(null);
    setResult(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as SummarizeResponse;
      if (!res.ok) throw new Error(data.error || "요약에 실패했습니다.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(type: AnalysisType) {
    if (!result) return;
    setError(null);
    setActiveAnalysis(type);

    if (analyses[type]) return;

    setAnalyzing(type);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: result.title,
          summary: result.summary,
          keyPoints: result.keyPoints,
          transcript: result.transcript,
        }),
      });
      const data = (await res.json()) as { result?: AnalysisResult; error?: string };
      if (!res.ok || !data.result) {
        throw new Error(data.error || "분석에 실패했습니다.");
      }
      setAnalyses((prev) => ({ ...prev, [type]: data.result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setAnalyzing(null);
    }
  }

  const current = activeAnalysis ? analyses[activeAnalysis] : null;

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="section-title">영상 요약</h1>
          <p className="section-desc">
            유튜브 URL을 입력하면 자막을 바탕으로 NotebookLM처럼 정리합니다.
            요약 후 사건·원인·해결책&훈육으로 분리할 수 있습니다.
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
                <a
                  className="btn btn-secondary"
                  href={result.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginTop: "0.85rem" }}
                >
                  원본 영상 보기
                </a>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: "0 0 0.75rem", fontFamily: "var(--font-display)" }}>
              요약 정리
            </h3>
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

          <div className="panel">
            <h3 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
              분리 정리
            </h3>
            <p className="muted" style={{ margin: "0 0 0.75rem" }}>
              버튼을 누르면 해당 관점으로 내용을 다시 나눠 정리합니다.
            </p>
            <div className="analysis-tabs">
              {ANALYSIS_BUTTONS.map((btn) => (
                <button
                  key={btn.type}
                  type="button"
                  className={`btn btn-secondary${activeAnalysis === btn.type ? " active" : ""}`}
                  onClick={() => handleAnalyze(btn.type)}
                  disabled={analyzing !== null}
                >
                  {analyzing === btn.type ? (
                    <>
                      <span className="loading-dot" />
                      정리 중
                    </>
                  ) : (
                    btn.label
                  )}
                </button>
              ))}
            </div>

            {current && (
              <div style={{ marginTop: "0.5rem" }}>
                <h4 style={{ margin: "0 0 0.55rem" }}>{current.title}</h4>
                <div className="prose-block">{current.content}</div>
                {current.items.length > 0 && (
                  <ul className="item-list">
                    {current.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
