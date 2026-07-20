"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    setSettings(loadApiSettings());
    setSaved(false);
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
  }

  function handleClear() {
    clearApiSettings();
    setSettings({ youtubeApiKey: "", geminiApiKey: "" });
    setSaved(false);
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
          API 키는 이 브라우저에만 저장되며, 요청 시 서버로 전달되어 기능을
          실행합니다. 서버에 영구 저장되지 않습니다.
        </p>

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
            label="Gemini API 키"
            value={settings.geminiApiKey}
            onChange={(geminiApiKey) =>
              setSettings((prev) => ({ ...prev, geminiApiKey }))
            }
            placeholder="AIza... 또는 Google AI Studio 키"
          />

          <div className="form-row" style={{ marginTop: "0.35rem" }}>
            <button type="submit" className="btn btn-primary">
              저장
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClear}>
              키 삭제
            </button>
          </div>

          {saved && (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              저장되었습니다. 이제 채널 조회와 요약을 사용할 수 있습니다.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
