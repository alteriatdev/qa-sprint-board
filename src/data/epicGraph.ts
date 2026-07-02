// Снапшот связей эпиков для графа по клику на карточку.
//
// Данные лежат в epicGraph.json и собираются скриптом scripts/genGraph.mjs
// из сырых дампов Jira (parent = KEY). Бэка нет — ассистент снимает дочерние
// задачи через MCP и перегенерирует json вместе с утренними правками.
//
// Узлы: все дочерние задачи эпика (Задачи + Баги) со статусом. Цвет узла —
// по смыслу статуса (toneOfStatus). В графе это даёт плотную «карту» эпика.

import data from "./epicGraph.json";

// Тон узла = смысл статуса Jira. Разведены по жизненному циклу тикета, чтобы
// близкие по воркфлоу статусы (R.F. QA vs QA testing, блок девов vs блок тестов,
// release vs merge) НЕ сливались в один цвет.
export type GraphTone =
  | "backlog" // analysis / Backlog / New — не начато
  | "dev" // In development — дев пишет код
  | "merge" // Merge to stage — код готов к заливке на стейдж
  | "blocked" // Blocked — блок девов
  | "reopen" // Reopen — протестирован, ушёл на доработку
  | "blockTest" // Блок тесты — блок именно тестирования
  | "readyQa" // R.F. QA — готово к тестам
  | "testing" // QA testing — в тестировании
  | "release" // R.F Release / Готово к релизу — тесты на стейдже пройдены
  | "done"; // Готово — жизненный цикл закончен

export interface GraphNode {
  key: string;
  title: string;
  type: "bug" | "task";
  status: string;
  cat: string; // statusCategory: new | indeterminate | done
  team?: string | null; // значение поля «Team» в Jira (customfield_10001): "Front Team" / "GO Team"…
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

// Цвета тонов (hex — для canvas force-graph). Подобраны максимально контрастно
// на тёмном фоне, по разным секторам цветового круга.
export const TONE_HEX: Record<GraphTone, string> = {
  backlog: "#64748b", // slate-500 — не начато (серый)
  dev: "#facc15", // yellow-400 — в разработке (чистый жёлтый)
  merge: "#84cc16", // lime-500 — merge to stage (жёлто-зелёный)
  blocked: "#dc2626", // red-600 — блок девов (насыщенный красный)
  reopen: "#ec4899", // pink-500 — доработка (розовый)
  blockTest: "#f97316", // orange-500 — блок тестов (насыщенный оранж)
  readyQa: "#22d3ee", // cyan-400 — готово к тестам (бирюза)
  testing: "#3b82f6", // blue-500 — в тестировании (синий)
  release: "#a855f7", // purple-500 — тесты на стейдже пройдены (фиолетовый)
  done: "#22c55e", // green-500 — готово (зелёный)
};

// Классификация команды (поле Team) для разбивки багов в шапке графа.
//  - Фронт  — "Front Team";
//  - Бэк    — "GO Team" + "PHP Team" (оба бэкенд);
//  - DevOps — "DevOps".
// Прочие команды (Design / Product) в разбивку не попадают.
export function isFrontTeam(team: string | null | undefined): boolean {
  return (team ?? "").toLowerCase().includes("front");
}

export function isBackTeam(team: string | null | undefined): boolean {
  const t = (team ?? "").toLowerCase();
  return t.includes("go") || t.includes("php");
}

export function isDevOpsTeam(team: string | null | undefined): boolean {
  const t = (team ?? "").toLowerCase();
  return t.includes("devops") || t.includes("dev ops");
}

// Статус Jira → тон узла. Порядок проверок важен: специфичные статусы раньше
// общих, чтобы R.F. QA не утёк в «testing», а «Готово к релизу» — в «done».
export function toneOfStatus(status: string, cat: string): GraphTone {
  const s = status.toLowerCase().trim();

  if (s.includes("reopen") || s.includes("реопен")) return "reopen"; // доработка (LC отдаёт кириллицей)
  if (s.includes("merge")) return "merge"; // Merge to stage — код готов к заливке
  if (s.includes("блок тест") || s.includes("block test")) return "blockTest"; // блок тестирования
  if (s.includes("blocked")) return "blocked"; // блок девов
  if (s.includes("release") || s.includes("релиз")) return "release"; // R.F Release / Готово к релизу
  if (s.includes("testing")) return "testing"; // QA testing — в тестировании
  if (s.includes("qa")) return "readyQa"; // R.F. QA — готово к тестам
  if (s.includes("develop") || s.includes("разработ")) return "dev"; // In development
  if (cat === "done" || s.includes("готов")) return "done"; // Готово
  return "backlog"; // analysis / Backlog / New / прочее
}
