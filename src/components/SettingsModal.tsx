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
          <label className="field">
            <span>YouTube Data API 키</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={settings.youtubeApiKey}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, youtubeApiKey: e.target.value }))
              }
              placeholder="AIza..."
            />
          </label>

          <label className="field">
            <span>Gemini API 키</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={settings.geminiApiKey}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, geminiApiKey: e.target.value }))
              }
              placeholder="AIza... 또는 Google AI Studio 키"
            />
          </label>

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
