// Генератор снапшота графа эпиков из сырых дампов Jira.
//
// Бэка нет, живьём из браузера Jira не дёрнуть — поэтому ассистент снимает
// данные через MCP (searchJiraIssuesUsingJql), сырой ответ сохраняется в файл,
// а этот скрипт превращает его в компактный снапшот src/data/epicGraph.json.
//
// Дочерние задачи (поле parent), можно несколько дампов на эпик (пагинация):
//   node scripts/genGraph.mjs <EPIC> <children.json> [<EPIC2> <children2.json> ...]
//
// Дочерние задачи общим дампом parent in (...) — группируются по fields.parent.key
// (дамп должен включать поле parent). Можно несколько страниц пагинации:
//   node scripts/genGraph.mjs --children-grouped <kids.json> [<kids2.json> ...]
//
// Связанные задачи (issue links). Один дамп key in (...) с fields=["issuelinks"]
// покрывает сразу все эпики — группируется по ключу issue:
//   node scripts/genGraph.mjs --links <links.json> [<links2.json> ...]
//
// Режимы можно комбинировать: <пары детей...> --children-grouped ... --links ...
// Флаг --reset очищает текущий снапшот перед записью (полная пересборка).

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("src/data/epicGraph.json");
const BUG_TYPES = new Set(["Баг", "Bug", "Ошибка", "Дефект", "Bug Report"]);

function loadOut() {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch {
    return {};
  }
}

function nodeOf(key, fields) {
  const f = fields ?? {};
  return {
    key,
    title: f.summary ?? "",
    type: BUG_TYPES.has(f.issuetype?.name ?? "") ? "bug" : "task",
    status: f.status?.name ?? "",
    cat: f.status?.statusCategory?.key ?? "", // new | indeterminate | done
  };
}

let args = process.argv.slice(2);
const reset = args.includes("--reset");
args = args.filter((a) => a !== "--reset");

// Разбор флаговых секций: всё до первого флага — пары <EPIC> <dump>.
const groupedAt = args.indexOf("--children-grouped");
const linksAt = args.indexOf("--links");
const flagPts = [groupedAt, linksAt].filter((i) => i !== -1).sort((a, b) => a - b);
const firstFlag = flagPts.length ? flagPts[0] : args.length;

const childArgs = args.slice(0, firstFlag);
const groupedArgs =
  groupedAt === -1
    ? []
    : args.slice(groupedAt + 1, linksAt !== -1 && linksAt > groupedAt ? linksAt : args.length);
const linkArgs =
  linksAt === -1
    ? []
    : args.slice(linksAt + 1, groupedAt !== -1 && groupedAt > linksAt ? groupedAt : args.length);

if (childArgs.length % 2 !== 0) {
  console.error("Дочерние дампы передаются парами <EPIC> <dump.json>.");
  process.exit(1);
}
if (childArgs.length === 0 && groupedArgs.length === 0 && linkArgs.length === 0) {
  console.error(
    "Usage: node scripts/genGraph.mjs [<EPIC> <children.json> ...] [--children-grouped <kids.json> ...] [--links <links.json> ...] [--reset]"
  );
  process.exit(1);
}

const out = reset ? {} : loadOut();

// --- Дочерние задачи (parent) ---
for (let i = 0; i < childArgs.length; i += 2) {
  const epic = childArgs[i];
  const raw = JSON.parse(fs.readFileSync(childArgs[i + 1], "utf8"));
  const nodes = (raw.issues ?? []).map((it) => nodeOf(it.key, it.fields));

  // Мёрж по ключу: страницы пагинации складываются и дедуплицируются.
  const byKey = new Map((out[epic]?.nodes ?? []).map((n) => [n.key, n]));
  for (const n of nodes) byKey.set(n.key, n);
  out[epic] = { ...out[epic], nodes: [...byKey.values()] };

  const bugs = nodes.filter((n) => n.type === "bug").length;
  const done = nodes.filter((n) => n.cat === "done").length;
  console.log(`${epic}: ${nodes.length} дочек (баги: ${bugs}, закрыто: ${done})`);
}

// --- Дочерние задачи общим дампом (группировка по fields.parent.key) ---
for (const file of groupedArgs) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const perEpic = new Map();
  for (const it of raw.issues ?? []) {
    const epic = it.fields?.parent?.key;
    if (!epic) continue;
    if (!perEpic.has(epic)) perEpic.set(epic, []);
    perEpic.get(epic).push(nodeOf(it.key, it.fields));
  }
  for (const [epic, nodes] of perEpic) {
    const byKey = new Map((out[epic]?.nodes ?? []).map((n) => [n.key, n]));
    for (const n of nodes) byKey.set(n.key, n);
    out[epic] = { ...out[epic], nodes: [...byKey.values()] };
    const bugs = nodes.filter((n) => n.type === "bug").length;
    const done = nodes.filter((n) => n.cat === "done").length;
    console.log(`${epic}: +${nodes.length} дочек (баги: ${bugs}, закрыто: ${done})`);
  }
}

// --- Связанные задачи (issue links) ---
for (const file of linkArgs) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const issue of raw.issues ?? []) {
    const epic = issue.key;
    const links = issue.fields?.issuelinks ?? [];
    const childKeys = new Set((out[epic]?.nodes ?? []).map((n) => n.key));

    const linked = [];
    const seen = new Set();
    for (const l of links) {
      const other = l.inwardIssue ?? l.outwardIssue;
      if (!other) continue;
      // не дублируем то, что уже есть среди дочек, и сам эпик
      if (childKeys.has(other.key) || other.key === epic || seen.has(other.key)) continue;
      seen.add(other.key);
      linked.push({ ...nodeOf(other.key, other.fields), relation: l.type?.name ?? "Link" });
    }
    if (linked.length === 0 && !out[epic]) continue; // нет ни детей, ни связей
    out[epic] = { nodes: out[epic]?.nodes ?? [], linked };
    console.log(`${epic}: ${linked.length} связанных`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("→ записано:", OUT);
