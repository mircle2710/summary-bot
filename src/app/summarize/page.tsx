"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CopyButton } from "@/components/CopyButton";
import {
  buildSummaryMarkdown,
  downloadTextFile,
  safeFilename,
} from "@/lib/download";
import type {
  AnalysisSection,
  Framework,
  SummaryResult,
} from "@/lib/types";
import { PET_PROBLEM_FRAMEWORK } from "@/lib/types";

type SummarizeResponse = SummaryResult & {
  channelTitle?: string;
  thumbnailUrl?: string;
  transcript?: string;
  source?: "caption" | "metadata";
  error?: string;
};

const PROGRESS_STEPS = [
  { atMs: 0, percent: 8, label: "요청 준비 중…" },
  { atMs: 700, percent: 22, label: "영상 정보 확인 중…" },
  { atMs: 1800, percent: 45, label: "자막/설명 수집 중…" },
  { atMs: 3200, percent: 68, label: "Vertex로 요약·구조화 중…" },
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
  const [reorganizing, setReorganizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [activeFrameworkId, setActiveFrameworkId] = useState("");
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [sectionCache, setSectionCache] = useState<Record<string, AnalysisSection[]>>(
    {},
  );
  const [customPrompt, setCustomPrompt] = useState("");
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
    setSections([]);
    setFrameworks([]);
    setActiveFrameworkId("");
    setSectionCache({});
    setCustomPrompt("");
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

      const nextFrameworks =
        data.frameworks && data.frameworks.length > 0
          ? data.frameworks
          : [PET_PROBLEM_FRAMEWORK];
      const nextId = data.activeFrameworkId || nextFrameworks[0].id;
      const nextSections = data.sections || [];

      setResult(data);
      setFrameworks(nextFrameworks);
      setActiveFrameworkId(nextId);
      setSections(nextSections);
      setSectionCache({ [nextId]: nextSections });
    } catch (err) {
      clearProgressTimers();
      setProgress(0);
      setProgressLabel("");
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFrameworkSelect(framework: Framework) {
    if (!result || reorganizing) return;
    if (framework.id === activeFrameworkId) return;

    const cached = sectionCache[framework.id];
    if (cached) {
      setActiveFrameworkId(framework.id);
      setSections(cached);
      return;
    }

    setError(null);
    setReorganizing(true);
    setActiveFrameworkId(framework.id);

    try {
      const res = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework,
          title: result.title,
          summary: result.summary,
          keyPoints: result.keyPoints,
          transcript: result.transcript,
        }),
      });
      const data = (await res.json()) as {
        sections?: AnalysisSection[];
        error?: string;
      };
      if (!res.ok || !data.sections) {
        throw new Error(data.error || "프레임 정리에 실패했습니다.");
      }
      setSections(data.sections);
      setSectionCache((prev) => ({ ...prev, [framework.id]: data.sections! }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      const fallbackEntry = Object.entries(sectionCache)[0];
      if (fallbackEntry) {
        setActiveFrameworkId(fallbackEntry[0]);
        setSections(fallbackEntry[1]);
      }
    } finally {
      setReorganizing(false);
    }
  }

  async function handleCustomPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!result || reorganizing) return;
    if (!customPrompt.trim()) {
      setError("분리에 사용할 프롬프트를 입력해 주세요.");
      return;
    }

    setError(null);
    setReorganizing(true);

    try {
      const res = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customPrompt: customPrompt.trim(),
          title: result.title,
          summary: result.summary,
          keyPoints: result.keyPoints,
          transcript: result.transcript,
        }),
      });
      const data = (await res.json()) as {
        framework?: Framework;
        sections?: AnalysisSection[];
        error?: string;
      };
      if (!res.ok || !data.framework || !data.sections) {
        throw new Error(data.error || "맞춤 정리에 실패했습니다.");
      }

      const framework: Framework = {
        ...data.framework,
        id: `custom-${Date.now()}`,
        label: data.framework.label || "맞춤 정리",
      };

      setFrameworks((prev) => {
        const withoutOldCustom = prev.filter((item) => !item.id.startsWith("custom-"));
        return [framework, ...withoutOldCustom];
      });
      setActiveFrameworkId(framework.id);
      setSections(data.sections);
      setSectionCache((prev) => ({ ...prev, [framework.id]: data.sections! }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setReorganizing(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const framework =
      frameworks.find((item) => item.id === activeFrameworkId) || null;
    const markdown = buildSummaryMarkdown({
      title: result.title,
      videoUrl: result.videoUrl,
      channelTitle: result.channelTitle,
      genreHint: result.genreHint,
      summary: result.summary,
      keyPoints: result.keyPoints || [],
      framework,
      sections,
    });
    downloadTextFile(safeFilename(result.title), markdown);
  }

  const activeFramework =
    frameworks.find((item) => item.id === activeFrameworkId) || null;

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="section-title">영상 요약</h1>
          <p className="section-desc">
            유튜브 URL을 요약하고, 숏츠로 뽑을 파트를 한 번에 정리합니다. 문제해결형
            영상이면 사건·원인·해결책으로, 아니면 장르에 맞는 숏츠용 파트로 나눕니다.
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
                    다운로드
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

          <div className="panel">
            <h3 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
              분리 정리 (숏츠용)
            </h3>
            <p className="muted" style={{ margin: "0 0 0.75rem" }}>
              숏츠로 뽑을 장면을 기준으로 나눕니다. 문제해결형 영상이면
              사건·원인·해결책, 아니면 장르에 맞는 파트가 기본입니다.
            </p>

            <form className="prompt-box" onSubmit={handleCustomPrompt}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>원하는 분리 방식 프롬프트</span>
                <textarea
                  className="input"
                  rows={3}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="예: 견종 매력 훅 / 키우기 전 꼭 알 점 / 오해 vs 진실 로 나눠줘"
                  disabled={reorganizing}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={reorganizing || !customPrompt.trim()}
              >
                {reorganizing ? (
                  <>
                    <span className="loading-dot" />
                    적용 중
                  </>
                ) : (
                  "프롬프트 적용"
                )}
              </button>
            </form>

            {frameworks.length > 0 && (
              <div className="analysis-tabs">
                {frameworks.map((framework) => (
                  <button
                    key={framework.id}
                    type="button"
                    className={`btn btn-secondary${activeFrameworkId === framework.id ? " active" : ""}`}
                    onClick={() => handleFrameworkSelect(framework)}
                    disabled={reorganizing}
                  >
                    {reorganizing && activeFrameworkId === framework.id ? (
                      <>
                        <span className="loading-dot" />
                        정리 중
                      </>
                    ) : (
                      framework.label
                    )}
                  </button>
                ))}
              </div>
            )}

            {reorganizing && !sectionCache[activeFrameworkId] ? (
              <p className="muted" style={{ marginTop: "0.85rem" }}>
                {activeFramework?.label || "선택 프레임"} 기준으로 다시 나누는 중…
              </p>
            ) : (
              <div className="section-stack">
                {sections.map((section) => (
                  <section key={section.key} className="section-card">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        marginBottom: "0.55rem",
                      }}
                    >
                      <h4 style={{ margin: 0 }}>{section.title}</h4>
                      <CopyButton
                        text={[section.content, ...section.items.map((item) => `- ${item}`)]
                          .filter(Boolean)
                          .join("\n")}
                        label="복사"
                      />
                    </div>
                    {section.content && (
                      <div className="prose-block">{section.content}</div>
                    )}
                    {section.items.length > 0 && (
                      <ul className="item-list">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
