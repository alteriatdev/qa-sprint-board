// src/components/SyncButton.tsx
// Кнопка ручного синка на борде (для всей команды, без админки).
// Визуальные состояния: покой / обновление (зелёный) / кулдаун (янтарный).
"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useBoardData } from "./BoardDataProvider";

export function SyncButton() {
  const { refetch } = useBoardData();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Сбрасываем ошибку при начале нового синка
  const clearError = useCallback(() => setError(null), []);

  async function onClick() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    clearError();
    try {
      const res = await fetch("/api/sync", { method: "POST" });

      if (res.status === 429) {
        const d = (await res.json().catch(() => ({}))) as { retryAfter?: number };
        setCooldown(d.retryAfter ?? 60);
        return;
      }
      if (!res.ok) {
        setError("Не удалось обновить");
        return;
      }

      const d = (await res.json()) as { errors?: unknown[] };
      await refetch();
      const errs = Array.isArray(d.errors) ? d.errors.length : 0;
      if (errs) setError(`Замечаний: ${errs}`);
      setCooldown(30);
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? "Обновление…"
    : cooldown > 0
      ? `Обновить (${cooldown})`
      : "Обновить из Jira";

  // Стили по состоянию
  const btnClass = busy
    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 cursor-not-allowed"
    : cooldown > 0
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300 cursor-not-allowed"
      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || cooldown > 0}
        title="Обновить данные из Jira"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition ${btnClass}`}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {label}
      </button>
      {error && <span className="whitespace-nowrap text-xs text-rose-400">{error}</span>}
    </span>
  );
}
