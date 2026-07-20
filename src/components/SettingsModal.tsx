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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

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
          aria-label={visible ? "API 키 숨기기" : "API 키 보기"}
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
    geminiApiKey: "",
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
    setSettings({ youtubeApiKey: "", geminiApiKey: "" });
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
      const res = await apiFetch("/api/gemini/ping", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "키 테스트에 실패했습니다.");
      }
      setTestOk(true);
      setTestMessage(data.message || "연결 성공");
    } catch (err) {
      setTestOk(false);
      setTestMessage(err instanceof Error ? err.message : "키 테스트에 실패했습니다.");
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
      >
        <div className="modal-head">
          <h2 id="settings-title">설정</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          API 키는 이 브라우저에만 저장됩니다. Tier 1로 업그레이드했다면{" "}
          <strong>업그레이드 이후에 새로 만든</strong> Gemini 키를 넣어야 합니다.
        </p>

        <div className="notice-box" style={{ marginTop: "0.75rem" }}>
          쇼츠 프로젝트처럼 많이 쓰려면: Google Cloud Console → API 및 서비스 → 사용자
          인증 정보 → <strong>API 키 만들기</strong>(My First Project) → 여기 붙여넣기 →
          키 테스트
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

          <SecretField
            label="Gemini API 키 (업그레이드 후 새로 만든 키)"
            value={settings.geminiApiKey}
            onChange={(geminiApiKey) =>
              setSettings((prev) => ({ ...prev, geminiApiKey }))
            }
            placeholder="AIza... (Cloud Console에서 새로 발급)"
          />

          <div className="form-row" style={{ marginTop: "0.35rem" }}>
            <button type="submit" className="btn btn-primary">
              저장
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={testing || !settings.geminiApiKey.trim()}
            >
              {testing ? "테스트 중…" : "키 테스트"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleClear}>
              키 삭제
            </button>
          </div>

          {saved && (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              저장되었습니다. 키 테스트로 연결을 확인해 보세요.
            </p>
          )}

          {testMessage && (
            <div className={testOk ? "notice-box" : "error-box"} style={{ marginTop: "0.75rem" }}>
              {testMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
