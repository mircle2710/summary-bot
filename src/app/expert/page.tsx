"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CopyButton } from "@/components/CopyButton";
import { ShortsFeedPanel } from "@/components/ShortsFeedPanel";
import { BlogPanel } from "@/components/BlogPanel";
import type { ExpertAnswerResult, ExpertReference } from "@/lib/expert";
import type { ShortsTopic } from "@/lib/shorts";

type ExpertResponse = ExpertAnswerResult & { error?: string };

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("이미지 형식을 확인하지 못했습니다.");
  return { mimeType: match[1], base64: match[2] };
}

export default function ExpertPage() {
  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExpertResponse | null>(null);

  const copyText = useMemo(() => {
    if (!result) return "";
    const lines = [result.answer.trim(), "", "핵심 포인트"];
    for (const point of result.keyPoints || []) lines.push(`- ${point}`);
    if (result.references?.length) {
      lines.push("", "참고 자료");
      for (const ref of result.references) {
        if (ref.url) lines.push(`- ${ref.title || ref.url}: ${ref.url}`);
      }
    }
    if (result.disclaimer) {
      lines.push("", result.disclaimer);
    }
    return lines.join("\n");
  }, [result]);

  function onPickFile(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("이미지를 업로드해 주세요.");
      return;
    }
    if (!question.trim()) {
      setError("질문을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await apiFetch("/api/expert/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          imageBase64: base64,
          mimeType,
        }),
      });
      const data = (await res.json()) as ExpertResponse;
      if (!res.ok) throw new Error(data.error || "전문 답변 생성에 실패했습니다.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="section-title">전문 답변</h1>
          <p className="section-desc">
            증상/상태 사진을 올리고 질문하면, 수의학 학술·학회·공신력 있는 자료를 참고해
            답변과 근거 URL을 정리합니다. 이후 영상 요약과 같은 방식으로 숏츠 피드를 만들 수
            있습니다.
          </p>
        </div>
      </div>

      <form className="panel" onSubmit={handleSubmit}>
        <label className="field">
          <span>이미지 업로드</span>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
          />
        </label>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="expert-preview" src={previewUrl} alt="업로드 미리보기" />
        )}

        <label className="field">
          <span>자세한 질문</span>
          <textarea
            className="input"
            rows={5}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 이 피부 상태가 무엇인지, 집에서 조심할 점과 병원에 가야 하는 기준을 학술·학회 근거와 함께 설명해 주세요."
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="loading-dot" />
              전문 답변 작성 중
            </>
          ) : (
            "전문 답변 받기"
          )}
        </button>

        {error && <div className="error-box">{error}</div>}
      </form>

      {result && (
        <div style={{ marginTop: "1.25rem" }}>
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
                {result.title}
              </h3>
              <CopyButton
                text={copyText}
                label="복사하기"
                className="btn btn-secondary"
              />
            </div>

            <div className="notice-box">{result.disclaimer}</div>
            <div className="prose-block">{result.answer}</div>

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

            {result.references?.length > 0 && (
              <>
                <h4 style={{ margin: "1.25rem 0 0.4rem" }}>참고 자료 (근거 URL)</h4>
                <ul className="ref-list">
                  {result.references
                    .filter((ref) => Boolean(ref.url?.trim()))
                    .map((ref: ExpertReference) => (
                      <li key={`${ref.title}-${ref.url}`}>
                        <a href={ref.url} target="_blank" rel="noreferrer">
                          {ref.title || ref.url}
                        </a>
                        <div className="ref-url">
                          <a href={ref.url} target="_blank" rel="noreferrer">
                            {ref.url}
                          </a>
                          <CopyButton text={ref.url} label="URL" />
                        </div>
                      </li>
                    ))}
                </ul>
              </>
            )}
            {result.references?.length === 0 && (
              <div className="notice-box" style={{ marginTop: "1rem" }}>
                이번 답변에는 확인 가능한 출처 URL을 붙이지 못했습니다. 질문을 조금 바꿔
                다시 받아 보시면 검색 근거가 붙을 수 있습니다.
              </div>
            )}
          </div>

          <ShortsFeedPanel
            key={`${result.title}-${result.answer.slice(0, 40)}`}
            title={result.title}
            summary={result.answer}
            keyPoints={result.keyPoints || []}
            initialTopics={(result.shortsTopics || []) as ShortsTopic[]}
          />

          <BlogPanel
            key={`blog-${result.title}-${result.answer.slice(0, 40)}`}
            title={result.title}
            summary={result.answer}
            keyPoints={result.keyPoints || []}
          />
        </div>
      )}
    </div>
  );
}
