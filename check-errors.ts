import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  
  // Смотрим активный спринт
  const sprint = await sql`SELECT id FROM sprints WHERE is_active = true LIMIT 1`;
  const sprintId = sprint[0].id;
  
  // Эпики без назначений
  const unassigned = await sql`
    SELECT se.jira_key, jc.assignee_name, jc.assignee_id, jc.title
    FROM sprint_epics se
    LEFT JOIN assignments a ON a.sprint_id = se.sprint_id AND a.jira_key = se.jira_key
    JOIN jira_cache jc ON jc.jira_key = se.jira_key
    WHERE se.sprint_id = ${sprintId} AND a.id IS NULL
    ORDER BY se.jira_key
  `;
  console.log("Эпики без назначений на борде:");
  console.table(unassigned);

  // Участники без jira_account_id
  const noAccountId = await sql`SELECT id, name FROM members WHERE jira_account_id IS NULL`;
  console.log("\nУчастники без jira_account_id:");
  console.table(noAccountId);
}

main().catch(console.error);
