"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  addSavedChannel,
  loadSavedChannels,
  removeSavedChannel,
} from "@/lib/storage";
import type { ChannelDetails, SavedChannel } from "@/lib/types";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<SavedChannel[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChannels(loadSavedChannels());
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/youtube/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { channel?: ChannelDetails; error?: string };
      if (!res.ok || !data.channel) {
        throw new Error(data.error || "채널을 추가하지 못했습니다.");
      }

      const saved: SavedChannel = {
        id: data.channel.id,
        title: data.channel.title,
        handle: data.channel.customUrl,
        thumbnailUrl: data.channel.thumbnailUrl,
        addedAt: new Date().toISOString(),
      };
      setChannels(addSavedChannel(saved));
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleRemove(id: string) {
    setChannels(removeSavedChannel(id));
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="section-title">채널 관리</h1>
          <p className="section-desc">
            채널 URL, @핸들, 또는 채널 ID를 추가하면 구독자·영상 수·소개·연도별
            업로드·최신 영상을 확인할 수 있습니다.
          </p>
        </div>
      </div>

      <form className="panel" onSubmit={handleAdd}>
        <div className="form-row">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: https://www.youtube.com/@채널명 또는 @채널명"
            required
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-dot" />
                불러오는 중
              </>
            ) : (
              "채널 추가"
            )}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </form>

      <div style={{ height: "1.25rem" }} />

      {channels.length === 0 ? (
        <div className="panel empty">아직 추가된 채널이 없습니다.</div>
      ) : (
        <div className="grid-channels">
          {channels.map((channel) => (
            <article key={channel.id} className="channel-card">
              <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={channel.thumbnailUrl} alt="" />
                <div>
                  <h3>{channel.title}</h3>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {channel.handle || channel.id}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Link
                  href={`/channels/${channel.id}`}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  상세 보기
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleRemove(channel.id)}
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
