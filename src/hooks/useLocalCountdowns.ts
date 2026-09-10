import { useCallback, useEffect, useState } from 'react';

export interface CountdownSlot {
  id: string;
  label: string;
  provider: 'claude' | 'codex';
  resetAt: string; // local ISO from datetime-local
}

const KEY = 'ai-reset-tracker:countdowns';

function load(): CountdownSlot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CountdownSlot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useLocalCountdowns() {
  const [slots, setSlots] = useState<CountdownSlot[]>(() =>
    typeof window === 'undefined' ? [] : load(),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(slots));
  }, [slots]);

  const upsert = useCallback((slot: CountdownSlot) => {
    setSlots((prev) => {
      const i = prev.findIndex((s) => s.id === slot.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = slot;
        return next;
      }
      return [...prev, slot];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const remaining = useCallback(
    (resetAt: string) => {
      const t = new Date(resetAt).getTime();
      if (Number.isNaN(t)) return null;
      return t - now;
    },
    [now],
  );

  return { slots, upsert, remove, remaining, now };
}

export function formatRemaining(ms: number | null): string {
  if (ms == null) return 'Not set';
  if (ms <= 0) return 'Expired — check /usage again';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}
