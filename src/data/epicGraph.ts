// Снапшот связей эпиков для графа по клику на карточку.
//
// Данные лежат в epicGraph.json и собираются скриптом scripts/genGraph.mjs
// из сырых дампов Jira (parent = KEY). Бэка нет — ассистент снимает дочерние
// задачи через MCP и перегенерирует json вместе с утренними правками.
//
// Узлы: все дочерние задачи эпика (Задачи + Баги) со статусом. Цвет узла —
// по смыслу статуса (toneOfStatus). В графе это даёт плотную «карту» эпика.

import data from "./epicGraph.json";

export type GraphTone = "danger" | "warn" | "progress" | "ready" | "done" | "muted";

export interface GraphNode {
  key: string;
  title: string;
  type: "bug" | "task";
  status: string;
  cat: string; // statusCategory: new | indeterminate | done
}

// Связанная задача (issue link), а не дочерняя. relation — тип связи Jira
// (Relates / Parent-Child / Blocks…). Кросс-проектные «дети» приходят именно
// сюда, т.к. связаны линком, а не полем parent.
export interface LinkedNode extends GraphNode {
  relation: string;
}

export interface EpicGraphData {
  nodes: GraphNode[];
  linked?: LinkedNode[];
}

export const epicGraph = data as Record<string, EpicGraphData>;

// Цвета тонов (hex — для canvas force-graph).
// Разнесены по разным секторам цветового круга, чтобы соседние по воркфлоу
// статусы (в QA → release → готово) визуально НЕ сливались.
export const TONE_HEX: Record<GraphTone, string> = {
  danger: "#f43f5e", // rose-500 — reopen / блок (красный)
  warn: "#f59e0b", // amber-500 — новые / backlog (янтарь)
  progress: "#3b82f6", // blue-500 — в QA (синий)
  ready: "#a855f7", // purple-500 — release / merge (фиолетовый)
  done: "#22c55e", // green-500 — готово (зелёный)
  muted: "#94a3b8", // slate-400 — прочее
};

// Статус Jira → тон узла.
export function toneOfStatus(status: string, cat: string): GraphTone {
  const s = status.toLowerCase();
  if (cat === "done") return "done";
  if (s.includes("reopen") || s.includes("block") || s.includes("блок")) return "danger";
  if (s.includes("release") || s.includes("merge")) return "ready";
  if (s.includes("qa")) return "progress";
  if (cat === "new" || s.includes("backlog") || s.includes("to do") || s.includes("open"))
    return "warn";
  return "muted";
}
