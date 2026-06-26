// src/lib/jira.ts
import type { GraphNode, LinkedNode } from "@/data/epicGraph";

const BASE = process.env.JIRA_BASE_URL!;
const TOKEN = process.env.JIRA_TOKEN!;

const HEADERS = {
  Authorization: `Basic ${TOKEN}`,
  "Content-Type": "application/json",
};

// Статусы Jira → наш enum. Ключи в нижнем регистре — лукап регистронезависимый
// (реальные имена в Jira приходят вперемешку: "analysis", "Merge to stage" и т.д.).
const STATUS_MAP: Record<string, string> = {
  "analysis":          "analysis",
  "backlog":           "backlog",
  "new":               "backlog",
  "in development":    "in_development",
  "merge to stage":    "in_development",
  "блок тесты":        "block_tests",
  "block tests":       "block_tests",
  "blocked":           "block_tests",
  "r.f. qa":           "rf_qa",
  "qa testing":        "qa_testing",
  "r.f release":       "rf_release",
  "rf release":        "rf_release",
  "готово к релизу":   "rf_release",
  "готово":            "done",
  "done":              "done",
};

function mapStatus(name: string): string {
  return STATUS_MAP[name.trim().toLowerCase()] ?? "backlog";
}

// Готовность для retest % считаем через тот же регистронезависимый mapStatus,
// иначе статусы в другом регистре/языке ("done", "готово", "R.F Release") тихо
// не засчитаются и retest занижается. Чистая функция — тестируется без сети.
export function isDoneStatus(name: string): boolean {
  return ["done", "rf_release"].includes(mapStatus(name));
}

export interface JiraEpicMeta {
  key: string;
  title: string;
  jiraStatus: string;
  assigneeName: string | null;
  assigneeId: string | null;
  priority: string;
  issueType: string;
  // accountId'ы из поля «QA» (тестеры, на кого назначен эпик). Поле кастомное и
  // РАЗНОЕ по проектам: SD → customfield_10721, BF → customfield_10722,
  // SPS → customfield_11193. Берём объединение всех трёх (мульти-юзер пикер).
  qaAccountIds: string[];
}

// Поля «QA» по проектам. Все три — мульти-юзер пикеры с одинаковым смыслом.
const QA_FIELDS = ["customfield_10721", "customfield_10722", "customfield_11193"] as const;

function extractQaAccountIds(fields: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const f of QA_FIELDS) {
    const v = fields[f];
    if (!Array.isArray(v)) continue;
    for (const u of v) {
      const acc = (u as { accountId?: unknown })?.accountId;
      if (typeof acc === "string") ids.add(acc);
    }
  }
  return [...ids];
}

// Тип задачи в Jara локализован: "Эпик" / "Задача". Эпиком считаем только
// собственно эпик (рус/англ); всё остальное (Задача/Task/Story/Bug/Подзадача)
// на доске рисуется как одиночная задача без шкал прогресса.
export function isEpicType(name: string | null | undefined): boolean {
  return ["эпик", "epic"].includes((name ?? "").trim().toLowerCase());
}

// ВАЖНО: используем новый эндпоинт /rest/api/3/search/jql (старый /search
// выпилен Atlassian) + обязательная пагинация через nextPageToken — иначе
// эпики с >100 тикетов (напр. BF-2209 = 161 дочка) считаются неверно.
async function searchIssues(jql: string, fields: string[]): Promise<unknown[]> {
  const all: unknown[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL(`${BASE}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("maxResults", "100");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Jira ${jql}: ${res.status} ${await res.text()}`);
    const data = await res.json() as { issues?: unknown[]; nextPageToken?: string };

    all.push(...(data.issues ?? []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return all;
}

// Получить мета по нескольким эпикам за один запрос
export async function fetchEpicsMeta(keys: string[]): Promise<JiraEpicMeta[]> {
  if (keys.length === 0) return [];
  const issues = await searchIssues(
    `key in (${keys.join(",")})`,
    ["summary", "status", "assignee", "priority", "issuetype", ...QA_FIELDS]
  ) as Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      assignee: { displayName: string; accountId: string } | null;
      priority: { name: string } | null;
      issuetype: { name: string } | null;
    } & Record<string, unknown>;
  }>;

  return issues.map((i) => ({
    key: i.key,
    title: i.fields.summary,
    jiraStatus: mapStatus(i.fields.status.name),
    assigneeName: i.fields.assignee?.displayName ?? null,
    assigneeId: i.fields.assignee?.accountId ?? null,
    // priority бывает null у части тикетов — безопасный доступ + дефолт.
    priority: i.fields.priority?.name?.toLowerCase() ?? "none",
    issueType: i.fields.issuetype?.name ?? "",
    qaAccountIds: extractQaAccountIds(i.fields),
  }));
}

// Тип узла графа: баг или задача (issuetype локализован — "Баг"/"Bug").
function graphType(issuetype: string | undefined): "bug" | "task" {
  const t = (issuetype ?? "").toLowerCase();
  return t.includes("баг") || t.includes("bug") ? "bug" : "task";
}

// Поле «Team» в Jira (атлассиановское Team-поле). Значение — объект
// { name/title }, изредка массив (мультиселект). Возвращаем имя(имена) строкой.
const TEAM_FIELD = "customfield_10001";

function extractTeam(fields: Record<string, unknown> | undefined): string | null {
  const v = fields?.[TEAM_FIELD];
  if (!v) return null;
  const nameOf = (x: unknown): string | null => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as { name?: unknown; title?: unknown; value?: unknown };
      const n = o.name ?? o.title ?? o.value;
      return typeof n === "string" ? n : null;
    }
    return null;
  };
  if (Array.isArray(v)) {
    const names = v.map(nameOf).filter((n): n is string => !!n);
    return names.length ? names.join(", ") : null;
  }
  return nameOf(v);
}

interface RawIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory?: { key: string } };
    issuetype?: { name: string };
  } & Record<string, unknown>;
}

export interface EpicGraphSnapshot { nodes: GraphNode[]; linked: LinkedNode[] }

// Живой снапшот графа эпика: дочерние (по полю parent) + связанные (issuelinks).
// Связанные берём прямо из поля issuelinks эпика — там есть статус, тип, summary
// и тип связи (relation) за один запрос, и список совпадает с панелью связей Jira.
export async function fetchEpicGraph(epicKey: string): Promise<EpicGraphSnapshot> {
  const [childIssues, epicRows] = (await Promise.all([
    searchIssues(`parent = "${epicKey}"`, ["summary", "status", "issuetype", TEAM_FIELD]),
    searchIssues(`key = "${epicKey}"`, ["issuelinks"]),
  ])) as [
    RawIssue[],
    Array<{
      fields: {
        issuelinks?: Array<{
          type: { name: string; inward: string; outward: string };
          inwardIssue?: RawIssue;
          outwardIssue?: RawIssue;
        }>;
      };
    }>,
  ];

  const nodes: GraphNode[] = childIssues.map((i) => ({
    key: i.key,
    title: i.fields.summary,
    type: graphType(i.fields.issuetype?.name),
    status: i.fields.status?.name ?? "",
    cat: i.fields.status?.statusCategory?.key ?? "new",
    team: extractTeam(i.fields),
  }));

  const childKeys = new Set(nodes.map((n) => n.key));
  const linkedMap = new Map<string, LinkedNode>();
  for (const link of epicRows[0]?.fields?.issuelinks ?? []) {
    const issue = link.outwardIssue ?? link.inwardIssue;
    if (!issue) continue;
    // не дублируем то, что уже дочернее, и одну задачу с несколькими связями
    if (childKeys.has(issue.key) || linkedMap.has(issue.key)) continue;
    const relation = link.outwardIssue ? link.type.outward : link.type.inward;
    linkedMap.set(issue.key, {
      key: issue.key,
      title: issue.fields.summary,
      type: graphType(issue.fields.issuetype?.name),
      status: issue.fields.status?.name ?? "",
      cat: issue.fields.status?.statusCategory?.key ?? "new",
      relation: relation || link.type.name,
    });
  }

  // Поле Team у связанных задач не приходит в issuelinks — дотягиваем одним
  // запросом по их ключам (нужно для разбивки багов фронт/бэк в шапке графа).
  const linkedKeys = [...linkedMap.keys()];
  if (linkedKeys.length > 0) {
    try {
      const teamRows = (await searchIssues(
        `key in (${linkedKeys.join(",")})`,
        [TEAM_FIELD],
      )) as Array<{ key: string; fields: Record<string, unknown> }>;
      for (const r of teamRows) {
        const node = linkedMap.get(r.key);
        if (node) node.team = extractTeam(r.fields);
      }
    } catch {
      // не критично: без team связанные баги просто не попадут в разбивку
    }
  }

  return { nodes, linked: [...linkedMap.values()] };
}

// Считаем retest %: (Done + RF Release) / (дочерние + связанные) * 100
export async function fetchRetestPct(epicKey: string): Promise<number> {
  const [children, linked] = await Promise.all([
    searchIssues(`parent = "${epicKey}"`, ["status"]),
    searchIssues(`issue in linkedIssues("${epicKey}")`, ["status"]),
  ]) as [
    Array<{ key: string; fields: { status: { name: string } } }>,
    Array<{ key: string; fields: { status: { name: string } } }>,
  ];

  // Тикет может быть и дочерним, и связанным одновременно — дедупим по key,
  // иначе он посчитается дважды и знаменатель поплывёт.
  const byKey = new Map<string, { key: string; fields: { status: { name: string } } }>();
  for (const i of [...children, ...linked]) byKey.set(i.key, i);
  const all = [...byKey.values()];
  if (all.length === 0) return 0;

  const done = all.filter((i) => isDoneStatus(i.fields.status.name)).length;
  return Math.round((done / all.length) * 100);
}
