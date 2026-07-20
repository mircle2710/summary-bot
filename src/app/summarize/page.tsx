"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { AnalysisResult, AnalysisType, SummaryResult } from "@/lib/types";

type SummarizeResponse = SummaryResult & {
  channelTitle?: string;
  thumbnailUrl?: string;
  transcript?: string;
  source?: "caption" | "metadata";
  error?: string;
};

const ANALYSIS_BUTTONS: { type: AnalysisType; label: string }[] = [
  { type: "incident", label: "사건" },
  { type: "cause", label: "원인" },
  { type: "solution", label: "해결책 & 훈육" },
];

const PROGRESS_STEPS = [
  { atMs: 0, percent: 8, label: "요청 준비 중…" },
  { atMs: 700, percent: 22, label: "영상 정보 확인 중…" },
  { atMs: 1800, percent: 45, label: "자막/설명 수집 중…" },
  { atMs: 3200, percent: 68, label: "Gemini로 요약 중…" },
  { atMs: 5200, percent: 86, label: "결과 정리 중…" },
  { atMs: 8000, percent: 94, label: "거의 완료…" },
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

  async function handleSummarize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setAnalyses({});
    setActiveAnalysis(null);
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

  async function handleAnalyze(type: AnalysisType) {
    if (!result) return;
    setError(null);
    setActiveAnalysis(type);

    if (analyses[type]) return;

    setAnalyzing(type);
    try {
      const res = await apiFetch("/api/analyze", {
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
            유튜브 URL을 입력하면 자막(또는 자동자막)을 바탕으로 핵심 내용을 정리합니다.
            자막이 없으면 제목·설명을 기준으로 요약합니다. 요약 후 사건·원인·해결책&훈육으로
            분리할 수 있습니다.
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
