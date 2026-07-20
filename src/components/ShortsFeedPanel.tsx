"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { composeSubtitleOnImage, downloadDataUrl } from "@/lib/image-compose";
import {
  estimateImageCount,
  estimateSentenceCount,
  IMAGE_DENSITY_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  SUBTITLE_FONTS,
  type ImageDensity,
  type ImageStyleId,
  type ShortsScene,
  type ShortsTopic,
  type SubtitleOptions,
  type SubtitlePosition,
} from "@/lib/shorts";

type ShortsFeedPanelProps = {
  title: string;
  summary: string;
  keyPoints: string[];
  initialTopics: ShortsTopic[];
};

export function ShortsFeedPanel({
  title,
  summary,
  keyPoints,
  initialTopics,
}: ShortsFeedPanelProps) {
  const [topics, setTopics] = useState<ShortsTopic[]>(initialTopics);
  const [topicPrompt, setTopicPrompt] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    initialTopics[0]?.id || null,
  );
  const [density, setDensity] = useState<ImageDensity>(2);
  const [style, setStyle] = useState<ImageStyleId>("anime-jp");
  const [subtitle, setSubtitle] = useState<SubtitleOptions>({
    enabled: true,
    position: "bottom",
    fontFamily: "sans",
    fontSize: 42,
  });
  const [sentences, setSentences] = useState<string[]>([]);
  const [scenes, setScenes] = useState<ShortsScene[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingScript, setLoadingScript] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedCount = useMemo(() => {
    const sentenceGuess = Math.max(
      estimateSentenceCount(summary),
      keyPoints.length || 1,
    );
    return estimateImageCount(sentenceGuess, density);
  }, [summary, keyPoints.length, density]);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;

  async function refreshTopics() {
    setLoadingTopics(true);
    setError(null);
    try {
      const res = await apiFetch("/api/shorts/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          keyPoints,
          customPrompt: topicPrompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { topics?: ShortsTopic[]; error?: string };
      if (!res.ok || !data.topics) {
        throw new Error(data.error || "주제 추천에 실패했습니다.");
      }
      setTopics(data.topics);
      setSelectedTopicId(data.topics[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoadingTopics(false);
    }
  }

  async function confirmScript() {
    if (!topicPrompt.trim() && !selectedTopic) {
      setError("주제를 선택하거나 프롬프트를 작성해 주세요.");
      return;
    }
    setLoadingScript(true);
    setError(null);
    setScenes([]);
    setSentences([]);
    try {
      const res = await apiFetch("/api/shorts/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          keyPoints,
          topicTitle: selectedTopic?.title,
          topicAngle: selectedTopic?.angle,
          customPrompt: topicPrompt.trim() || undefined,
          density,
          style,
        }),
      });
      const data = (await res.json()) as {
        sentences?: string[];
        scenes?: Array<{ id: string; text: string; imagePrompt: string }>;
        error?: string;
      };
      if (!res.ok || !data.scenes) {
        throw new Error(data.error || "숏츠 문장 생성에 실패했습니다.");
      }
      setSentences(data.sentences || []);
      setScenes(
        data.scenes.map((scene) => ({
          ...scene,
          extraPrompt: "",
          imageRawDataUrl: null,
          imageDataUrl: null,
          generating: false,
          error: null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoadingScript(false);
    }
  }

  async function generateOne(sceneId: string, forceNewSeed = false) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId ? { ...s, generating: true, error: null } : s,
      ),
    );

    try {
      const seed = forceNewSeed ? Math.floor(Math.random() * 2_000_000_000) : undefined;
      const res = await apiFetch("/api/shorts/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneText: scene.text,
          imagePrompt: scene.imagePrompt,
          extraPrompt: scene.extraPrompt,
          style,
          seed,
        }),
      });
      const data = (await res.json()) as {
        dataUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.dataUrl) {
        throw new Error(data.error || "이미지 생성에 실패했습니다.");
      }

      const composed = await composeSubtitleOnImage({
        imageDataUrl: data.dataUrl,
        text: scene.text,
        options: subtitle,
      });

      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                imageRawDataUrl: data.dataUrl!,
                imageDataUrl: composed,
                generating: false,
                error: null,
              }
            : s,
        ),
      );
    } catch (err) {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                generating: false,
                error: err instanceof Error ? err.message : "이미지 생성 실패",
              }
            : s,
        ),
      );
    }
  }

  async function reapplySubtitles() {
    setError(null);
    const next = await Promise.all(
      scenes.map(async (scene) => {
        if (!scene.imageRawDataUrl) return scene;
        const composed = await composeSubtitleOnImage({
          imageDataUrl: scene.imageRawDataUrl,
          text: scene.text,
          options: subtitle,
        });
        return { ...scene, imageDataUrl: composed };
      }),
    );
    setScenes(next);
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    for (const scene of scenes) {
      // sequential to reduce quota spikes
      // eslint-disable-next-line no-await-in-loop
      await generateOne(scene.id, true);
    }
    setGeneratingAll(false);
  }

  function downloadScene(scene: ShortsScene, index: number) {
    if (!scene.imageDataUrl) return;
    downloadDataUrl(`shorts-${index + 1}.png`, scene.imageDataUrl);
  }

  function downloadAll() {
    scenes.forEach((scene, index) => {
      if (scene.imageDataUrl) downloadScene(scene, index);
    });
  }

  return (
    <div className="panel">
      <h3 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
        숏츠 피드 만들기
      </h3>
      <p className="muted" style={{ margin: "0 0 1rem" }}>
        요약 기반으로 주제를 고르거나 프롬프트를 적은 뒤, 문장 밀도와 스타일을 정하고
        이미지를 생성하세요.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="shorts-step">
        <h4>1. 숏츠로 만들 주제</h4>
        <div className="topic-grid">
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`topic-card${selectedTopicId === topic.id ? " active" : ""}`}
              onClick={() => setSelectedTopicId(topic.id)}
            >
              <strong>{topic.title}</strong>
              {topic.angle && <span className="muted">{topic.angle}</span>}
            </button>
          ))}
          {topics.length === 0 && (
            <p className="muted">추천 주제가 없습니다. 프롬프트로 다시 받아 보세요.</p>
          )}
        </div>
        <label className="field" style={{ marginTop: "0.75rem" }}>
          <span>또는 주제 프롬프트 직접 작성</span>
          <textarea
            className="input"
            rows={2}
            value={topicPrompt}
            onChange={(e) => setTopicPrompt(e.target.value)}
            placeholder="예: 그로넨달을 키우기 전 꼭 알아야 할 3가지로 숏츠 구성"
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void refreshTopics()}
          disabled={loadingTopics}
        >
          {loadingTopics ? "주제 갱신 중…" : "주제 다시 추천"}
        </button>
      </div>

      <div className="shorts-step">
        <h4>2. 이미지 밀도</h4>
        <div className="analysis-tabs">
          {IMAGE_DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn-secondary${density === opt.value ? " active" : ""}`}
              onClick={() => setDensity(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: "0.5rem 0 0" }}>
          예상 이미지 장수: <strong>{estimatedCount}장</strong>
          {scenes.length > 0 ? ` (확정 장면 ${scenes.length}장)` : ""}
        </p>
      </div>

      <div className="shorts-step">
        <h4>3. 이미지 스타일</h4>
        <div className="analysis-tabs">
          {IMAGE_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`btn btn-secondary${style === opt.id ? " active" : ""}`}
              onClick={() => setStyle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="shorts-step">
        <h4>4. 자막 옵션 (이미지에 문장 넣기)</h4>
        <label className="check-row">
          <input
            type="checkbox"
            checked={subtitle.enabled}
            onChange={(e) =>
              setSubtitle((prev) => ({ ...prev, enabled: e.target.checked }))
            }
          />
          문장을 자막으로 이미지에 추가
        </label>
        {subtitle.enabled && (
          <div className="subtitle-controls">
            <label className="field">
              <span>위치</span>
              <select
                className="input"
                value={subtitle.position}
                onChange={(e) =>
                  setSubtitle((prev) => ({
                    ...prev,
                    position: e.target.value as SubtitlePosition,
                  }))
                }
              >
                <option value="top">상단</option>
                <option value="center">중앙</option>
                <option value="bottom">하단</option>
              </select>
            </label>
            <label className="field">
              <span>글씨체</span>
              <select
                className="input"
                value={subtitle.fontFamily}
                onChange={(e) =>
                  setSubtitle((prev) => ({ ...prev, fontFamily: e.target.value }))
                }
              >
                {SUBTITLE_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>글씨 크기 ({subtitle.fontSize}px)</span>
              <input
                className="input"
                type="range"
                min={24}
                max={72}
                value={subtitle.fontSize}
                onChange={(e) =>
                  setSubtitle((prev) => ({
                    ...prev,
                    fontSize: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
        )}
      </div>

      <div className="form-row" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void confirmScript()}
          disabled={loadingScript}
        >
          {loadingScript ? "문장 만드는 중…" : "확인 · 숏츠 문장 만들기"}
        </button>
      </div>

      {scenes.length > 0 && (
        <div className="shorts-step">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h4 style={{ margin: 0 }}>5. 숏츠 문장 · 이미지</h4>
            <div className="form-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void generateAll()}
                disabled={generatingAll || scenes.some((s) => s.generating)}
              >
                {generatingAll ? "이미지 생성 중…" : "이미지 생성하기"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void reapplySubtitles()}
                disabled={!scenes.some((s) => s.imageRawDataUrl)}
              >
                자막 설정 다시 적용
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={downloadAll}
                disabled={!scenes.some((s) => s.imageDataUrl)}
              >
                전체 다운로드
              </button>
            </div>
          </div>

          {sentences.length > 0 && (
            <details style={{ margin: "0.75rem 0" }}>
              <summary className="muted">전체 문장 목록 ({sentences.length})</summary>
              <ol className="sentence-list">
                {sentences.map((sentence) => (
                  <li key={sentence}>{sentence}</li>
                ))}
              </ol>
            </details>
          )}

          <div className="scene-stack">
            {scenes.map((scene, index) => (
              <article key={scene.id} className="scene-card">
                <div className="scene-head">
                  <strong>
                    {index + 1}. {scene.text}
                  </strong>
                </div>
                <label className="field">
                  <span>이 장면 추가 지시사항 (프롬프트)</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={scene.extraPrompt}
                    onChange={(e) =>
                      setScenes((prev) =>
                        prev.map((s) =>
                          s.id === scene.id
                            ? { ...s, extraPrompt: e.target.value }
                            : s,
                        ),
                      )
                    }
                    placeholder="예: 검은 그로넨달이 잔디밭에서 뛰는 장면, 밝은 낮"
                  />
                </label>
                <div className="form-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={scene.generating || generatingAll}
                    onClick={() => void generateOne(scene.id, true)}
                  >
                    {scene.generating
                      ? "생성 중…"
                      : scene.imageDataUrl
                        ? "새로고침 (다시 생성)"
                        : "이 장면 이미지 생성"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!scene.imageDataUrl}
                    onClick={() => downloadScene(scene, index)}
                  >
                    다운로드
                  </button>
                </div>
                {scene.error && <div className="error-box">{scene.error}</div>}
                {scene.imageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="scene-image"
                    src={scene.imageDataUrl}
                    alt={`숏츠 장면 ${index + 1}`}
                  />
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
