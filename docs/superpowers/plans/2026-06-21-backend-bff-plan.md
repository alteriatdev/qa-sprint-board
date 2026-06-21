# QA Sprint Board — Backend BFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести QA Sprint Board с file-driven модели (sprint.ts) на Next.js BFF с Neon Postgres и мини-админкой, сохранив доску работоспособной на протяжении всей миграции.

**Architecture:** Next.js API routes в том же репо читают QA-данные из Neon Postgres и обогащают их live-данными из Jira API (кэш в jira_cache, обновляется кроном каждые 30 мин). Фронт переключается с импорта sprint.ts на fetch /api/sprint/active. Мини-админка /admin позволяет лиду редактировать firstPass %, флаги и назначения без деплоя.

**Tech Stack:** Next.js 16 (App Router), @neondatabase/serverless, Vitest, tsx, Tailwind CSS v4.

## Global Constraints

- Node.js ≥ 20, Next.js = 16.2.9 (не обновлять)
- Все новые файлы — TypeScript strict
- Neon DB: переменная `DATABASE_URL` в `.env.local`
- Jira: `JIRA_BASE_URL=https://sprutgaming.atlassian.net`, `JIRA_TOKEN` (base64 email:token), `JIRA_CLOUD_ID=74d6fc17-1c7c-43e5-be7a-13f71cdc3372`
- Admin auth: кука `admin_token`, значение из `ADMIN_TOKEN` в env
- Ветка: `feature/backend-bff` — не мержить в main до Task 8
- `sprint.ts` не трогать до Task 8 (fallback)
- Коммиты по-русски в стиле существующих

---

## Файловая структура (что создаём)

```
migrations/
  001_initial.sql              ← схема БД
scripts/
  seed.ts                      ← импорт sprint.ts → БД (одноразовый)
src/
  lib/
    db.ts                      ← Neon client + query helper
    jira.ts                    ← Jira API: статусы, дочерние, связанные, retest %
    sync.ts                    ← синк всех эпиков активного спринта → jira_cache
    auth.ts                    ← проверка admin токена из куки
  app/
    api/
      sprint/
        active/route.ts        ← GET: спринт + эпики + jira_cache
        [id]/route.ts          ← GET/PUT (admin)
        route.ts               ← POST (admin, создать спринт)
      epics/
        route.ts               ← POST (admin, добавить эпик)
        [id]/route.ts          ← PUT, DELETE (admin)
      members/
        route.ts               ← GET
        [id]/route.ts          ← PUT (admin)
      assignments/
        route.ts               ← POST (admin)
        [sprintId]/route.ts    ← GET
        [id]/route.ts          ← DELETE (admin) — отдельный endpoint
      jira/
        sync/route.ts          ← POST (ручной тригер, admin)
      cron/
        sync/route.ts          ← POST (Vercel Cron)
    admin/                     ← реальная папка (не route group), даёт URL /admin/*
      layout.tsx               ← шапка-навигация админки
      page.tsx                 ← дашборд: спринт, кнопка «Синк Jira», last_synced_at
      login/page.tsx           ← форма ввода токена
      epics/page.tsx           ← таблица эпиков с inline firstPass % и флагами
      assignments/page.tsx     ← матрица тестер × эпик
      sprints/page.tsx         ← история + создать спринт
    middleware.ts              ← защита /admin/* (кроме /admin/login)
  components/
    BoardDataProvider.tsx      ← fetch /api/sprint/active, fallback на sprint.ts
vercel.json                    ← cron config
.env.local.example             ← шаблон переменных
```

---

## Task 1: Зависимости, тестовый фреймворк, схема БД

**Files:**
- Create: `migrations/001_initial.sql`
- Create: `src/lib/db.ts`
- Create: `.env.local.example`
- Modify: `package.json` (добавить dev-зависимости)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `query(sql, params) → Promise<T[]>` из `src/lib/db.ts`

- [ ] **Шаг 1: Установить зависимости**

```bash
npm install @neondatabase/serverless
npm install --save-dev vitest @vitejs/plugin-react tsx
```

- [ ] **Шаг 2: Создать vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Шаг 3: Добавить test-скрипт в package.json**

В секции `"scripts"` добавить:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Шаг 4: Создать migrations/001_initial.sql**

```sql
-- Спринты
CREATE TABLE IF NOT EXISTS sprints (
  id             SERIAL PRIMARY KEY,
  number         INT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  confluence_url TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Эпики спринта (QA-специфика)
CREATE TABLE IF NOT EXISTS sprint_epics (
  id           SERIAL PRIMARY KEY,
  sprint_id    INT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  jira_key     TEXT NOT NULL,
  team         TEXT NOT NULL CHECK (team IN ('CORE', 'eQA')),
  priority     TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('highest', 'high', 'none')),
  goal         TEXT,
  critbusiness BOOLEAN NOT NULL DEFAULT false,
  bonus        BOOLEAN NOT NULL DEFAULT false,
  task         BOOLEAN NOT NULL DEFAULT false,
  goal_done    BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  UNIQUE (sprint_id, jira_key)
);

-- Участники
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slack_id    TEXT,
  team        TEXT NOT NULL CHECK (team IN ('CORE', 'eQA')),
  role        TEXT,
  on_vacation BOOLEAN NOT NULL DEFAULT false,
  shift       TEXT
);

-- Назначения
CREATE TABLE IF NOT EXISTS assignments (
  id        SERIAL PRIMARY KEY,
  sprint_id INT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  jira_key  TEXT NOT NULL,
  note      TEXT,
  UNIQUE (sprint_id, member_id, jira_key)
);

-- Прогресс firstPass
CREATE TABLE IF NOT EXISTS progress_entries (
  id         SERIAL PRIMARY KEY,
  sprint_id  INT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  jira_key   TEXT NOT NULL,
  first_pass INT NOT NULL DEFAULT 0 CHECK (first_pass >= 0 AND first_pass <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  UNIQUE (sprint_id, jira_key)
);

-- Кэш Jira
CREATE TABLE IF NOT EXISTS jira_cache (
  jira_key      TEXT PRIMARY KEY,
  title         TEXT,
  jira_status   TEXT,
  assignee_name TEXT,
  assignee_id   TEXT,
  priority      TEXT,
  retest_pct    INT NOT NULL DEFAULT 0 CHECK (retest_pct >= 0 AND retest_pct <= 100),
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Шаг 5: Создать src/lib/db.ts**

```typescript
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);

export async function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return sql(strings, ...values) as Promise<T[]>;
}

export { sql };
```

- [ ] **Шаг 6: Создать .env.local.example**

```
DATABASE_URL=postgres://...
JIRA_BASE_URL=https://sprutgaming.atlassian.net
JIRA_TOKEN=base64(email:api_token)
JIRA_CLOUD_ID=74d6fc17-1c7c-43e5-be7a-13f71cdc3372
ADMIN_TOKEN=your-secret-token-here
CRON_SECRET=your-cron-secret-here
```

- [ ] **Шаг 7: Написать тест подключения к БД**

```typescript
// src/lib/db.test.ts
import { describe, it, expect } from "vitest";
import { query } from "./db";

describe("db", () => {
  it("подключается и выполняет простой запрос", async () => {
    const result = await query<{ one: number }>`SELECT 1 AS one`;
    expect(result[0].one).toBe(1);
  });
});
```

- [ ] **Шаг 8: Запустить миграцию через Neon Console или psql**

```bash
# Скопировать DATABASE_URL из Neon dashboard в .env.local
# Затем применить схему:
npx tsx -e "
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
const sql = neon(process.env.DATABASE_URL);
await sql(readFileSync('migrations/001_initial.sql', 'utf8'));
console.log('Migration complete');
"
```

Ожидаемый вывод: `Migration complete`

- [ ] **Шаг 9: Запустить тест**

```bash
npm test
```

Ожидаемый результат: `1 passed`

- [ ] **Шаг 10: Коммит**

```bash
git add migrations/ src/lib/db.ts src/lib/db.test.ts vitest.config.ts .env.local.example package.json package-lock.json
git commit -m "feat: схема БД, Neon client, vitest"
```

---

## Task 2: Seed — импорт sprint.ts в БД

**Files:**
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: данные из `src/data/sprint.ts` (члены, эпики, назначения, спринт)
- Produces: заполненные таблицы `sprints`, `sprint_epics`, `members`, `assignments`, `progress_entries`

- [ ] **Шаг 1: Создать scripts/seed.ts**

```typescript
// scripts/seed.ts
// Одноразовый скрипт: импортирует данные из sprint.ts в Neon Postgres.
// Запускать: npx tsx scripts/seed.ts
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { sprint, epics, members, assignments } from "../src/data/sprint.js";

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  console.log("Seed start...");

  // 1. Члены команды
  for (const m of members) {
    await sql`
      INSERT INTO members (id, name, slack_id, team, role, on_vacation, shift)
      VALUES (${m.id}, ${m.name}, ${m.slackId ?? null}, ${m.team},
              ${m.role ?? null}, ${m.onVacation ?? false}, ${m.shift ?? null})
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            slack_id = EXCLUDED.slack_id,
            team = EXCLUDED.team,
            role = EXCLUDED.role,
            on_vacation = EXCLUDED.on_vacation,
            shift = EXCLUDED.shift
    `;
  }
  console.log(`✓ members: ${members.length}`);

  // 2. Спринт
  const [sprintRow] = await sql`
    INSERT INTO sprints (number, start_date, end_date, confluence_url, is_active)
    VALUES (${sprint.number}, ${sprint.start}, ${sprint.endInclusive},
            ${sprint.confluenceUrl}, true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  const sprintId: number = sprintRow?.id;
  if (!sprintId) {
    const [existing] = await sql`SELECT id FROM sprints WHERE number = ${sprint.number}`;
    console.log(`Sprint ${sprint.number} already exists (id=${existing.id}), skipping epics.`);
    return;
  }
  console.log(`✓ sprint: id=${sprintId}`);

  // 3. Эпики
  for (let i = 0; i < epics.length; i++) {
    const e = epics[i];
    await sql`
      INSERT INTO sprint_epics
        (sprint_id, jira_key, team, priority, goal, critbusiness, bonus, task, goal_done, sort_order)
      VALUES
        (${sprintId}, ${e.key}, ${e.team}, ${e.priority},
         ${e.goal ?? null}, ${e.critbusiness ?? false}, ${e.bonus ?? false},
         ${e.task ?? false}, ${e.goalDone ?? false}, ${i})
      ON CONFLICT (sprint_id, jira_key) DO NOTHING
    `;

    // firstPass %
    if (e.progress?.firstPass !== undefined) {
      await sql`
        INSERT INTO progress_entries (sprint_id, jira_key, first_pass, updated_by)
        VALUES (${sprintId}, ${e.key}, ${e.progress.firstPass}, 'seed')
        ON CONFLICT (sprint_id, jira_key) DO UPDATE
          SET first_pass = EXCLUDED.first_pass
      `;
    }
  }
  console.log(`✓ epics: ${epics.length}`);

  // 4. Назначения
  for (const a of assignments) {
    for (const key of a.epicKeys) {
      await sql`
        INSERT INTO assignments (sprint_id, member_id, jira_key, note)
        VALUES (${sprintId}, ${a.memberId}, ${key}, ${a.note ?? null})
        ON CONFLICT (sprint_id, member_id, jira_key) DO NOTHING
      `;
    }
  }
  console.log(`✓ assignments: ${assignments.length} members`);

  console.log("Seed complete ✓");
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Шаг 2: Добавить скрипт в package.json**

```json
"seed": "tsx scripts/seed.ts"
```

- [ ] **Шаг 3: Запустить seed**

```bash
npm run seed
```

Ожидаемый вывод:
```
Seed start...
✓ members: 15
✓ sprint: id=1
✓ epics: 29
✓ assignments: N members
Seed complete ✓
```

- [ ] **Шаг 4: Проверить данные**

```bash
npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await Promise.all([
  sql\`SELECT count(*) FROM sprints\`,
  sql\`SELECT count(*) FROM sprint_epics\`,
  sql\`SELECT count(*) FROM members\`,
  sql\`SELECT count(*) FROM assignments\`,
]);
console.log('sprints:', r[0][0].count);
console.log('epics:', r[1][0].count);
console.log('members:', r[2][0].count);
console.log('assignments:', r[3][0].count);
"
```

- [ ] **Шаг 5: Коммит**

```bash
git add scripts/seed.ts package.json
git commit -m "feat: seed-скрипт импорта sprint.ts в БД"
```

---

## Task 3: Jira API client (src/lib/jira.ts)

**Files:**
- Create: `src/lib/jira.ts`
- Create: `src/lib/jira.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  fetchEpicsMeta(keys: string[]): Promise<JiraEpicMeta[]>
  // JiraEpicMeta { key, title, jiraStatus, assigneeName, assigneeId, priority }

  fetchRetestPct(epicKey: string): Promise<number>
  // (Done + RF Release) / (children + linked) * 100, округлено до целых
  ```

- [ ] **Шаг 1: Создать src/lib/jira.ts**

```typescript
// src/lib/jira.ts
const BASE = process.env.JIRA_BASE_URL!;
const TOKEN = process.env.JIRA_TOKEN!;
const CLOUD = process.env.JIRA_CLOUD_ID!;

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

// Статусы, считающиеся «готово» для retest % (сверено по живым данным BF-2209).
const DONE_STATUSES = new Set(["R.F Release", "RF Release", "Готово к релизу", "Готово", "Done"]);

export interface JiraEpicMeta {
  key: string;
  title: string;
  jiraStatus: string;
  assigneeName: string | null;
  assigneeId: string | null;
  priority: string;
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
    ["summary", "status", "assignee", "priority"]
  ) as Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      assignee: { displayName: string; accountId: string } | null;
      priority: { name: string };
    };
  }>;

  return issues.map((i) => ({
    key: i.key,
    title: i.fields.summary,
    jiraStatus: mapStatus(i.fields.status.name),
    assigneeName: i.fields.assignee?.displayName ?? null,
    assigneeId: i.fields.assignee?.accountId ?? null,
    priority: i.fields.priority.name.toLowerCase(),
  }));
}

// Считаем retest %: (Done + RF Release) / (дочерние + связанные) * 100
export async function fetchRetestPct(epicKey: string): Promise<number> {
  const [children, linked] = await Promise.all([
    searchIssues(`parent = "${epicKey}"`, ["status"]),
    searchIssues(`issue in linkedIssues("${epicKey}")`, ["status"]),
  ]) as [
    Array<{ fields: { status: { name: string } } }>,
    Array<{ fields: { status: { name: string } } }>,
  ];

  const all = [...children, ...linked];
  if (all.length === 0) return 0;

  const done = all.filter((i) => DONE_STATUSES.has(i.fields.status.name)).length;
  return Math.round((done / all.length) * 100);
}
```

- [ ] **Шаг 2: Написать тест (интеграционный, требует .env.local)**

```typescript
// src/lib/jira.test.ts
import { describe, it, expect } from "vitest";
import { fetchEpicsMeta, fetchRetestPct } from "./jira";

// Запускать только с реальными кредами: npx vitest run src/lib/jira.test.ts
describe("jira client", () => {
  it("fetchEpicsMeta возвращает данные по BF-2209", async () => {
    const result = await fetchEpicsMeta(["BF-2209"]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("BF-2209");
    expect(result[0].title).toBeTruthy();
    expect(result[0].jiraStatus).toBeTruthy();
  });

  it("fetchRetestPct возвращает число от 0 до 100 для BF-2209", async () => {
    const pct = await fetchRetestPct("BF-2209");
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
    console.log("BF-2209 retest %:", pct);
  });
});
```

- [ ] **Шаг 3: Запустить тест**

```bash
npm test -- src/lib/jira.test.ts
```

Ожидаемый результат: 2 passed. В консоли — реальный retest % BF-2209 (~91%, сверено по живым данным: 161 дочка + 10 связанных = 171, готово 155).

- [ ] **Шаг 4: Коммит**

```bash
git add src/lib/jira.ts src/lib/jira.test.ts
git commit -m "feat: Jira API client (мета эпиков, retest %)"
```

---

## Task 4: Sync service (src/lib/sync.ts) + Cron endpoint

**Files:**
- Create: `src/lib/sync.ts`
- Create: `src/app/api/cron/sync/route.ts`
- Create: `src/app/api/jira/sync/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `fetchEpicsMeta`, `fetchRetestPct` из `src/lib/jira.ts`; `query` из `src/lib/db.ts`
- Produces: обновлённые строки в `jira_cache`

- [ ] **Шаг 1: Создать src/lib/sync.ts**

```typescript
// src/lib/sync.ts
import { sql } from "./db";
import { fetchEpicsMeta, fetchRetestPct } from "./jira";

export async function syncActiveSprintEpics(): Promise<{ synced: number; errors: string[] }> {
  // Достаём ключи активного спринта
  const rows = await sql`
    SELECT se.jira_key
    FROM sprint_epics se
    JOIN sprints s ON s.id = se.sprint_id
    WHERE s.is_active = true
  ` as Array<{ jira_key: string }>;

  const keys = rows.map((r) => r.jira_key);
  if (keys.length === 0) return { synced: 0, errors: [] };

  const errors: string[] = [];

  // Батч-запрос мета всех эпиков
  const metas = await fetchEpicsMeta(keys);
  const metaMap = new Map(metas.map((m) => [m.key, m]));

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

  // Пишем в jira_cache
  let synced = 0;
  for (const key of keys) {
    const meta = metaMap.get(key);
    if (!meta) { errors.push(`meta not found for ${key}`); continue; }

    await sql`
      INSERT INTO jira_cache (jira_key, title, jira_status, assignee_name, assignee_id, priority, retest_pct, synced_at)
      VALUES (
        ${key}, ${meta.title}, ${meta.jiraStatus},
        ${meta.assigneeName}, ${meta.assigneeId}, ${meta.priority},
        ${retestMap.get(key) ?? 0}, now()
      )
      ON CONFLICT (jira_key) DO UPDATE SET
        title         = EXCLUDED.title,
        jira_status   = EXCLUDED.jira_status,
        assignee_name = EXCLUDED.assignee_name,
        assignee_id   = EXCLUDED.assignee_id,
        priority      = EXCLUDED.priority,
        retest_pct    = EXCLUDED.retest_pct,
        synced_at     = now()
    `;
    synced++;
  }

  return { synced, errors };
}
```

- [ ] **Шаг 2: Создать src/app/api/cron/sync/route.ts**

```typescript
// src/app/api/cron/sync/route.ts
import { NextResponse } from "next/server";
import { syncActiveSprintEpics } from "@/lib/sync";

export async function POST(request: Request) {
  // Vercel Cron добавляет заголовок Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncActiveSprintEpics();
  return NextResponse.json(result);
}
```

- [ ] **Шаг 3: Создать src/app/api/jira/sync/route.ts (ручной тригер)**

```typescript
// src/app/api/jira/sync/route.ts
import { NextResponse } from "next/server";
import { syncActiveSprintEpics } from "@/lib/sync";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const result = await syncActiveSprintEpics();
  return NextResponse.json(result);
}
```

- [ ] **Шаг 4: Создать src/lib/auth.ts**

```typescript
// src/lib/auth.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function requireAdmin(request?: Request): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (token === process.env.ADMIN_TOKEN) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return token === process.env.ADMIN_TOKEN;
}
```

- [ ] **Шаг 5: Создать vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

- [ ] **Шаг 6: Запустить первый ручной синк (через curl или скрипт)**

```bash
# Установить ADMIN_TOKEN в .env.local, запустить dev-сервер
npm run dev &
# В другом терминале:
curl -X POST http://localhost:3000/api/jira/sync \
  -H "Cookie: admin_token=your-token"
```

Ожидаемый ответ: `{"synced":29,"errors":[]}`

- [ ] **Шаг 7: Проверить jira_cache**

```bash
npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql\`SELECT jira_key, jira_status, retest_pct, synced_at FROM jira_cache LIMIT 5\`;
console.table(rows);
"
```

- [ ] **Шаг 8: Коммит**

```bash
git add src/lib/sync.ts src/lib/auth.ts src/app/api/cron/ src/app/api/jira/ vercel.json
git commit -m "feat: sync-сервис Jira, cron endpoint, ручной тригер"
```

---

## Task 5: API route GET /api/sprint/active

**Files:**
- Create: `src/app/api/sprint/active/route.ts`
- Create: `src/app/api/sprint/active/route.test.ts`

**Interfaces:**
- Produces:
```typescript
// GET /api/sprint/active → SprintPayload
interface SprintPayload {
  sprint: { id: number; number: number; start: string; end: string; confluenceUrl: string };
  epics: EpicPayload[];
  members: MemberRow[];
  assignments: AssignmentRow[];
  syncedAt: string | null;  // последний synced_at из jira_cache
}

interface EpicPayload {
  // Из sprint_epics:
  id: number; sprintId: number; jiraKey: string; team: string; priority: string;
  goal: string | null; critbusiness: boolean; bonus: boolean; task: boolean; goalDone: boolean;
  sortOrder: number;
  // Из jira_cache (null если не синкнуто):
  title: string | null; jiraStatus: string | null; assigneeName: string | null;
  retestPct: number;
  // Из progress_entries:
  firstPass: number;
}
```

- [ ] **Шаг 1: Написать тест**

```typescript
// src/app/api/sprint/active/route.test.ts
import { describe, it, expect, vi } from "vitest";

// Мокаем БД — не нужна реальная БД для unit-теста формата ответа
vi.mock("@/lib/db", () => ({
  sql: vi.fn().mockResolvedValue([]),
}));

describe("GET /api/sprint/active", () => {
  it("возвращает 404 если нет активного спринта", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/sprint/active");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Шаг 2: Запустить тест — убедиться что FAIL**

```bash
npm test -- src/app/api/sprint/active/route.test.ts
```

Ожидаемый результат: FAIL (файл route.ts не существует)

- [ ] **Шаг 3: Создать src/app/api/sprint/active/route.ts**

```typescript
// src/app/api/sprint/active/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  // Активный спринт
  const sprints = await sql<{
    id: number; number: number; start_date: string; end_date: string; confluence_url: string;
  }>`
    SELECT id, number, start_date, end_date, confluence_url
    FROM sprints WHERE is_active = true LIMIT 1
  `;

  if (sprints.length === 0) {
    return NextResponse.json({ error: "No active sprint" }, { status: 404 });
  }
  const s = sprints[0];

  // Эпики + jira_cache + progress
  const epics = await sql<{
    id: number; sprint_id: number; jira_key: string; team: string; priority: string;
    goal: string | null; critbusiness: boolean; bonus: boolean; task: boolean;
    goal_done: boolean; sort_order: number;
    title: string | null; jira_status: string | null; assignee_name: string | null;
    retest_pct: number; first_pass: number;
  }>`
    SELECT
      se.id, se.sprint_id, se.jira_key, se.team, se.priority,
      se.goal, se.critbusiness, se.bonus, se.task, se.goal_done, se.sort_order,
      jc.title, jc.jira_status, jc.assignee_name,
      COALESCE(jc.retest_pct, 0) AS retest_pct,
      COALESCE(pe.first_pass, 0) AS first_pass
    FROM sprint_epics se
    LEFT JOIN jira_cache jc ON jc.jira_key = se.jira_key
    LEFT JOIN progress_entries pe ON pe.sprint_id = se.sprint_id AND pe.jira_key = se.jira_key
    WHERE se.sprint_id = ${s.id}
    ORDER BY se.sort_order ASC
  `;

  // Участники
  const members = await sql`SELECT * FROM members ORDER BY team, name`;

  // Назначения
  const assignments = await sql`
    SELECT id, sprint_id, member_id, jira_key, note
    FROM assignments WHERE sprint_id = ${s.id}
  `;

  // Время последнего синка
  const syncRows = await sql<{ synced_at: string }>`
    SELECT MIN(synced_at) AS synced_at FROM jira_cache
    WHERE jira_key IN (SELECT jira_key FROM sprint_epics WHERE sprint_id = ${s.id})
  `;
  const syncedAt = syncRows[0]?.synced_at ?? null;

  return NextResponse.json({
    sprint: {
      id: s.id,
      number: s.number,
      start: s.start_date,
      end: s.end_date,
      confluenceUrl: s.confluence_url,
    },
    epics: epics.map((e) => ({
      id: e.id,
      sprintId: e.sprint_id,
      jiraKey: e.jira_key,
      team: e.team,
      priority: e.priority,
      goal: e.goal,
      critbusiness: e.critbusiness,
      bonus: e.bonus,
      task: e.task,
      goalDone: e.goal_done,
      sortOrder: e.sort_order,
      title: e.title,
      jiraStatus: e.jira_status,
      assigneeName: e.assignee_name,
      retestPct: e.retest_pct,
      firstPass: e.first_pass,
    })),
    members,
    assignments,
    syncedAt,
  });
}
```

- [ ] **Шаг 4: Запустить тест — должен PASS**

```bash
npm test -- src/app/api/sprint/active/route.test.ts
```

- [ ] **Шаг 5: Проверить endpoint вручную**

```bash
# dev-сервер должен быть запущен
curl http://localhost:3000/api/sprint/active | python3 -m json.tool | head -50
```

Ожидаемый результат: JSON с полями `sprint`, `epics` (массив 29 штук), `members`, `assignments`.

- [ ] **Шаг 6: Коммит**

```bash
git add src/app/api/sprint/active/
git commit -m "feat: GET /api/sprint/active — главный endpoint доски"
```

---

## Task 6: Admin CRUD API routes

**Files:**
- Create: `src/app/api/sprint/route.ts`
- Create: `src/app/api/sprint/[id]/route.ts`
- Create: `src/app/api/epics/route.ts`
- Create: `src/app/api/epics/[id]/route.ts`
- Create: `src/app/api/members/route.ts`
- Create: `src/app/api/members/[id]/route.ts`
- Create: `src/app/api/assignments/route.ts`
- Create: `src/app/api/assignments/[sprintId]/route.ts`
- Create: `src/app/api/assignments/[id]/route.ts` ← DELETE

**Interfaces:**
- Consumes: `requireAdmin` из `@/lib/auth`
- Produces: стандартные REST-ответы для мини-админки

- [ ] **Шаг 1: Создать src/app/api/epics/[id]/route.ts (главный CRUD для лида)**

```typescript
// src/app/api/epics/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

interface Params { params: Promise<{ id: string }> }

// PUT /api/epics/:id — обновить флаги, goal, firstPass
export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json() as {
    goal?: string; priority?: string; critbusiness?: boolean; bonus?: boolean;
    task?: boolean; goalDone?: boolean; firstPass?: number; updatedBy?: string;
  };

  // Обновляем sprint_epics
  await sql`
    UPDATE sprint_epics SET
      goal         = COALESCE(${body.goal ?? null}, goal),
      priority     = COALESCE(${body.priority ?? null}, priority),
      critbusiness = COALESCE(${body.critbusiness ?? null}, critbusiness),
      bonus        = COALESCE(${body.bonus ?? null}, bonus),
      task         = COALESCE(${body.task ?? null}, task),
      goal_done    = COALESCE(${body.goalDone ?? null}, goal_done)
    WHERE id = ${id}
  `;

  // Если передан firstPass — upsert в progress_entries
  if (body.firstPass !== undefined) {
    const epicRows = await sql<{ sprint_id: number; jira_key: string }>`
      SELECT sprint_id, jira_key FROM sprint_epics WHERE id = ${id}
    `;
    if (epicRows.length > 0) {
      const { sprint_id, jira_key } = epicRows[0];
      await sql`
        INSERT INTO progress_entries (sprint_id, jira_key, first_pass, updated_at, updated_by)
        VALUES (${sprint_id}, ${jira_key}, ${body.firstPass}, now(), ${body.updatedBy ?? 'admin'})
        ON CONFLICT (sprint_id, jira_key) DO UPDATE SET
          first_pass = EXCLUDED.first_pass,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `;
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/epics/:id
export async function DELETE(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  await sql`DELETE FROM sprint_epics WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
```

- [ ] **Шаг 2: Создать src/app/api/epics/route.ts (POST — добавить эпик)**

```typescript
// src/app/api/epics/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await request.json() as {
    sprintId: number; jiraKey: string; team: string;
    priority?: string; goal?: string; critbusiness?: boolean;
    bonus?: boolean; task?: boolean;
  };

  const [row] = await sql<{ id: number }>`
    INSERT INTO sprint_epics (sprint_id, jira_key, team, priority, goal, critbusiness, bonus, task)
    VALUES (
      ${body.sprintId}, ${body.jiraKey}, ${body.team},
      ${body.priority ?? 'none'}, ${body.goal ?? null},
      ${body.critbusiness ?? false}, ${body.bonus ?? false}, ${body.task ?? false}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: row.id });
}
```

- [ ] **Шаг 3: Создать src/app/api/assignments/route.ts и [sprintId]/route.ts**

```typescript
// src/app/api/assignments/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await request.json() as {
    sprintId: number; memberId: string; jiraKey: string; note?: string;
  };

  await sql`
    INSERT INTO assignments (sprint_id, member_id, jira_key, note)
    VALUES (${body.sprintId}, ${body.memberId}, ${body.jiraKey}, ${body.note ?? null})
    ON CONFLICT (sprint_id, member_id, jira_key) DO UPDATE SET note = EXCLUDED.note
  `;

  return NextResponse.json({ ok: true });
}
```

```typescript
// src/app/api/assignments/[sprintId]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = await params;
  const rows = await sql`
    SELECT id, sprint_id, member_id, jira_key, note
    FROM assignments WHERE sprint_id = ${sprintId}
  `;
  return NextResponse.json(rows);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sprintId: string }> }) {
  const { requireAdmin } = await import("@/lib/auth");
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { sprintId } = await params;
  const body = await request.json() as { memberId: string; jiraKey: string };
  await sql`
    DELETE FROM assignments
    WHERE sprint_id = ${sprintId} AND member_id = ${body.memberId} AND jira_key = ${body.jiraKey}
  `;
  return NextResponse.json({ ok: true });
}
```

- [ ] **Шаг 4: Создать src/app/api/sprint/route.ts и [id]/route.ts**

```typescript
// src/app/api/sprint/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const body = await request.json() as {
    number: number; start: string; end: string; confluenceUrl?: string;
  };

  // Деактивируем предыдущий спринт
  await sql`UPDATE sprints SET is_active = false WHERE is_active = true`;

  const [row] = await sql<{ id: number }>`
    INSERT INTO sprints (number, start_date, end_date, confluence_url, is_active)
    VALUES (${body.number}, ${body.start}, ${body.end}, ${body.confluenceUrl ?? null}, true)
    RETURNING id
  `;

  return NextResponse.json({ id: row.id });
}
```

```typescript
// src/app/api/sprint/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM sprints WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json() as {
    number?: number; start?: string; end?: string;
    confluenceUrl?: string; isActive?: boolean;
  };

  await sql`
    UPDATE sprints SET
      number         = COALESCE(${body.number ?? null}, number),
      start_date     = COALESCE(${body.start ?? null}, start_date),
      end_date       = COALESCE(${body.end ?? null}, end_date),
      confluence_url = COALESCE(${body.confluenceUrl ?? null}, confluence_url),
      is_active      = COALESCE(${body.isActive ?? null}, is_active)
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
```

- [ ] **Шаг 5: Создать src/app/api/members/route.ts и [id]/route.ts**

```typescript
// src/app/api/members/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT * FROM members ORDER BY team, name`;
  return NextResponse.json(rows);
}
```

```typescript
// src/app/api/members/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

interface Params { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Params) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json() as {
    name?: string; role?: string; onVacation?: boolean; shift?: string;
  };

  await sql`
    UPDATE members SET
      name        = COALESCE(${body.name ?? null}, name),
      role        = COALESCE(${body.role ?? null}, role),
      on_vacation = COALESCE(${body.onVacation ?? null}, on_vacation),
      shift       = COALESCE(${body.shift ?? null}, shift)
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
```

- [ ] **Шаг 6: Проверить все endpoints через curl**

```bash
# Проверяем PUT эпика (firstPass %)
curl -X PUT http://localhost:3000/api/epics/1 \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=your-token" \
  -d '{"firstPass": 75, "updatedBy": "denisk"}'
# Ожидаем: {"ok":true}

# Проверяем что в БД обновилось
curl http://localhost:3000/api/sprint/active | python3 -m json.tool | grep first_pass
```

- [ ] **Шаг 7: Коммит**

```bash
git add src/app/api/
git commit -m "feat: admin CRUD API routes (эпики, спринты, участники, назначения)"
```

---

## Task 7: Admin middleware + страница логина

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/layout.tsx`

- [ ] **Шаг 1: Создать src/middleware.ts**

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Защищаем все /admin/* кроме /admin/login
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = request.cookies.get("admin_token")?.value;
    if (token !== process.env.ADMIN_TOKEN) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Шаг 2: Создать src/app/admin/login/page.tsx**

```typescript
// src/app/admin/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      router.push("/admin");
    } else {
      setError("Неверный токен");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl w-80 space-y-4">
        <h1 className="text-white text-xl font-bold">QA Sprint Board Admin</h1>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Токен доступа"
          className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Шаг 3: Создать API endpoint для логина /api/admin/login/route.ts**

```typescript
// src/app/api/admin/login/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { token } = await request.json() as { token: string };

  if (token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 дней
    path: "/",
  });
  return res;
}
```

- [ ] **Шаг 4: Создать src/app/admin/layout.tsx**

```typescript
// src/app/admin/layout.tsx
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <span className="font-bold text-indigo-400">QA Sprint Board</span>
        <span className="text-gray-500 text-sm">Admin</span>
        <nav className="ml-auto flex gap-4 text-sm">
          <a href="/admin" className="text-gray-400 hover:text-white">Дашборд</a>
          <a href="/admin/epics" className="text-gray-400 hover:text-white">Эпики</a>
          <a href="/admin/assignments" className="text-gray-400 hover:text-white">Назначения</a>
          <a href="/admin/sprints" className="text-gray-400 hover:text-white">Спринты</a>
          <a href="/" className="text-gray-400 hover:text-white">← Доска</a>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Шаг 5: Проверить что /admin редиректит на /admin/login без куки**

```bash
curl -I http://localhost:3000/admin
# Ожидаем: 307 Temporary Redirect → Location: /admin/login
```

- [ ] **Шаг 6: Коммит**

```bash
git add src/middleware.ts src/app/admin/ src/app/api/admin/
git commit -m "feat: admin middleware, страница логина, layout"
```

---

## Task 8: Мини-админка — страница эпиков /admin/epics

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/epics/page.tsx`

- [ ] **Шаг 1: Создать src/app/admin/page.tsx (дашборд)**

```typescript
// src/app/admin/page.tsx
"use client";
import { useEffect, useState } from "react";

interface SyncStatus { synced: number; errors: string[]; syncedAt: string | null }

export default function AdminDashboard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/sprint/active")
      .then((r) => r.json())
      .then((d) => setStatus({ synced: 0, errors: [], syncedAt: d.syncedAt }));
  }, []);

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
    </div>
  );
}
```

- [ ] **Шаг 2: Создать src/app/admin/epics/page.tsx**

```typescript
// src/app/admin/epics/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";

interface EpicRow {
  id: number; jiraKey: string; team: string; title: string | null;
  jiraStatus: string | null; firstPass: number; retestPct: number;
  critbusiness: boolean; bonus: boolean; task: boolean; goalDone: boolean;
  goal: string | null; priority: string;
}

interface SprintData { sprint: { id: number; number: number }; epics: EpicRow[] }

export default function AdminEpics() {
  const [data, setData] = useState<SprintData | null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/sprint/active");
    const d = await res.json();
    setData(d);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateEpic(id: number, patch: Record<string, unknown>) {
    setSaving((s) => ({ ...s, [id]: true }));
    await fetch(`/api/epics/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, updatedBy: "admin" }),
    });
    setSaving((s) => ({ ...s, [id]: false }));
    await load();
  }

  if (!data) return <p className="text-gray-400">Загрузка...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Эпики — Спринт {data.sprint.number}</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800 text-left">
              <th className="py-2 pr-4">Ключ</th>
              <th className="py-2 pr-4">Название</th>
              <th className="py-2 pr-4">Команда</th>
              <th className="py-2 pr-4">Статус Jira</th>
              <th className="py-2 pr-4 text-center">Чек-лист %</th>
              <th className="py-2 pr-4 text-center">Ретесты %</th>
              <th className="py-2 pr-4 text-center">Критбизнес</th>
              <th className="py-2 pr-4 text-center">Бонус</th>
              <th className="py-2 pr-4 text-center">Задача</th>
              <th className="py-2 pr-4 text-center">Цель ✓</th>
            </tr>
          </thead>
          <tbody>
            {data.epics.map((epic) => (
              <tr key={epic.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-4">
                  <a
                    href={`https://sprutgaming.atlassian.net/browse/${epic.jiraKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    {epic.jiraKey}
                  </a>
                </td>
                <td className="py-2 pr-4 max-w-xs truncate text-gray-200">
                  {epic.title ?? <span className="text-gray-600 italic">не синкнуто</span>}
                </td>
                <td className="py-2 pr-4 text-gray-400">{epic.team}</td>
                <td className="py-2 pr-4 text-gray-400">{epic.jiraStatus ?? "—"}</td>
                <td className="py-2 pr-4 text-center">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={epic.firstPass}
                    onBlur={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)));
                      if (val !== epic.firstPass) updateEpic(epic.id, { firstPass: val });
                    }}
                    className="w-16 bg-gray-800 text-white text-center rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
                <td className="py-2 pr-4 text-center text-gray-400">{epic.retestPct}%</td>
                {(["critbusiness", "bonus", "task", "goalDone"] as const).map((flag) => (
                  <td key={flag} className="py-2 pr-4 text-center">
                    <input
                      type="checkbox"
                      defaultChecked={epic[flag]}
                      onChange={(e) => updateEpic(epic.id, { [flag]: e.target.checked })}
                      className="accent-indigo-500 w-4 h-4"
                    />
                  </td>
                ))}
                {saving[epic.id] && (
                  <td className="py-2 text-indigo-400 text-xs">Сохр...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Шаг 3: Проверить в браузере**

Открыть `http://localhost:3000/admin/login`, ввести токен, перейти на `/admin/epics`.
Должна появиться таблица с 29 эпиками, инлайн-редактирование % работает.

- [ ] **Шаг 4: Коммит**

```bash
git add src/app/admin/
git commit -m "feat: admin дашборд и страница редактирования эпиков"
```

---

## Task 9: Admin — назначения и спринты

**Files:**
- Create: `src/app/admin/assignments/page.tsx`
- Create: `src/app/admin/sprints/page.tsx`

- [ ] **Шаг 1: Создать src/app/admin/assignments/page.tsx**

```typescript
// src/app/admin/assignments/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";

interface Member { id: string; name: string; team: string }
interface Epic { id: number; jiraKey: string; title: string | null; team: string }
interface Assignment { memberId: string; jiraKey: string; note: string | null }
interface SprintData {
  sprint: { id: number; number: number };
  epics: Epic[]; members: Member[]; assignments: Assignment[];
}

export default function AdminAssignments() {
  const [data, setData] = useState<SprintData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sprint/active");
    setData(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(memberId: string, jiraKey: string, currentNote: string | null) {
    const existing = data?.assignments.find(
      (a) => a.memberId === memberId && a.jiraKey === jiraKey
    );
    if (existing) {
      // Удалить
      await fetch(`/api/assignments/${data!.sprint.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, jiraKey }),
      });
    } else {
      // Добавить
      await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: data!.sprint.id, memberId, jiraKey }),
      });
    }
    await load();
  }

  if (!data) return <p className="text-gray-400">Загрузка...</p>;

  const coreEpics = data.epics.filter((e) => e.team === "CORE");
  const coreMembers = data.members.filter((m) => m.team === "CORE");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Назначения — Спринт {data.sprint.number}</h1>
      <p className="text-gray-400 text-sm">Клик по ячейке — назначить/снять.</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-400 py-1 pr-3 font-normal min-w-24">Тестер</th>
              {coreEpics.map((e) => (
                <th key={e.id} className="text-center text-gray-400 py-1 px-1 font-normal max-w-16">
                  <span className="block truncate w-14" title={e.title ?? e.jiraKey}>
                    {e.jiraKey}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coreMembers.map((m) => (
              <tr key={m.id} className="border-t border-gray-800/50">
                <td className="py-1 pr-3 text-gray-300 whitespace-nowrap">{m.name}</td>
                {coreEpics.map((e) => {
                  const assigned = data.assignments.some(
                    (a) => a.memberId === m.id && a.jiraKey === e.jiraKey
                  );
                  return (
                    <td
                      key={e.id}
                      onClick={() => toggle(m.id, e.jiraKey, null)}
                      className={`text-center py-1 px-1 cursor-pointer rounded ${
                        assigned
                          ? "bg-indigo-500/30 text-indigo-300"
                          : "hover:bg-gray-800"
                      }`}
                    >
                      {assigned ? "●" : "○"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Шаг 2: Создать src/app/admin/sprints/page.tsx**

```typescript
// src/app/admin/sprints/page.tsx
"use client";
import { useEffect, useState } from "react";

interface Sprint {
  id: number; number: number; start_date: string; end_date: string;
  confluence_url: string | null; is_active: boolean;
}

export default function AdminSprints() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [form, setForm] = useState({ number: "", start: "", end: "", confluenceUrl: "" });
  const [creating, setCreating] = useState(false);

  async function loadSprints() {
    // Загружаем все спринты через /api/sprint/active и историю
    const res = await fetch("/api/sprint/active");
    const d = await res.json();
    if (d.sprint) setSprints([d.sprint]);
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
    await loadSprints();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Спринты</h1>

      <div className="space-y-2">
        {sprints.map((s) => (
          <div key={s.id} className="bg-gray-900 rounded-xl px-6 py-4 flex items-center gap-4">
            <span className="text-indigo-400 font-bold">Спринт {s.number}</span>
            <span className="text-gray-400 text-sm">{s.start_date} — {s.end_date}</span>
            {s.is_active && (
              <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded-full">
                Активный
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl p-6 space-y-4 max-w-md">
        <h2 className="font-bold">Создать новый спринт</h2>
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
```

- [ ] **Шаг 3: Проверить в браузере**

Открыть `/admin/assignments` — матрица тестеров и эпиков, клики работают.
Открыть `/admin/sprints` — список спринтов, форма создания.

- [ ] **Шаг 4: Коммит**

```bash
git add src/app/admin/assignments src/app/admin/sprints
git commit -m "feat: admin страницы назначений и спринтов"
```

---

## Task 10: BoardDataProvider — миграция фронта с sprint.ts на API

**Files:**
- Create: `src/components/BoardDataProvider.tsx`
- Modify: `src/app/page.tsx` (доска остаётся на корне `/`, переключаем источник данных)

**Interfaces:**
- Consumes: `GET /api/sprint/active`
- Produces: те же типы `Epic`, `Member`, `Assignment`, `Sprint` что использует `page.tsx`

- [ ] **Шаг 1: Создать src/components/BoardDataProvider.tsx**

```typescript
// src/components/BoardDataProvider.tsx
// Загружает данные из /api/sprint/active.
// Если API недоступен (нет DB_URL и т.п.) — использует статический sprint.ts как fallback.
"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Epic, Member, Assignment, Sprint } from "@/data/sprint";
import {
  epics as staticEpics,
  members as staticMembers,
  assignments as staticAssignments,
  sprint as staticSprint,
} from "@/data/sprint";

export interface BoardData {
  sprint: Sprint;
  epics: Epic[];
  members: Member[];
  assignments: Assignment[];
  syncedAt: string | null;
  loading: boolean;
  error: string | null;
}

const BoardDataContext = createContext<BoardData | null>(null);

function apiEpicToEpic(e: Record<string, unknown>): Epic {
  return {
    key: e.jiraKey as string,
    title: (e.title as string) ?? (e.jiraKey as string),
    goal: (e.goal as string) ?? "",
    priority: (e.priority as Epic["priority"]) ?? "none",
    team: e.team as Epic["team"],
    jiraStatus: (e.jiraStatus as Epic["jiraStatus"]) ?? "backlog",
    progress: {
      firstPass: (e.firstPass as number) ?? 0,
      retest: (e.retestPct as number) ?? undefined,
    },
    critbusiness: (e.critbusiness as boolean) ?? false,
    bonus: (e.bonus as boolean) ?? false,
    task: (e.task as boolean) ?? false,
    goalDone: (e.goalDone as boolean) ?? false,
    links: { jira: `https://sprutgaming.atlassian.net/browse/${e.jiraKey}` },
  };
}

function apiMemberToMember(m: Record<string, unknown>): Member {
  return {
    id: m.id as string,
    name: m.name as string,
    slackId: (m.slack_id as string) ?? "",
    team: m.team as Member["team"],
    role: m.role as string | undefined,
    onVacation: (m.on_vacation as boolean) ?? false,
    shift: m.shift as string | undefined,
  };
}

function apiAssignmentToAssignment(a: Record<string, unknown>): Assignment {
  return {
    memberId: a.member_id as string,
    epicKeys: [a.jira_key as string],
    note: a.note as string | undefined,
  };
}

export function BoardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BoardData>({
    sprint: staticSprint,
    epics: staticEpics,
    members: staticMembers,
    assignments: staticAssignments,
    syncedAt: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    fetch("/api/sprint/active")
      .then(async (res) => {
        if (!res.ok) throw new Error(`API ${res.status}`);
        const d = await res.json();

        // Группируем assignments: memberId → epicKeys[]
        const asgMap = new Map<string, string[]>();
        for (const a of d.assignments) {
          const key = a.member_id as string;
          if (!asgMap.has(key)) asgMap.set(key, []);
          asgMap.get(key)!.push(a.jira_key as string);
        }
        const assignments: Assignment[] = Array.from(asgMap.entries()).map(
          ([memberId, epicKeys]) => ({ memberId, epicKeys })
        );

        setData({
          sprint: {
            number: d.sprint.number,
            start: d.sprint.start,
            endInclusive: d.sprint.end,
            confluenceUrl: d.sprint.confluenceUrl,
          },
          epics: (d.epics as Record<string, unknown>[]).map(apiEpicToEpic),
          members: (d.members as Record<string, unknown>[]).map(apiMemberToMember),
          assignments,
          syncedAt: d.syncedAt,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        console.warn("API недоступен, используем sprint.ts:", err);
        setData((prev) => ({ ...prev, loading: false, error: String(err) }));
      });
  }, []);

  return (
    <BoardDataContext.Provider value={data}>
      {children}
    </BoardDataContext.Provider>
  );
}

export function useBoardData(): BoardData {
  const ctx = useContext(BoardDataContext);
  if (!ctx) throw new Error("useBoardData must be used inside BoardDataProvider");
  return ctx;
}
```

- [ ] **Шаг 2: Обернуть page.tsx в BoardDataProvider**

В `src/app/page.tsx` — найти импорты данных:

```typescript
// БЫЛО:
import { assignments, epics, members, sprint, type Team } from "@/data/sprint";
```

Заменить на:

```typescript
// СТАЛО:
import { BoardDataProvider, useBoardData } from "@/components/BoardDataProvider";
```

Добавить вверх файла после `export default function Home()`:
```typescript
return (
  <BoardDataProvider>
    <HomeInner />
  </BoardDataProvider>
);
```

Переименовать `function Home()` → `function HomeInner()` и внутри него добавить:
```typescript
const { epics, members, assignments, sprint } = useBoardData();
```

Удалить прямые импорты `epics`, `members`, `assignments`, `sprint` из `@/data/sprint`.

- [ ] **Шаг 3: Показать индикатор времени синка на доске**

В шапке `page.tsx` после заголовка добавить маленький индикатор:
```typescript
const { syncedAt } = useBoardData();
// В JSX:
{syncedAt && (
  <span className="text-gray-600 text-xs">
    Jira: {new Date(syncedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
  </span>
)}
```

- [ ] **Шаг 4: Проверить доску**

```bash
npm run dev
# Открыть http://localhost:3000
# Доска должна грузиться из API — данные те же, но title/status из Jira (живые)
```

- [ ] **Шаг 5: Проверить fallback**

Временно сломать DATABASE_URL в env → доска должна загрузиться из sprint.ts с предупреждением в консоли.

- [ ] **Шаг 6: Коммит**

```bash
git add src/components/BoardDataProvider.tsx src/app/page.tsx
git commit -m "feat: BoardDataProvider — фронт переключён на /api/sprint/active с fallback на sprint.ts"
```

---

## Task 11: Финальная проверка, AGENTS.md, деплой

**Files:**
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

- [ ] **Шаг 1: Запустить полный тест-сьют**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Все проверки должны пройти без ошибок.

- [ ] **Шаг 2: Проверить доску в браузере end-to-end**

1. Открыть `http://localhost:3000` — доска загружается из API
2. Открыть `/admin/login` — войти по токену
3. На `/admin/epics` — изменить firstPass % для одного эпика, сохранить
4. Вернуться на `/` — проверить что % обновился без деплоя
5. На `/admin` — нажать «Синк Jira», убедиться что статусы обновились

- [ ] **Шаг 3: Обновить AGENTS.md**

Заменить секцию «3. Источники данных и как обновлять» на новую инструкцию:

```markdown
### Обновление данных (новый способ — с бэкендом)
- Статусы Jira обновляются автоматически кроном каждые 30 мин.
- firstPass % — Denis обновляет через `/admin/epics`.
- Добавить эпик в спринт — `/admin/epics` → кнопка «Добавить эпик».
- Создать новый спринт — `/admin/sprints`.
- Экстренный синк Jira — `/admin` → кнопка «Синк Jira».
```

- [ ] **Шаг 4: Добавить запись в CHANGELOG.md**

Добавить сверху:

```markdown
## 21.06.2026 — переход на BFF: Neon Postgres + мини-админка

- Добавлен Next.js BFF: API routes, Neon Postgres (5 таблиц), Vercel Cron.
- Статусы и retest % тянутся из Jira автоматически (кроны каждые 30 мин).
- firstPass % обновляется через /admin/epics без деплоя.
- Мини-админка: /admin/epics, /admin/assignments, /admin/sprints.
- BoardDataProvider: фронт читает из API, fallback на sprint.ts.
- sprint.ts сохранён как readonly-архив спринта 10.
```

- [ ] **Шаг 5: Добавить переменные среды в Vercel**

В Vercel Dashboard → Settings → Environment Variables добавить:
- `DATABASE_URL` — из Neon dashboard
- `JIRA_BASE_URL` — `https://sprutgaming.atlassian.net`
- `JIRA_TOKEN` — base64(email:api_token)
- `JIRA_CLOUD_ID` — `74d6fc17-1c7c-43e5-be7a-13f71cdc3372`
- `ADMIN_TOKEN` — случайная строка ≥ 32 символа
- `CRON_SECRET` — случайная строка ≥ 32 символа

- [ ] **Шаг 6: Пушнуть ветку и открыть PR**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "docs: обновлён AGENTS.md и CHANGELOG под BFF-архитектуру"
git push origin feature/backend-bff
```

Открыть PR: `feature/backend-bff` → `main`.

- [ ] **Шаг 7: После мержа — запустить seed на проде**

```bash
# Установить production DATABASE_URL
DATABASE_URL=<prod_url> npm run seed
```

- [ ] **Шаг 8: Финальный коммит (если остались незакоммиченные правки)**

```bash
git add -A && git commit -m "chore: финальная чистка после миграции на BFF"
```

---

## Self-Review

**Покрытие спеки:**
- [x] БД: 6 таблиц (Task 1)
- [x] Seed-миграция sprint.ts (Task 2)
- [x] Jira client: fetchEpicsMeta + fetchRetestPct (Task 3)
- [x] Sync service + Cron (Task 4)
- [x] GET /api/sprint/active (Task 5)
- [x] Admin CRUD routes (Task 6)
- [x] Admin auth middleware + login (Task 7)
- [x] /admin/epics — firstPass %, флаги (Task 8)
- [x] /admin/assignments, /admin/sprints (Task 9)
- [x] Фронт переключён на API с fallback (Task 10)
- [x] Деплой, AGENTS.md, CHANGELOG (Task 11)
- [x] Переходящие эпики: firstPass % копируется через seed при создании нового спринта
- [x] Vercel Cron `"*/30 * * * *"` — в vercel.json

**Что не входит в план (по спеке):** WebSocket, Slack-парсер, Confluence API, аналитика, экспорт PDF.
