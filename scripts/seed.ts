// scripts/seed.ts
// Одноразовый скрипт: импортирует данные из sprint.ts в Neon Postgres.
// Запускать: npm run seed
import { neon } from "@neondatabase/serverless";
import { sprint, epics, members, assignments } from "../src/data/sprint";

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

  // 2. Спринт (идемпотентно: у sprints нет UNIQUE на number, поэтому
  //    сначала ищем существующий спринт по number, и только если нет — создаём).
  let sprintId: number;
  const [existing] = await sql`SELECT id FROM sprints WHERE number = ${sprint.number}`;
  if (existing) {
    sprintId = existing.id;
    console.log(`✓ sprint: id=${sprintId} (existing, reusing)`);
  } else {
    const [sprintRow] = await sql`
      INSERT INTO sprints (number, start_date, end_date, confluence_url, is_active)
      VALUES (${sprint.number}, ${sprint.start}, ${sprint.endInclusive},
              ${sprint.confluenceUrl}, true)
      RETURNING id
    `;
    sprintId = sprintRow.id;
    console.log(`✓ sprint: id=${sprintId}`);
  }

  // 3. Эпики
  for (let i = 0; i < epics.length; i++) {
    const e = epics[i];
    await sql`
      INSERT INTO sprint_epics
        (sprint_id, jira_key, team, priority, goal, critbusiness, task, goal_done, sort_order)
      VALUES
        (${sprintId}, ${e.key}, ${e.team}, ${e.priority},
         ${e.goal ?? null}, ${e.critbusiness ?? false},
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
