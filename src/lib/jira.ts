// src/lib/jira.ts
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
    ["summary", "status", "assignee", "priority", "issuetype"]
  ) as Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      assignee: { displayName: string; accountId: string } | null;
      priority: { name: string } | null;
      issuetype: { name: string } | null;
    };
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
  }));
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
