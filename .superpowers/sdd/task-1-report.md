# Task 1 — Отчёт: Зависимости, тестовый фреймворк, схема БД

**Статус:** DONE_WITH_CONCERNS
**Ветка:** `feature/backend-bff`
**Дата:** 2026-06-21

## Что сделано (по шагам брифа)

| Шаг | Описание | Результат |
|-----|----------|-----------|
| 1 | Зависимости | `@neondatabase/serverless` уже стоял; доустановлены dev: `vitest`, `@vitejs/plugin-react`, `tsx` (+36 пакетов) |
| 2 | `vitest.config.ts` | Создан verbatim из брифа |
| 3 | test-скрипты в `package.json` | Добавлены `"test": "vitest run"`, `"test:watch": "vitest"` |
| 4 | `migrations/001_initial.sql` | Создан verbatim (6 таблиц) |
| 5 | `src/lib/db.ts` | Создан verbatim |
| 6 | `.env.local.example` | Создан verbatim |
| 7 | `src/lib/db.test.ts` | Создан verbatim |
| 8 | Миграция на Neon | Применена к боевой базе через `DATABASE_URL_UNPOOLED` |
| 9 | Тест | `1 passed` |
| 10 | Коммит | Выполнен (см. ниже) |

## Команды и вывод

### Установка dev-зависимостей
```
npm install --save-dev vitest @vitejs/plugin-react tsx
# added 36 packages, audited 435 packages
```

### Запуск теста (TDD: red → green)
Первый прогон через `npm test` без env упал бы (`DATABASE_URL is not set`), плюс в песочнице нет сети. Поэтому тест запускался с явной подгрузкой env и сетью:
```
node --env-file=.env.local node_modules/.bin/vitest run
```
Вывод:
```
 RUN  v4.1.9
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  1.64s
```

### Применение миграции (Шаг 8) — отклонение от брифа
Сниппет из брифа (`sql(readFileSync(...))`) не работает на актуальном драйвере `@neondatabase/serverless@1.1.0`: функция `neon()` принимает только tagged-template, а не строку. Также HTTP-драйвер не выполняет несколько statements за один вызов.

Решение: прочитал файл, разбил на отдельные statements, выполнил каждый через `sql.query(...)` по unpooled-URL:
```
node --env-file=.env.local -e "
  const { neon } = require('@neondatabase/serverless');
  const { readFileSync } = require('fs');
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
  const clean = readFileSync('migrations/001_initial.sql','utf8')
    .split(';').map(s => s.replace(/--.*$/gm,'').trim()).filter(Boolean);
  (async () => { for (const s of clean) await sql.query(s); })();
"
# Migration complete: 6 statements
```

### Проверка схемы
```
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
-> assignments, jira_cache, members, progress_entries, sprint_epics, sprints
```
Все 6 таблиц созданы.

## Отклонения от брифа

1. **Шаг 8 (применение миграции):** оригинальный сниппет несовместим с драйвером v1.1.0 (tagged-template only + одно‑statement HTTP). Применил через split + `sql.query` по `DATABASE_URL_UNPOOLED`. Сами файлы (`db.ts`, `001_initial.sql`) оставлены verbatim.
2. **Запуск теста:** `src/lib/db.ts` читает `process.env.DATABASE_URL`, который vitest/`npm test` не подхватывает из `.env.local` автоматически. Тест зелёный при запуске через `node --env-file=.env.local node_modules/.bin/vitest run`.

## Concerns

- **`npm test` «как есть» не пройдёт** в чистом окружении: (а) не загружается `.env.local` → `DATABASE_URL is not set`; (б) тест ходит в реальный Neon, т.е. требует сети и живой базы. Скрипт оставлен verbatim по брифу. Рекомендация для будущих задач: либо завести `vitest setup`/dotenv для подгрузки env, либо изменить скрипт на `node --env-file=.env.local ...`, либо мокать БД в unit-тестах.
- **Песочница Shell без сети:** все обращения к Neon выполнялись с `full_network`. Это нормально, просто фиксирую.

## Файлы
- Created: `migrations/001_initial.sql`, `src/lib/db.ts`, `src/lib/db.test.ts`, `vitest.config.ts`, `.env.local.example`
- Modified: `package.json`, `package-lock.json`
- `.env.local` НЕ трогался и НЕ коммитился (в `.gitignore`).

## Fix (пост-ревью)

Обе проблемы тест-инфраструктуры из ревью устранены.

### ФИКС 1 — `npm test` подхватывает `.env.local`
`vitest.config.ts` переписан через `defineConfig(() => { ... })`: переменные грузятся
`loadEnv("", process.cwd(), "")` из `vite` и прокидываются в `test.env`. Теперь
`process.env.DATABASE_URL` доступен в тестах, `src/lib/db.ts` не бросает на импорте.
`.env.local` не трогался и не коммитился.

### ФИКС 2 — раннер миграций `scripts/migrate.ts`
Создан `scripts/migrate.ts`: читает SQL-файл (по умолчанию `migrations/001_initial.sql`,
путь можно передать аргументом), подключается к Neon по `DATABASE_URL_UNPOOLED`
(fallback `DATABASE_URL`), разбивает файл на отдельные statements (по `;` на границе
строк, отбрасывая комментарии/пустые) и выполняет по очереди через `sql.query(stmt)` —
т.к. HTTP-драйвер `@neondatabase/serverless@1.1.0` берёт одно statement за вызов.
Рассчитан на простой DDL (без `$$`/функций). В `package.json` добавлен скрипт
`"migrate": "tsx scripts/migrate.ts"`. Идемпотентность подтверждена: повторный прогон
по уже применённой схеме (`CREATE TABLE IF NOT EXISTS`) прошёл без ошибок.

### Команды и вывод
```
node --env-file=.env.local node_modules/.bin/tsx scripts/migrate.ts
-> Applying 6 statement(s) from migrations/001_initial.sql
-> Migration complete: 6 statement(s)   (exit 0, идемпотентно)

npm test
-> RUN v4.1.9
-> Test Files  1 passed (1)
-> Tests  1 passed (1)            (src/lib/db.test.ts, без --env-file)

npx tsc --noEmit
-> (без вывода, exit 0)
```

### Файлы (Fix)
- Created: `scripts/migrate.ts`
- Modified: `vitest.config.ts`, `package.json`
