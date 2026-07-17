import type { SavedChannel } from "./types";

const STORAGE_KEY = "summary-bot:channels";

export function loadSavedChannels(): SavedChannel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedChannel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChannels(channels: SavedChannel[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
}

export function addSavedChannel(channel: SavedChannel) {
  const existing = loadSavedChannels().filter((c) => c.id !== channel.id);
  const next = [channel, ...existing];
  saveChannels(next);
  return next;
}

export function removeSavedChannel(channelId: string) {
  const next = loadSavedChannels().filter((c) => c.id !== channelId);
  saveChannels(next);
  return next;
}
