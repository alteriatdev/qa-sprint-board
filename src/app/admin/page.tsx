// src/app/admin/page.tsx
"use client";
import { useEffect, useState } from "react";

interface SyncStatus { synced: number; errors: string[]; syncedAt: string | null }
interface DbStats { usedBytes: number; limitBytes: number }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [db, setDb] = useState<DbStats | null>(null);

  useEffect(() => {
    fetch("/api/sprint/active")
      .then((r) => r.json())
      .then((d) => setStatus({ synced: 0, errors: [], syncedAt: d.syncedAt }));
    fetch("/api/admin/db-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDb(d))
      .catch(() => {});
  }, []);

  const dbPct = db ? Math.min(100, (db.usedBytes / db.limitBytes) * 100) : 0;

  async function handleSync() {
    setSyncing(true);
    const res = await fetch("/api/jira/sync", { method: "POST" });
    const data = await res.json() as SyncStatus;
    setStatus({ ...data, syncedAt: new Date().toISOString() });
    setSyncing(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дашборд</h1>
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Последний синк Jira</p>
            <p className="text-white">
              {status?.syncedAt
                ? new Date(status.syncedAt).toLocaleString("ru-RU")
                : "Никогда"}
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium"
          >
            {syncing ? "Синкаем..." : "Синк Jira"}
          </button>
        </div>
        {status?.errors?.length ? (
          <div className="text-red-400 text-sm space-y-1">
            {status.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        ) : null}
        {status?.synced ? (
          <p className="text-green-400 text-sm">Обновлено эпиков: {status.synced}</p>
        ) : null}
      </div>

      <div className="bg-gray-900 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">Хранилище БД</p>
          <p className="text-white text-sm">
            {db
              ? `${formatBytes(db.usedBytes)} из ${formatBytes(db.limitBytes)}`
              : "—"}
          </p>
        </div>
        <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              dbPct > 90 ? "bg-red-500" : dbPct > 70 ? "bg-amber-500" : "bg-indigo-500"
            }`}
            style={{ width: `${dbPct}%` }}
          />
        </div>
        {db && (
          <p className="text-gray-600 text-xs">Занято {dbPct.toFixed(1)}%</p>
        )}
      </div>
    </div>
  );
}
