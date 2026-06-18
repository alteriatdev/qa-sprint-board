"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bug, X } from "lucide-react";
import type { Epic } from "@/data/sprint";
import { epicGraph, toneOfStatus, TONE_HEX } from "@/data/epicGraph";
import { statusMeta } from "@/lib/format";

const JIRA_BROWSE = "https://sprutgaming.atlassian.net/browse";
const EPIC_HEX = "#e2e8f0"; // slate-100 — хаб, отдельный от голубого «В QA»

// react-force-graph тянет canvas/window — только на клиенте.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as React.ComponentType<Record<string, unknown>>;

const LINK_HEX = "#c084fc"; // violet-400 — связанные (issue links)

interface GNode {
  id: string;
  label: string;
  color: string;
  isEpic?: boolean;
  linked?: boolean;
  relation?: string;
  type?: "bug" | "task";
  status?: string;
  href: string;
  x?: number;
  y?: number;
}

export function EpicGraphModal({
  epic,
  open,
  onClose,
}: {
  epic: Epic;
  open: boolean;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ zoomToFit: (ms?: number, px?: number) => void } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [open]);

  const snapshot = epicGraph[epic.key];

  const graphData = useMemo(() => {
    const epicNode: GNode = {
      id: epic.key,
      label: epic.key,
      color: EPIC_HEX,
      isEpic: true,
      href: epic.links.jira,
    };
    const childNodes: GNode[] = (snapshot?.nodes ?? []).map((n) => ({
      id: n.key,
      label: `${n.key} · ${n.title}`,
      color: TONE_HEX[toneOfStatus(n.status, n.cat)],
      type: n.type,
      status: n.status,
      href: `${JIRA_BROWSE}/${n.key}`,
    }));
    const linkedNodes: GNode[] = (snapshot?.linked ?? []).map((n) => ({
      id: n.key,
      label: `${n.key} · ${n.title}`,
      color: TONE_HEX[toneOfStatus(n.status, n.cat)],
      type: n.type,
      status: n.status,
      linked: true,
      relation: n.relation,
      href: `${JIRA_BROWSE}/${n.key}`,
    }));
    return {
      nodes: [epicNode, ...childNodes, ...linkedNodes],
      links: [
        ...childNodes.map((c) => ({ source: epic.key, target: c.id, linked: false })),
        ...linkedNodes.map((c) => ({ source: epic.key, target: c.id, linked: true })),
      ],
    };
  }, [epic, snapshot]);

  if (!open) return null;

  const total = snapshot?.nodes.length ?? 0;
  const bugs = snapshot?.nodes.filter((n) => n.type === "bug").length ?? 0;
  const linkedCount = snapshot?.linked?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1c] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={epic.links.jira}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs font-semibold text-sky-300 hover:underline"
              >
                {epic.key}
              </a>
              <span className="text-[11px] text-slate-400">{statusMeta[epic.jiraStatus].label}</span>
              {total > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  · {total} задач
                  <span className="flex items-center gap-0.5 text-rose-300">
                    <Bug className="h-3 w-3" /> {bugs}
                  </span>
                </span>
              )}
              {linkedCount > 0 && (
                <span className="text-[11px]" style={{ color: LINK_HEX }}>
                  · {linkedCount} связанных
                </span>
              )}
            </div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-100">{epic.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={wrapRef} className="relative min-h-0 flex-1">
          {total + linkedCount > 0 ? (
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              backgroundColor="#0a0f1c"
              warmupTicks={80}
              cooldownTicks={60}
              d3VelocityDecay={0.4}
              onEngineStop={() => fgRef.current?.zoomToFit(500, 48)}
              nodeLabel={(node: unknown) => {
                const n = node as GNode;
                if (n.isEpic) return n.label;
                if (n.linked) return `${n.label} — ${n.status} · связь: ${n.relation}`;
                return `${n.label} — ${n.status}`;
              }}
              linkColor={(link: unknown) =>
                (link as { linked?: boolean }).linked
                  ? "rgba(192,132,252,0.45)"
                  : "rgba(148,163,184,0.16)"
              }
              linkWidth={(link: unknown) => ((link as { linked?: boolean }).linked ? 1.2 : 0.7)}
              linkLineDash={(link: unknown) =>
                (link as { linked?: boolean }).linked ? [4, 3] : []
              }
              onNodeClick={(node: unknown) => {
                const n = node as GNode;
                window.open(n.href, "_blank", "noreferrer");
              }}
              nodeCanvasObjectMode={() => "replace"}
              nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D, scale: number) => {
                const n = node as GNode & { x: number; y: number };
                const r = n.isEpic ? 7 : n.type === "bug" ? 3.6 : 2.8;
                // Дешёвое «гало» без shadowBlur (blur убивал FPS на 165 нодах).
                ctx.globalAlpha = 0.22;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r * 1.4, 0, 2 * Math.PI);
                ctx.fillStyle = n.color;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = n.color;
                ctx.fill();
                if (n.linked) {
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, r + 1.8, 0, 2 * Math.PI);
                  ctx.strokeStyle = LINK_HEX;
                  ctx.lineWidth = 1.2;
                  ctx.stroke();
                }
                if (n.isEpic) {
                  const fs = 12 / scale;
                  ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillStyle = "#e2e8f0";
                  ctx.fillText(n.id, n.x, n.y - r - fs * 0.8);
                }
              }}
              nodePointerAreaPaint={(
                node: unknown,
                color: string,
                ctx: CanvasRenderingContext2D,
              ) => {
                const n = node as GNode & { x: number; y: number };
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.isEpic ? 9 : 6, 0, 2 * Math.PI);
                ctx.fill();
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
              Снапшот задач для этого эпика ещё не собран.
              <br />
              Появится при следующем обновлении данных.
            </div>
          )}

          <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-600">
            колесо — зум · тащи узел · клик — открыть в Jira
          </p>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 px-4 py-2.5 text-[11px] text-slate-400">
          <Legend color={EPIC_HEX} label="Эпик" />
          <Legend color={TONE_HEX.danger} label="Reopen / блок" />
          <Legend color={TONE_HEX.warn} label="Новые / backlog" />
          <Legend color={TONE_HEX.progress} label="В QA" />
          <Legend color={TONE_HEX.ready} label="Release / merge" />
          <Legend color={TONE_HEX.done} label="Готово" />
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: LINK_HEX }}
            />
            связанные (линк)
          </span>
        </footer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
