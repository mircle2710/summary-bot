"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  composeSubtitleOnImage,
  downloadDataUrl,
  previewFontCss,
} from "@/lib/image-compose";
import {
  estimateImageCount,
  estimateSentenceCount,
  IMAGE_DENSITY_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  SUBTITLE_FONTS,
  subtitleVerticalPercent,
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

function packScenesFromSentences(
  sentences: string[],
  density: ImageDensity,
  previous: ShortsScene[],
  defaults: Pick<SubtitleOptions, "position" | "offset">,
): ShortsScene[] {
  const cleaned = sentences.map((s) => s.trim()).filter(Boolean);
  const next: ShortsScene[] = [];
  for (let i = 0; i < cleaned.length; i += density) {
    const chunk = cleaned.slice(i, i + density);
    const text = chunk.join(" ");
    const index = next.length;
    const prev = previous[index];
    const textChanged = !prev || prev.text !== text;
    next.push({
      id: prev?.id || `scene-${index + 1}`,
      text,
      imagePrompt:
        !textChanged && prev?.imagePrompt
          ? prev.imagePrompt
          : `Vertical 9:16 scene illustrating: ${text}`,
      extraPrompt: prev?.extraPrompt || "",
      subtitlePosition: prev?.subtitlePosition ?? defaults.position,
      subtitleOffset: prev?.subtitleOffset ?? defaults.offset,
      imageRawDataUrl: textChanged ? null : prev?.imageRawDataUrl || null,
      imageDataUrl: textChanged ? null : prev?.imageDataUrl || null,
      generating: false,
      error: null,
    });
  }
  return next;
}

function captionStyle(subtitle: SubtitleOptions, previewWidth: number) {
  const fontCss = previewFontCss(subtitle.fontFamily);
  const previewFontPx = Math.max(
    12,
    Math.round(subtitle.fontSize * (previewWidth / 768)),
  );
  return {
    fontFamily: fontCss,
    fontSize: `${previewFontPx}px`,
    top: `${subtitleVerticalPercent(subtitle)}%`,
    transform: "translateY(-50%)",
  } as const;
}

function sceneSubtitleOptions(
  global: SubtitleOptions,
  scene: Pick<ShortsScene, "subtitlePosition" | "subtitleOffset">,
): SubtitleOptions {
  return {
    ...global,
    position: scene.subtitlePosition,
    offset: scene.subtitleOffset,
  };
}

function ScenePreview({
  scene,
  index,
  subtitle,
}: {
  scene: ShortsScene;
  index: number;
  subtitle: SubtitleOptions;
}) {
  const options = sceneSubtitleOptions(subtitle, scene);
  if (scene.imageDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="scene-image"
        src={scene.imageDataUrl}
        alt={`숏츠 장면 ${index + 1}`}
      />
    );
  }

  return (
    <div
      className="scene-black-preview"
      aria-label={`장면 ${index + 1} 검은 화면 미리보기`}
    >
      <p className="scene-black-caption" style={captionStyle(options, 280)}>
        {scene.text || "(문장을 입력해 주세요)"}
      </p>
      <span className="scene-black-badge">이미지 대기</span>
    </div>
  );
}

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
    offset: 0,
    fontFamily: "sans",
    fontSize: 42,
  });
  const [sentences, setSentences] = useState<string[]>([]);
  const [scenes, setScenes] = useState<ShortsScene[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingScript, setLoadingScript] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (editingIndex === null) return;
    const el = document.getElementById(
      `sentence-edit-${editingIndex}`,
    ) as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingIndex]);

  const estimatedCount = useMemo(() => {
    const sentenceGuess = Math.max(
      estimateSentenceCount(summary),
      keyPoints.length || 1,
    );
    return estimateImageCount(sentenceGuess, density);
  }, [summary, keyPoints.length, density]);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  const previewCaptionStyle = captionStyle(subtitle, 200);

  function updateSentence(index: number, value: string) {
    setSentences((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addSentence() {
    setSentences((prev) => [...prev, ""]);
  }

  function removeSentence(index: number) {
    setSentences((prev) => prev.filter((_, i) => i !== index));
  }

  function moveSentence(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setSentences((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

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
      const nextSentences =
        data.sentences && data.sentences.length > 0
          ? data.sentences
          : data.scenes.map((s) => s.text);
      setSentences(nextSentences);
      setScenes(
        data.scenes.map((scene) => ({
          ...scene,
          extraPrompt: "",
          subtitlePosition: subtitle.position,
          subtitleOffset: subtitle.offset,
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

  function applySentenceEditsToScenes() {
    const next = packScenesFromSentences(sentences, density, scenes, {
      position: subtitle.position,
      offset: subtitle.offset,
    });
    if (next.length === 0) {
      setError("최소 한 문장은 남겨 주세요.");
      return;
    }
    setError(null);
    setScenes(next);
  }

  async function generateOne(
    sceneId: string,
    forceNewSeed = false,
    sceneOverride?: ShortsScene,
  ) {
    const scene = sceneOverride || scenes.find((s) => s.id === sceneId);
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
        options: sceneSubtitleOptions(subtitle, scene),
      });

      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                text: scene.text,
                imagePrompt: scene.imagePrompt,
                extraPrompt: scene.extraPrompt,
                subtitlePosition: scene.subtitlePosition,
                subtitleOffset: scene.subtitleOffset,
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

  async function reapplySubtitles(syncFromGlobal = false) {
    setError(null);
    const sourceScenes = syncFromGlobal
      ? scenes.map((scene) => ({
          ...scene,
          subtitlePosition: subtitle.position,
          subtitleOffset: subtitle.offset,
        }))
      : scenes;

    if (syncFromGlobal) {
      setScenes(sourceScenes);
    }

    const next = await Promise.all(
      sourceScenes.map(async (scene) => {
        if (!scene.imageRawDataUrl) return scene;
        const composed = await composeSubtitleOnImage({
          imageDataUrl: scene.imageRawDataUrl,
          text: scene.text,
          options: sceneSubtitleOptions(subtitle, scene),
        });
        return { ...scene, imageDataUrl: composed };
      }),
    );
    setScenes(next);
  }

  async function updateSceneSubtitle(
    sceneId: string,
    patch: Partial<Pick<ShortsScene, "subtitlePosition" | "subtitleOffset">>,
  ) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const nextScene = { ...scene, ...patch };
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? nextScene : s)));

    if (!nextScene.imageRawDataUrl) return;
    try {
      const composed = await composeSubtitleOnImage({
        imageDataUrl: nextScene.imageRawDataUrl,
        text: nextScene.text,
        options: sceneSubtitleOptions(subtitle, nextScene),
      });
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, ...patch, imageDataUrl: composed } : s)),
      );
    } catch {
      // preview-only update already applied
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    const packed = packScenesFromSentences(sentences, density, scenes, {
      position: subtitle.position,
      offset: subtitle.offset,
    });
    setScenes(packed.map((s) => ({ ...s, generating: false, error: null })));
    for (const scene of packed) {
      // sequential to reduce quota spikes
      // eslint-disable-next-line no-await-in-loop
      await generateOne(scene.id, true, scene);
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
        <div className="analysis-tabs style-tabs">
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
          <>
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
                      offset: 0,
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
              <div className="subtitle-apply-row">
                <button
                  type="button"
                  className="btn btn-secondary subtitle-apply-all"
                  onClick={() => void reapplySubtitles(true)}
                  disabled={
                    !scenes.some((s) => s.imageRawDataUrl) ||
                    scenes.some((s) => s.generating)
                  }
                >
                  전체 장면에 자막 적용
                </button>
                <span className="muted subtitle-offset-hint">
                  위치·글씨체·크기·미세 조절을 모든 장면(각 장면 기본값 포함)에 한 번에
                  반영합니다.
                </span>
              </div>
              <label className="field subtitle-offset-field">
                <span>
                  미세 위치 조절 ({subtitle.offset > 0 ? "+" : ""}
                  {subtitle.offset}%)
                </span>
                <input
                  className="input"
                  type="range"
                  min={-40}
                  max={40}
                  step={1}
                  value={subtitle.offset}
                  onChange={(e) =>
                    setSubtitle((prev) => ({
                      ...prev,
                      offset: Number(e.target.value),
                    }))
                  }
                />
                <span className="muted subtitle-offset-hint">
                  왼쪽(위) ← → 오른쪽(아래). 상·중·하단 기준에서 조금씩 옮깁니다.
                </span>
              </label>
            </div>
            <div className="subtitle-size-preview" aria-live="polite">
              <span className="muted">자막 위치·크기 미리보기</span>
              <div className="subtitle-size-preview-frame">
                <p className="scene-black-caption" style={previewCaptionStyle}>
                  샘플 자막 {subtitle.fontSize}px
                </p>
              </div>
            </div>
          </>
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
                className="btn btn-secondary"
                onClick={applySentenceEditsToScenes}
              >
                문장 수정 반영
              </button>
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

          <div className="sentence-editor">
            <div className="sentence-editor-head">
              <strong>전체 문장 목록 ({sentences.length}) — 수정 가능</strong>
              <button type="button" className="btn btn-ghost" onClick={addSentence}>
                문장 추가
              </button>
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0.65rem" }}>
              문장 상자를 드래그해 순서를 바꾸고, <strong>수정</strong>을 누른 뒤에만
              내용을 고칠 수 있습니다. 끝나면 <strong>문장 수정 반영</strong>을 누르세요.
            </p>
            <ol className="sentence-edit-list">
              {sentences.map((sentence, index) => {
                const isEditing = editingIndex === index;
                return (
                  <li
                    key={`sentence-${index}`}
                    className={[
                      "sentence-row",
                      dragOverIndex === index ? "drag-over" : "",
                      isEditing ? "is-editing" : "is-draggable",
                      dragIndex === index ? "is-dragging" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => {
                      if (editingIndex !== null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverIndex !== index) setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === index) setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (editingIndex !== null) {
                        setDragIndex(null);
                        setDragOverIndex(null);
                        return;
                      }
                      const from =
                        dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
                      moveSentence(from, index);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        id={`sentence-edit-${index}`}
                        className="input sentence-text is-editable"
                        rows={2}
                        value={sentence}
                        onChange={(e) => updateSentence(index, e.target.value)}
                        placeholder={`${index + 1}번 문장`}
                      />
                    ) : (
                      <div
                        className="sentence-text-display"
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(index);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                      >
                        {sentence || `${index + 1}번 문장`}
                      </div>
                    )}
                    <div className="sentence-actions">
                      <button
                        type="button"
                        className="btn btn-ghost sentence-action-btn"
                        onClick={() =>
                          setEditingIndex((prev) => (prev === index ? null : index))
                        }
                      >
                        {isEditing ? "완료" : "수정"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost sentence-action-btn sentence-delete-btn"
                        onClick={() => {
                          if (editingIndex === index) setEditingIndex(null);
                          else if (editingIndex !== null && editingIndex > index) {
                            setEditingIndex(editingIndex - 1);
                          }
                          removeSentence(index);
                        }}
                        disabled={sentences.length <= 1}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="scene-stack">
            {scenes.map((scene, index) => (
              <article key={scene.id} className="scene-card">
                <div className="scene-head">
                  <strong>장면 {index + 1}</strong>
                </div>
                <label className="field">
                  <span>이 장면 자막/문장</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={scene.text}
                    onChange={(e) =>
                      setScenes((prev) =>
                        prev.map((s) =>
                          s.id === scene.id
                            ? {
                                ...s,
                                text: e.target.value,
                                imageRawDataUrl: null,
                                imageDataUrl: null,
                              }
                            : s,
                        ),
                      )
                    }
                  />
                </label>
                {subtitle.enabled && (
                  <div className="scene-subtitle-controls">
                    <label className="field">
                      <span>이 장면 자막 위치</span>
                      <select
                        className="input"
                        value={scene.subtitlePosition}
                        onChange={(e) =>
                          void updateSceneSubtitle(scene.id, {
                            subtitlePosition: e.target.value as SubtitlePosition,
                            subtitleOffset: 0,
                          })
                        }
                      >
                        <option value="top">상단</option>
                        <option value="center">중앙</option>
                        <option value="bottom">하단</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>
                        미세 조절 ({scene.subtitleOffset > 0 ? "+" : ""}
                        {scene.subtitleOffset}%)
                      </span>
                      <input
                        className="input"
                        type="range"
                        min={-40}
                        max={40}
                        step={1}
                        value={scene.subtitleOffset}
                        onChange={(e) =>
                          void updateSceneSubtitle(scene.id, {
                            subtitleOffset: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                <ScenePreview scene={scene} index={index} subtitle={subtitle} />
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
                    placeholder="예: 고양이가 모기약을 멀리하는 장면, 밝은 낮"
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
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
