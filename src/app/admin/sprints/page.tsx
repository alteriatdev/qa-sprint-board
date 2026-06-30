// src/app/admin/sprints/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { SprintStatsModal } from "@/components/SprintStatsModal";

interface Sprint {
  id: number; number: number; start: string; end: string;
  confluenceUrl: string | null; isActive: boolean;
}

interface EditState {
  start: string; end: string; confluenceUrl: string;
}

export default function AdminSprints() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [form, setForm] = useState({ number: "", start: "", end: "", confluenceUrl: "" });
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const [statsId, setStatsId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ start: "", end: "", confluenceUrl: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

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

  function startEdit(sprint: Sprint) {
    setEditingId(sprint.id);
    setEditState({
      start: sprint.start,
      end: sprint.end,
      confluenceUrl: sprint.confluenceUrl ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(sprintId: number) {
    setSaving(true);
    await fetch(`/api/sprint/${sprintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: editState.start || undefined,
        end: editState.end || undefined,
        confluenceUrl: editState.confluenceUrl || undefined,
      }),
    });
    setSaving(false);
    setEditingId(null);
    await loadSprints();
  }

  async function deleteSprint(sprint: Sprint) {
    const confirmed = window.confirm(
      `Удалить Спринт ${sprint.number}?\n\nВсе эпики и назначения этого спринта будут удалены безвозвратно.`
    );
    if (!confirmed) return;
    setDeleting(sprint.id);
    const res = await fetch(`/api/sprint/${sprint.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      alert(d.error ?? "Не удалось удалить спринт");
    }
    setDeleting(null);
    await loadSprints();
  }

  return (
    <div className="space-y-8">
      {statsId && <SprintStatsModal sprintId={statsId} onClose={() => setStatsId(null)} />}
      <h1 className="text-2xl font-bold">Спринты</h1>

      <div className="space-y-2">
        {sprints.length === 0 && (
          <p className="text-gray-500 text-sm">Спринтов пока нет.</p>
        )}
        {sprints.map((s) => (
          <div key={s.id} className="bg-gray-900 rounded-xl px-6 py-4 space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-indigo-400 font-bold min-w-[90px]">Спринт {s.number}</span>

              {editingId === s.id ? (
                /* ——— Режим редактирования ——— */
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <input
                    type="date"
                    value={editState.start}
                    onChange={(e) => setEditState((p) => ({ ...p, start: e.target.value }))}
                    className="bg-gray-800 text-white px-2 py-1 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-500 text-sm">—</span>
                  <input
                    type="date"
                    value={editState.end}
                    onChange={(e) => setEditState((p) => ({ ...p, end: e.target.value }))}
                    className="bg-gray-800 text-white px-2 py-1 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="url"
                    placeholder="Confluence URL"
                    value={editState.confluenceUrl}
                    onChange={(e) => setEditState((p) => ({ ...p, confluenceUrl: e.target.value }))}
                    className="bg-gray-800 text-white px-2 py-1 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                  />
                  <button
                    onClick={() => saveEdit(s.id)}
                    disabled={saving}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-slate-400 hover:text-white transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    Отмена
                  </button>
                </div>
              ) : (
                /* ——— Просмотр ——— */
                <>
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

                  <div className="ml-auto flex items-center gap-2">
                    {s.confluenceUrl && (
                      <a
                        href={s.confluenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-400 hover:underline"
                      >
                        Confluence →
                      </a>
                    )}
                    <button
                      onClick={() => setStatsId(s.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-white/10 text-gray-400 hover:border-indigo-500/50 hover:text-indigo-300 transition flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Статистика
                    </button>
                    <button
                      onClick={() => startEdit(s)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition"
                      title="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Изменить
                    </button>
                    {!s.isActive && (
                      <button
                        onClick={() => deleteSprint(s)}
                        disabled={deleting === s.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-rose-500/20 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 transition disabled:opacity-50"
                        title="Удалить спринт"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleting === s.id ? "Удаляем…" : "Удалить"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
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
