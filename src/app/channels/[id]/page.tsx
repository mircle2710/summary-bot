"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatCount } from "@/lib/format";
import type { ChannelDetails, ChannelVideo, YearlyCount } from "@/lib/types";

type DetailResponse = {
  channel: ChannelDetails;
  videos: ChannelVideo[];
  yearly: YearlyCount[];
  allVideoCount?: number;
  error?: string;
};

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const channelId = params.id;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/youtube/channel-detail?id=${channelId}`);
        const json = (await res.json()) as DetailResponse;
        if (!res.ok) throw new Error(json.error || "채널 정보를 불러오지 못했습니다.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const maxYearCount = useMemo(() => {
    if (!data?.yearly?.length) return 1;
    return Math.max(...data.yearly.map((y) => y.count), 1);
  }, [data]);

  if (loading) {
    return (
      <div className="panel">
        <span className="loading-dot" />
        채널 정보를 불러오는 중…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/channels" className="muted">
          ← 채널 목록
        </Link>
        <div className="error-box" style={{ marginTop: "1rem" }}>
          {error || "데이터가 없습니다."}
        </div>
      </div>
    );
  }

  const { channel, videos, yearly, allVideoCount } = data;

  return (
    <div>
      <Link href="/channels" className="muted">
        ← 채널 목록
      </Link>

      <div className="section-head" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={channel.thumbnailUrl}
            alt=""
            style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover" }}
          />
          <div>
            <h1 className="section-title">{channel.title}</h1>
            <p className="section-desc" style={{ marginTop: 0 }}>
              {channel.customUrl || channel.id}
              {channel.country ? ` · ${channel.country}` : ""}
              {" · "}개설 {new Date(channel.publishedAt).toLocaleDateString("ko-KR")}
            </p>
          </div>
        </div>
        <a
          className="btn btn-secondary"
          href={`https://www.youtube.com/channel/${channel.id}`}
          target="_blank"
          rel="noreferrer"
        >
          유튜브에서 보기
        </a>
      </div>

      <div className="stats" style={{ marginBottom: "1.25rem" }}>
        <div className="stat">
          <span>구독자</span>
          <strong>{formatCount(channel.subscriberCount)}</strong>
        </div>
        <div className="stat">
          <span>총 조회수</span>
          <strong>{formatCount(channel.viewCount)}</strong>
        </div>
        <div className="stat">
          <span>영상 수</span>
          <strong>{formatCount(channel.videoCount)}</strong>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.6rem", fontFamily: "var(--font-display)" }}>채널 소개</h2>
        <p className="prose-block muted" style={{ margin: 0 }}>
          {channel.description || "소개글이 없습니다."}
        </p>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
          연도별 업로드
        </h2>
        <p className="muted" style={{ margin: "0 0 1rem" }}>
          최근 수집한 영상 {allVideoCount ?? videos.length}개 기준
        </p>
        {yearly.length === 0 ? (
          <p className="muted">연도별 데이터가 없습니다.</p>
        ) : (
          <div className="year-bars">
            {yearly.map((row) => (
              <div key={row.year} className="year-row">
                <span>{row.year}</span>
                <div className="year-bar-track">
                  <div
                    className="year-bar-fill"
                    style={{ width: `${(row.count / maxYearCount) * 100}%` }}
                  />
                </div>
                <strong style={{ textAlign: "right" }}>{row.count}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2 style={{ margin: "0 0 0.85rem", fontFamily: "var(--font-display)" }}>
          최신 동영상
        </h2>
        {videos.length === 0 ? (
          <p className="muted">영상이 없습니다.</p>
        ) : (
          <div className="video-list">
            {videos.map((video) => (
              <a
                key={video.id}
                className="video-item"
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={video.thumbnailUrl} alt="" />
                <div>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                    {video.title}
                  </strong>
                  <span className="muted">
                    {new Date(video.publishedAt).toLocaleDateString("ko-KR")}
                  </span>
                  <p
                    className="muted"
                    style={{
                      margin: "0.4rem 0 0",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {video.description || "설명 없음"}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
