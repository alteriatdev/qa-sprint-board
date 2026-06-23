// src/lib/sync.ts
import { sql } from "./db";
import { fetchEpicsMeta, fetchRetestPct, fetchEpicGraph, type EpicGraphSnapshot } from "./jira";

export async function syncActiveSprintEpics(): Promise<{ synced: number; errors: string[] }> {
  // Активный спринт
  const sprintRows = await sql`
    SELECT id FROM sprints WHERE is_active = true LIMIT 1
  ` as Array<{ id: number }>;
  if (sprintRows.length === 0) return { synced: 0, errors: [] };
  const sprintId = sprintRows[0].id;

  // Ключи активного спринта
  const rows = await sql`
    SELECT jira_key FROM sprint_epics WHERE sprint_id = ${sprintId}
  ` as Array<{ jira_key: string }>;

  const keys = rows.map((r) => r.jira_key);
  if (keys.length === 0) return { synced: 0, errors: [] };

  const errors: string[] = [];

  // Батч-запрос мета всех эпиков
  let metaMap: Map<string, Awaited<ReturnType<typeof fetchEpicsMeta>>[number]>;
  try {
    const metas = await fetchEpicsMeta(keys);
    metaMap = new Map(metas.map((m) => [m.key, m]));
  } catch (e) {
    errors.push(`fetchEpicsMeta failed: ${String(e)}`);
    return { synced: 0, errors };
  }

  // Параллельный подсчёт retest % для каждого эпика
  const retestResults = await Promise.allSettled(
    keys.map(async (key) => {
      const pct = await fetchRetestPct(key);
      return { key, pct };
    })
  );

  const retestMap = new Map<string, number>();
  for (const r of retestResults) {
    if (r.status === "fulfilled") {
      retestMap.set(r.value.key, r.value.pct);
    } else {
      errors.push(`retest fetch failed: ${String(r.reason)}`);
    }
  }

  // Параллельный сбор живого графа (дочерние + связанные) для каждого эпика
  const graphResults = await Promise.allSettled(
    keys.map(async (key) => ({ key, graph: await fetchEpicGraph(key) }))
  );

  const graphMap = new Map<string, EpicGraphSnapshot>();
  for (const r of graphResults) {
    if (r.status === "fulfilled") {
      graphMap.set(r.value.key, r.value.graph);
    } else {
      errors.push(`graph fetch failed: ${String(r.reason)}`);
    }
  }

  // Пишем в jira_cache
  let synced = 0;
  for (const key of keys) {
    const meta = metaMap.get(key);
    if (!meta) { errors.push(`meta not found for ${key}`); continue; }

    const graph = graphMap.get(key);
    const graphNodes = graph ? JSON.stringify(graph.nodes) : null;
    const graphLinked = graph ? JSON.stringify(graph.linked) : null;

    try {
      await sql`
        INSERT INTO jira_cache (jira_key, title, jira_status, assignee_name, assignee_id, priority, retest_pct, issue_type, graph_nodes, graph_linked, synced_at)
        VALUES (
          ${key}, ${meta.title}, ${meta.jiraStatus},
          ${meta.assigneeName}, ${meta.assigneeId}, ${meta.priority},
          ${retestMap.get(key) ?? 0}, ${meta.issueType},
          ${graphNodes}::jsonb, ${graphLinked}::jsonb, now()
        )
        ON CONFLICT (jira_key) DO UPDATE SET
          title         = EXCLUDED.title,
          jira_status   = EXCLUDED.jira_status,
          assignee_name = EXCLUDED.assignee_name,
          assignee_id   = EXCLUDED.assignee_id,
          priority      = EXCLUDED.priority,
          retest_pct    = EXCLUDED.retest_pct,
          issue_type    = EXCLUDED.issue_type,
          graph_nodes   = COALESCE(EXCLUDED.graph_nodes, jira_cache.graph_nodes),
          graph_linked  = COALESCE(EXCLUDED.graph_linked, jira_cache.graph_linked),
          synced_at     = now()
      `;
      synced++;
    } catch (e) {
      errors.push(`upsert failed ${key}: ${String(e)}`);
      continue;
    }
  }

  // Назначения из поля «QA» в Jira — источник правды. Резолвим accountId → member
  // и полностью перезаписываем назначения активного спринта.
  await syncAssignments(sprintId, keys, metaMap, errors);

  return { synced, errors };
}

// Перезапись назначений активного спринта из поля «QA» эпиков.
// Матчим по members.jira_account_id (имена в Jira не совпадают с бордой).
// Заметки (note) сохраняем для пар (member, epic), которые остаются.
async function syncAssignments(
  sprintId: number,
  keys: string[],
  metaMap: Map<string, Awaited<ReturnType<typeof fetchEpicsMeta>>[number]>,
  errors: string[],
): Promise<void> {
  const memberRows = await sql`
    SELECT id, jira_account_id FROM members WHERE jira_account_id IS NOT NULL
  ` as Array<{ id: string; jira_account_id: string }>;

  // Защита: если ни у кого нет accountId (миграция/бэкфилл не прокатились),
  // НЕ трогаем назначения — иначе обнулим борду.
  if (memberRows.length === 0) {
    errors.push("skip assignments sync: no members have jira_account_id");
    return;
  }
  const memberByAccount = new Map(memberRows.map((m) => [m.jira_account_id, m.id]));

  // Сохраняем существующие заметки по паре (member, epic).
  const existing = await sql`
    SELECT member_id, jira_key, note FROM assignments WHERE sprint_id = ${sprintId}
  ` as Array<{ member_id: string; jira_key: string; note: string | null }>;
  const noteByPair = new Map(existing.map((a) => [`${a.member_id}::${a.jira_key}`, a.note]));

  // Желаемый набор назначений из поля QA.
  const desired: Array<{ memberId: string; jiraKey: string; note: string | null }> = [];
  for (const key of keys) {
    const meta = metaMap.get(key);
    if (!meta) continue;
    for (const acc of meta.qaAccountIds) {
      const memberId = memberByAccount.get(acc);
      if (!memberId) {
        errors.push(`QA user ${acc} on ${key} not mapped to a member`);
        continue;
      }
      desired.push({ memberId, jiraKey: key, note: noteByPair.get(`${memberId}::${key}`) ?? null });
    }
  }

  // Полная замена в одной транзакции.
  try {
    await sql.transaction([
      sql`DELETE FROM assignments WHERE sprint_id = ${sprintId}`,
      ...desired.map((d) => sql`
        INSERT INTO assignments (sprint_id, member_id, jira_key, note)
        VALUES (${sprintId}, ${d.memberId}, ${d.jiraKey}, ${d.note})
        ON CONFLICT (sprint_id, member_id, jira_key) DO UPDATE SET note = EXCLUDED.note
      `),
    ]);
  } catch (e) {
    errors.push(`assignments rewrite failed: ${String(e)}`);
  }
}
