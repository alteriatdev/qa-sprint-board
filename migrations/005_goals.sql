-- Три стандартные цели на каждый эпик/задачу спринта.
-- *_enabled: включена ли цель (настраивается в adminке при добавлении).
-- *_done:    выполнена ли цель (отмечается тестером прямо на борде).
-- Прогресс эпика = done_enabled / total_enabled * 100.

ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS first_pass_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS retest_enabled      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS smokes_enabled      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS first_pass_done     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS retest_done         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sprint_epics ADD COLUMN IF NOT EXISTS smokes_done         BOOLEAN NOT NULL DEFAULT FALSE;
