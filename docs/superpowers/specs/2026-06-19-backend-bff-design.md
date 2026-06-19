# QA Sprint Board — Backend BFF Design

**Дата:** 19.06.2026  
**Ветка:** `feature/backend-bff`  
**Статус:** На ревью

---

## 1. Цель

Перевести QA Sprint Board с file-driven модели (`sprint.ts`) на тонкий BFF:
- Jira — источник правды для операционных данных (статусы, тайтлы, прогресс ретестов)
- Своя БД — только QA-специфика (состав спринта, флаги, firstPass %, история)
- Мини-админка — обновление данных без деплоя и правки TS-файлов

---

## 2. Стек

| Слой | Решение |
|---|---|
| Фронт + BFF | Next.js 16 (App Router) — существующий репо |
| База данных | Vercel Postgres (Neon serverless) |
| Cron | Vercel Cron (`vercel.json`) |
| Деплой | Vercel — существующий |
| Auth (админка) | Один токен в `env` (`ADMIN_TOKEN`), middleware |

---

## 3. Источники данных

```
Jira API (live / кэш 30 мин)
  → status, title, assignee, priority
  → retest % = (Done + RF Release) / (child issues + linked issues)

Своя БД
  → sprint: номер, даты, confluence_url
  → sprint_epics: jira_key + QA-флаги + goal + team
  → members: состав, смены eQA
  → assignments: кто взял + note
  → progress_entries: firstPass % (ручной ввод лида)

Confluence
  → только ссылка (не парсим автоматически)
```

---

## 4. Схема БД

```sql
-- История спринтов
CREATE TABLE sprints (
  id              SERIAL PRIMARY KEY,
  number          INT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  confluence_url  TEXT,
  is_active       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Эпики спринта — только QA-специфика
CREATE TABLE sprint_epics (
  id            SERIAL PRIMARY KEY,
  sprint_id     INT REFERENCES sprints(id),
  jira_key      TEXT NOT NULL,           -- SD-6457
  team          TEXT NOT NULL,           -- CORE | eQA
  priority      TEXT DEFAULT 'none',     -- highest | high | none
  goal          TEXT,                    -- текст из Confluence
  critbusiness  BOOLEAN DEFAULT false,
  bonus         BOOLEAN DEFAULT false,
  task          BOOLEAN DEFAULT false,
  goal_done     BOOLEAN DEFAULT false,
  sort_order    INT DEFAULT 0,
  UNIQUE(sprint_id, jira_key)
);

-- Участники команды
CREATE TABLE members (
  id            TEXT PRIMARY KEY,        -- 'yaroslav'
  name          TEXT NOT NULL,
  slack_id      TEXT,
  team          TEXT NOT NULL,           -- CORE | eQA
  role          TEXT,
  on_vacation   BOOLEAN DEFAULT false,
  shift         TEXT                     -- для eQA: '09:00–18:00'
);

-- Назначения
CREATE TABLE assignments (
  id          SERIAL PRIMARY KEY,
  sprint_id   INT REFERENCES sprints(id),
  member_id   TEXT REFERENCES members(id),
  jira_key    TEXT NOT NULL,
  note        TEXT,                      -- 'первая проходка', 'ретесты'
  UNIQUE(sprint_id, member_id, jira_key)
);

-- Прогресс firstPass (ручной ввод лида)
CREATE TABLE progress_entries (
  id          SERIAL PRIMARY KEY,
  sprint_id   INT REFERENCES sprints(id),
  jira_key    TEXT NOT NULL,
  first_pass  INT DEFAULT 0,             -- 0–100
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  TEXT,
  UNIQUE(sprint_id, jira_key)
);

-- Кэш данных из Jira (обновляется кроном)
CREATE TABLE jira_cache (
  jira_key      TEXT PRIMARY KEY,
  title         TEXT,
  jira_status   TEXT,
  assignee_name TEXT,
  assignee_id   TEXT,
  priority      TEXT,
  retest_pct    INT DEFAULT 0,           -- считается из child+linked issues
  synced_at     TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. API Routes

```
GET  /api/sprint/active          → текущий спринт + все эпики + Jira данные
GET  /api/sprint/:id             → конкретный спринт (история)
POST /api/sprint                 → создать спринт (admin)
PUT  /api/sprint/:id             → обновить спринт (admin)

GET  /api/epics/:sprintId        → список эпиков спринта
POST /api/epics                  → добавить эпик в спринт (admin)
PUT  /api/epics/:id              → обновить флаги, goal, firstPass (admin)
DELETE /api/epics/:id            → убрать эпик из спринта (admin)

GET  /api/members                → состав команды
PUT  /api/members/:id            → обновить участника (admin)

GET  /api/assignments/:sprintId  → назначения спринта
POST /api/assignments            → добавить назначение (admin)
DELETE /api/assignments/:id      → убрать назначение (admin)

POST /api/jira/sync              → ручной тригер синка (admin)
GET  /api/jira/status/:key       → live статус одного эпика

POST /api/cron/sync              → Vercel Cron endpoint (каждые 30 мин)
```

---

## 6. Cron — синк Jira

**Расписание:** каждые 30 минут (`"*/30 * * * *"` в `vercel.json`)

**Алгоритм:**
1. Достаём все `jira_key` из активного спринта
2. Батч-запрос в Jira: `key in (SD-6457, SD-6176, ...)` → title, status, assignee
3. Для каждого эпика параллельно:
   - `parent = "KEY"` → дочерние тикеты
   - `issue in linkedIssues("KEY")` → связанные тикеты
   - Считаем retest %: `(Done + RF Release) / total`
4. Пишем в `jira_cache`
5. Пишем `synced_at`

**Timeout-стратегия:** все запросы параллельно (`Promise.all`), не последовательно. 29 эпиков × 2 запроса = 58, но параллельно → укладываемся в 10 сек Vercel free tier.

**Fallback:** если синк падает — показываем `last_synced_at` на доске. Данные устаревшие но есть.

---

## 7. Мини-админка `/admin`

**Auth:** middleware проверяет куку `admin_token` === `process.env.ADMIN_TOKEN`.

### Страницы:

**`/admin`** — дашборд: текущий спринт, кнопка «Синк Jira», статус последнего синка.

**`/admin/epics`** — таблица эпиков:
- Inline редактирование `firstPass %` (число, Tab между полями)
- Чекбоксы флагов: `critbusiness`, `bonus`, `task`, `goalDone`
- Кнопка добавить эпик (поле jira_key + team + goal)
- retest % — readonly серым (из Jira)

**`/admin/assignments`** — назначения:
- Матрица: тестер × эпик
- Поле `note` (первая проходка / ретесты)

**`/admin/sprints`** — история + создать новый спринт.

---

## 8. Миграция без даунтайма

1. Ветка `feature/backend-bff` — весь новый код
2. `sprint.ts` остаётся нетронутым до конца
3. Новый компонент `BoardDataProvider` — читает из API если доступен, fallback на `sprint.ts`
4. Импортируем текущие данные `sprint.ts` → seed-скрипт → БД
5. Переключаем `BoardDataProvider` на API
6. `sprint.ts` становится readonly-архивом

---

## 9. Что НЕ входит в MVP

- WebSocket / real-time обновления (polling 60 сек достаточно)
- Auth для тестеров (self-service firstPass %)
- Slack-парсер отчётов
- Confluence API интеграция
- Аналитика по нескольким спринтам
- Экспорт в PDF

---

## 10. Открытые вопросы

- [ ] Какие типы `issuelinks` считаем при retest %? Все или конкретные?
- [ ] Переходящие эпики: firstPass % обнуляется или переносится?
- [ ] Vercel план: free (10с timeout) или Pro (60с)?
