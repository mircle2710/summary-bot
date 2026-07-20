"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CopyButton } from "@/components/CopyButton";
import { downloadDataUrl } from "@/lib/image-compose";
import {
  BLOG_FONT_OPTIONS,
  BLOG_TONE_OPTIONS,
  formatHashtagsForCopy,
  type BlogFontId,
  type BlogMeta,
  type BlogParagraph,
  type BlogToneId,
  type BlogTopic,
} from "@/lib/blog";

type BlogPanelProps = {
  title: string;
  summary: string;
  keyPoints: string[];
};

export function BlogPanel({ title, summary, keyPoints }: BlogPanelProps) {
  const [topics, setTopics] = useState<BlogTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [tone, setTone] = useState<BlogToneId>("friendly");
  const [font, setFont] = useState<BlogFontId>("sans");
  const [customPrompt, setCustomPrompt] = useState("");
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [articleTitle, setArticleTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [meta, setMeta] = useState<BlogMeta | null>(null);
  const [paragraphs, setParagraphs] = useState<BlogParagraph[]>([]);
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailGenerating, setThumbnailGenerating] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  const fontCss =
    BLOG_FONT_OPTIONS.find((f) => f.id === font)?.css || BLOG_FONT_OPTIONS[0].css;

  useEffect(() => {
    void loadTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, summary]);

  async function loadTopics(extraPrompt?: string) {
    setLoadingTopics(true);
    setError(null);
    try {
      const res = await apiFetch("/api/blog/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          keyPoints,
          customPrompt: extraPrompt?.trim() || customPrompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { topics?: BlogTopic[]; error?: string };
      if (!res.ok || !data.topics) {
        throw new Error(data.error || "블로그 주제 추천에 실패했습니다.");
      }
      setTopics(data.topics);
      setSelectedTopicId(data.topics[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoadingTopics(false);
    }
  }

  async function writeBlog() {
    if (!customPrompt.trim() && !selectedTopic) {
      setError("주제를 선택하거나 프롬프트를 작성해 주세요.");
      return;
    }
    setWriting(true);
    setError(null);
    setParagraphs([]);
    setMeta(null);
    setThumbnailUrl(null);
    try {
      const res = await apiFetch("/api/blog/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          keyPoints,
          topicTitle: selectedTopic?.title,
          topicAngle: selectedTopic?.angle,
          customPrompt: customPrompt.trim() || undefined,
          tone,
          font,
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        intro?: string;
        paragraphs?: Array<{
          id: string;
          heading?: string;
          text: string;
          imagePrompt: string;
        }>;
        thumbnailPrompt?: string;
        meta?: BlogMeta;
        error?: string;
      };
      if (!res.ok || !data.paragraphs?.length) {
        throw new Error(data.error || "블로그 작성에 실패했습니다.");
      }
      setArticleTitle(data.title || selectedTopic?.title || "블로그 글");
      setIntro(data.intro || "");
      setMeta(data.meta || null);
      setThumbnailPrompt(data.thumbnailPrompt || "");
      setParagraphs(
        data.paragraphs.map((p) => ({
          ...p,
          extraPrompt: "",
          imageDataUrl: null,
          generating: false,
          error: null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setWriting(false);
    }
  }

  async function generateParagraphImage(
    paragraphId: string,
    forceNew = false,
    paragraphOverride?: BlogParagraph,
  ) {
    const paragraph =
      paragraphOverride || paragraphs.find((p) => p.id === paragraphId);
    if (!paragraph) return;

    setParagraphs((prev) =>
      prev.map((p) =>
        p.id === paragraphId ? { ...p, generating: true, error: null } : p,
      ),
    );

    try {
      const res = await apiFetch("/api/blog/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "paragraph",
          text: paragraph.text,
          imagePrompt: paragraph.imagePrompt,
          extraPrompt: paragraph.extraPrompt,
          seed: forceNew ? Math.floor(Math.random() * 2_000_000_000) : undefined,
        }),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) {
        throw new Error(data.error || "단락 이미지 생성에 실패했습니다.");
      }
      setParagraphs((prev) =>
        prev.map((p) =>
          p.id === paragraphId
            ? { ...p, imageDataUrl: data.dataUrl!, generating: false, error: null }
            : p,
        ),
      );
    } catch (err) {
      setParagraphs((prev) =>
        prev.map((p) =>
          p.id === paragraphId
            ? {
                ...p,
                generating: false,
                error: err instanceof Error ? err.message : "이미지 생성 실패",
              }
            : p,
        ),
      );
    }
  }

  async function generateAllParagraphImages() {
    setGeneratingAll(true);
    const list = paragraphs;
    for (const p of list) {
      // eslint-disable-next-line no-await-in-loop
      await generateParagraphImage(p.id, true, p);
    }
    setGeneratingAll(false);
  }

  async function generateThumbnail(forceNew = false) {
    setThumbnailGenerating(true);
    setThumbnailError(null);
    try {
      const userPrompt = thumbnailPrompt.trim();
      const res = await apiFetch("/api/blog/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "thumbnail",
          text: articleTitle,
          imagePrompt: userPrompt || `Blog thumbnail for: ${articleTitle}`,
          extraPrompt: userPrompt || undefined,
          seed: forceNew ? Math.floor(Math.random() * 2_000_000_000) : undefined,
        }),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) {
        throw new Error(data.error || "썸네일 생성에 실패했습니다.");
      }
      setThumbnailUrl(data.dataUrl);
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : "썸네일 생성 실패");
    } finally {
      setThumbnailGenerating(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
        블로그 글 만들기
      </h3>
      <p className="muted" style={{ margin: "0 0 1rem" }}>
        숏츠와 별개로, 주제를 고르고 말투·글씨체·프롬프트를 반영해 블로그 단락과 이미지를
        만듭니다. 프롬프트가 있으면 최우선으로 적용됩니다.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="shorts-step">
        <h4>1. 블로그 주제</h4>
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
          {topics.length === 0 && !loadingTopics && (
            <p className="muted">추천 주제가 없습니다. 다시 추천을 눌러 주세요.</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: "0.75rem" }}
          onClick={() => void loadTopics()}
          disabled={loadingTopics}
        >
          {loadingTopics ? "주제 불러오는 중…" : "주제 다시 추천"}
        </button>
      </div>

      <div className="shorts-step">
        <h4>2. 말투 · 글씨체</h4>
        <div className="analysis-tabs">
          {BLOG_TONE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`btn btn-secondary${tone === opt.id ? " active" : ""}`}
              onClick={() => setTone(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="analysis-tabs" style={{ marginTop: "0.55rem" }}>
          {BLOG_FONT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`btn btn-secondary${font === opt.id ? " active" : ""}`}
              onClick={() => setFont(opt.id)}
              style={{ fontFamily: opt.css }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="shorts-step">
        <h4>3. 작성 프롬프트 (최우선)</h4>
        <label className="field">
          <span>원하는 방향·키워드·금지사항 등</span>
          <textarea
            className="input"
            rows={3}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="예: 초보 집사 기준으로 원인-대처-병원 방문 타이밍 순서로, 공포 조장 없이 작성"
          />
        </label>
      </div>

      <div className="form-row" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void writeBlog()}
          disabled={writing}
        >
          {writing ? "블로그 작성 중…" : "블로그 작성"}
        </button>
      </div>

      {paragraphs.length > 0 && (
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
            <h4 style={{ margin: 0 }}>4. 단락 · 이미지</h4>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void generateAllParagraphImages()}
              disabled={generatingAll || paragraphs.some((p) => p.generating)}
            >
              {generatingAll ? "단락 이미지 생성 중…" : "단락별 이미지 생성"}
            </button>
          </div>

          {meta && (
            <div className="blog-meta-box">
              <h4 style={{ margin: "0 0 0.65rem" }}>발행 · SEO 메타</h4>
              <div className="blog-meta-list">
                <div className="blog-meta-row">
                  <div className="blog-meta-label">
                    <span>슬러그</span>
                    <CopyButton text={meta.slug} label="복사" />
                  </div>
                  <code className="blog-meta-value">{meta.slug}</code>
                </div>
                <div className="blog-meta-row">
                  <div className="blog-meta-label">
                    <span>요약 (검색 / 카드노출)</span>
                    <CopyButton text={meta.cardSummary} label="복사" />
                  </div>
                  <p className="blog-meta-value">{meta.cardSummary}</p>
                </div>
                <div className="blog-meta-row">
                  <div className="blog-meta-label">
                    <span>해시태그</span>
                    <CopyButton
                      text={formatHashtagsForCopy(meta.hashtags)}
                      label="복사"
                    />
                  </div>
                  <p className="blog-meta-value">
                    {formatHashtagsForCopy(meta.hashtags) || "—"}
                  </p>
                </div>
                <div className="blog-meta-row">
                  <div className="blog-meta-label">
                    <span>SEO 제목 (검색 결과)</span>
                    <CopyButton text={meta.seoTitle} label="복사" />
                  </div>
                  <p className="blog-meta-value">{meta.seoTitle}</p>
                </div>
                <div className="blog-meta-row">
                  <div className="blog-meta-label">
                    <span>SEO 설명 (검색 스니펫)</span>
                    <CopyButton text={meta.seoDescription} label="복사" />
                  </div>
                  <p className="blog-meta-value">{meta.seoDescription}</p>
                </div>
              </div>
            </div>
          )}

          <article className="blog-article" style={{ fontFamily: fontCss }}>
            <h3 className="blog-article-title">{articleTitle}</h3>
            {intro && <p className="blog-intro">{intro}</p>}

            <div className="blog-paragraph-stack">
              {paragraphs.map((paragraph, index) => (
                <section key={paragraph.id} className="blog-paragraph-card">
                  <div className="blog-paragraph-head">
                    <strong>
                      단락 {index + 1}
                      {paragraph.heading ? ` · ${paragraph.heading}` : ""}
                    </strong>
                    <CopyButton text={paragraph.text} label="단락 복사" />
                  </div>
                  <div className="prose-block">{paragraph.text}</div>

                  <label className="field">
                    <span>이 단락 이미지 추가 지시</span>
                    <textarea
                      className="input"
                      rows={2}
                      value={paragraph.extraPrompt}
                      onChange={(e) =>
                        setParagraphs((prev) =>
                          prev.map((p) =>
                            p.id === paragraph.id
                              ? { ...p, extraPrompt: e.target.value }
                              : p,
                          ),
                        )
                      }
                      placeholder="예: 밝은 낮, 고양이가 편안하게 누워 있는 장면"
                    />
                  </label>

                  <div className="form-row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={paragraph.generating || generatingAll}
                      onClick={() => void generateParagraphImage(paragraph.id, true)}
                    >
                      {paragraph.generating
                        ? "생성 중…"
                        : paragraph.imageDataUrl
                          ? "새로고침 (다시 생성)"
                          : "이 단락 이미지 생성"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!paragraph.imageDataUrl}
                      onClick={() =>
                        paragraph.imageDataUrl &&
                        downloadDataUrl(
                          `blog-paragraph-${index + 1}.png`,
                          paragraph.imageDataUrl,
                        )
                      }
                    >
                      이미지 다운로드
                    </button>
                  </div>

                  {paragraph.error && <div className="error-box">{paragraph.error}</div>}
                  {paragraph.imageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="blog-image"
                      src={paragraph.imageDataUrl}
                      alt={`단락 ${index + 1} 이미지`}
                    />
                  )}
                </section>
              ))}
            </div>
          </article>

          <div className="blog-thumbnail-box">
            <h4 style={{ margin: "0 0 0.55rem" }}>5. 썸네일</h4>
            <label className="field">
              <span>썸네일 프롬프트 (사용자 반영)</span>
              <textarea
                className="input"
                rows={3}
                value={thumbnailPrompt}
                onChange={(e) => setThumbnailPrompt(e.target.value)}
                placeholder="예: 큰 제목 느낌 없이, 고양이 발과 연고 튜브가 보이는 따뜻한 썸네일"
              />
            </label>
            <div className="form-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={thumbnailGenerating}
                onClick={() => void generateThumbnail(true)}
              >
                {thumbnailGenerating
                  ? "썸네일 생성 중…"
                  : thumbnailUrl
                    ? "썸네일 새로고침"
                    : "썸네일 만들기"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!thumbnailUrl}
                onClick={() =>
                  thumbnailUrl && downloadDataUrl("blog-thumbnail.png", thumbnailUrl)
                }
              >
                썸네일 다운로드
              </button>
            </div>
            {thumbnailError && <div className="error-box">{thumbnailError}</div>}
            {thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="blog-thumb-image" src={thumbnailUrl} alt="블로그 썸네일" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
