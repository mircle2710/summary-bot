"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  clearApiSettings,
  loadApiSettings,
  saveApiSettings,
  type ApiSettings,
} from "@/lib/settings";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  if (multiline) {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea
          className="input"
          rows={6}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.82rem",
            resize: "vertical",
            width: "100%",
          }}
        />
      </label>
    );
  }

  return (
    <label className="field">
      <span>{label}</span>
      <div className="secret-input-row">
        <input
          className="input"
          type={visible ? "text" : "password"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="btn btn-ghost secret-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "숨기기" : "보기"}
        >
          {visible ? "숨기기" : "보기"}
        </button>
      </div>
    </label>
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<ApiSettings>({
    youtubeApiKey: "",
    vertexProjectId: "",
    vertexLocation: "us-central1",
    vertexServiceAccountJson: "",
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettings(loadApiSettings());
    setSaved(false);
    setTestMessage(null);
    setTestOk(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveApiSettings(settings);
    setSaved(true);
    setTestMessage(null);
    setTestOk(null);
  }

  function handleClear() {
    clearApiSettings();
    setSettings({
      youtubeApiKey: "",
      vertexProjectId: "",
      vertexLocation: "us-central1",
      vertexServiceAccountJson: "",
    });
    setSaved(false);
    setTestMessage(null);
    setTestOk(null);
  }

  async function handleTest() {
    saveApiSettings(settings);
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const res = await apiFetch("/api/vertex/ping", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Vertex 연결 테스트에 실패했습니다.");
      }
      setTestOk(true);
      setTestMessage(data.message || "연결 성공");
    } catch (err) {
      setTestOk(false);
      setTestMessage(err instanceof Error ? err.message : "테스트에 실패했습니다.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)" }}
      >
        <div className="modal-head">
          <h2 id="settings-title">설정</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          요약은 <strong>Vertex AI</strong>로 실행되어 Google Cloud 체험 크레딧(~46만 원)을
          사용할 수 있습니다. AI Studio Gemini 선불 키는 더 이상 쓰지 않습니다.
        </p>

        <div className="notice-box" style={{ marginTop: "0.75rem" }}>
          1) Cloud Console에서 <strong>Vertex AI API</strong> 사용 설정
          <br />
          2) 서비스 계정 생성 → 역할 <strong>Vertex AI User</strong>
          <br />
          3) 키(JSON) 만들기 → 아래 칸에 전체 붙여넣기
          <br />
          4) 프로젝트 ID는 My First Project ID 입력 후 <strong>키 테스트</strong>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          <SecretField
            label="YouTube Data API 키"
            value={settings.youtubeApiKey}
            onChange={(youtubeApiKey) =>
              setSettings((prev) => ({ ...prev, youtubeApiKey }))
            }
            placeholder="AIza..."
          />

          <label className="field">
            <span>Vertex 프로젝트 ID</span>
            <input
              className="input"
              value={settings.vertexProjectId}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, vertexProjectId: e.target.value }))
              }
              placeholder="예: project-a0cb46ec-3925-43ad-958"
              required
            />
          </label>

          <label className="field">
            <span>Vertex 리전</span>
            <input
              className="input"
              value={settings.vertexLocation}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, vertexLocation: e.target.value }))
              }
              placeholder="us-central1"
            />
          </label>

          <SecretField
            label="서비스 계정 JSON 키"
            value={settings.vertexServiceAccountJson}
            onChange={(vertexServiceAccountJson) =>
              setSettings((prev) => ({ ...prev, vertexServiceAccountJson }))
            }
            placeholder='{"type":"service_account","project_id":"..."}'
            multiline
          />

          <div className="form-row" style={{ marginTop: "0.35rem" }}>
            <button type="submit" className="btn btn-primary">
              저장
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={
                testing ||
                !settings.vertexProjectId.trim() ||
                !settings.vertexServiceAccountJson.trim()
              }
            >
              {testing ? "테스트 중…" : "키 테스트"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleClear}>
              키 삭제
            </button>
          </div>

          {saved && (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              저장되었습니다. 키 테스트로 Vertex 연결을 확인해 보세요.
            </p>
          )}

          {testMessage && (
            <div
              className={testOk ? "notice-box" : "error-box"}
              style={{ marginTop: "0.75rem" }}
            >
              {testMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
