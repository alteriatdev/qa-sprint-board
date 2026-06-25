// src/app/admin/sprints/page.tsx
"use client";
import { useEffect, useState } from "react";

interface Sprint {
  id: number; number: number; start: string; end: string;
  confluenceUrl: string | null; isActive: boolean;
}

export default function AdminSprints() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [form, setForm] = useState({ number: "", start: "", end: "", confluenceUrl: "" });
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);

  async function loadSprints() {
    const res = await fetch("/api/sprint");
    const d = await res.json() as Sprint[];
    setSprints(d);
  }

  useEffect(() => { loadSprints(); }, []);

  async function createSprint(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    await fetch("/api/sprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: Number(form.number),
        start: form.start,
        end: form.end,
        confluenceUrl: form.confluenceUrl || undefined,
      }),
    });
    setCreating(false);
    setForm({ number: "", start: "", end: "", confluenceUrl: "" });
    await loadSprints();
  }

  async function activateSprint(sprint: Sprint) {
    const confirmed = window.confirm(
      `Сделать Спринт ${sprint.number} активным?\n\nБорд переключится на этот спринт. Данные других спринтов останутся в базе.`
    );
    if (!confirmed) return;

    setActivating(sprint.id);
    await fetch(`/api/sprint/${sprint.id}/activate`, { method: "POST" });
    setActivating(null);
    await loadSprints();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Спринты</h1>

      <div className="space-y-2">
        {sprints.length === 0 && (
          <p className="text-gray-500 text-sm">Спринтов пока нет.</p>
        )}
        {sprints.map((s) => (
          <div key={s.id} className="bg-gray-900 rounded-xl px-6 py-4 flex items-center gap-4">
            <span className="text-indigo-400 font-bold min-w-[90px]">Спринт {s.number}</span>
            <span className="text-gray-400 text-sm">{s.start} — {s.end}</span>
            {s.isActive ? (
              <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded-full">
                Активный
              </span>
            ) : (
              <button
                onClick={() => activateSprint(s)}
                disabled={activating === s.id}
                className="text-xs px-3 py-1 rounded-lg border border-white/10 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition disabled:opacity-50"
              >
                {activating === s.id ? "Активируем..." : "Активировать"}
              </button>
            )}
            {s.confluenceUrl && (
              <a
                href={s.confluenceUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-sky-400 hover:underline"
              >
                Confluence →
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl p-6 space-y-4 max-w-md">
        <h2 className="font-bold">Создать новый спринт</h2>
        <p className="text-xs text-gray-500">
          Новый спринт создаётся неактивным — переключение на него через кнопку «Активировать».
        </p>
        <form onSubmit={createSprint} className="space-y-3">
          <input
            type="number"
            placeholder="Номер спринта"
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            placeholder="Начало"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            placeholder="Конец"
            value={form.end}
            onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="url"
            placeholder="Confluence URL (необязательно)"
            value={form.confluenceUrl}
            onChange={(e) => setForm((f) => ({ ...f, confluenceUrl: e.target.value }))}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg font-medium"
          >
            {creating ? "Создаём..." : "Создать спринт"}
          </button>
        </form>
      </div>
    </div>
  );
}
