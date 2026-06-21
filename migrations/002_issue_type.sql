-- Тип задачи из Jira (Эпик / Задача / Story / Bug ...).
-- Доска по нему решает, рисовать ли шкалы прогресса (только для эпиков).
ALTER TABLE jira_cache ADD COLUMN IF NOT EXISTS issue_type TEXT;
