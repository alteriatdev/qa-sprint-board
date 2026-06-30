// Источник данных прототипа QA Sprint Board.
// Сид собран из реальной страницы "Спринт 10 // 16.06–29.06" в Confluence
// и распределения из Slack-каналов #sprut-qa и #внешняя-команда-qa.
//
// В проде это место заменит:
//  - план/распределение -> своя БД (витрина = источник правды);
//  - jiraStatus -> live-запрос в Jira по ключу.

export type Team = "CORE" | "eQA";

export type Priority = "highest" | "high" | "none";

// Реальные статусы воркфлоу Jira (сверено live по ключам 17.06.2026).
// В проде придёт live-запросом из Jira по ключу эпика.
export type JiraStatus =
  | "analysis"
  | "backlog"
  | "in_development"
  | "block_tests"
  | "rf_qa"
  | "qa_testing"
  | "rf_release"
  | "done";

export interface Member {
  id: string;
  name: string; // отображаемое имя
  slackId: string; // U... для генерации текста в Slack
  team: Team;
  role?: string; // Lead, Trainee и т.п.
  shift?: string; // часы смены (для eQA)
  jiraAccountId?: string; // accountId в Jira — для резолва поля «QA» в назначения
}

export interface Epic {
  key: string; // SD-6457
  title: string;
  goal: string; // цель словами (из Confluence)
  priority: Priority;
  team: Team; // чья это в первую очередь зона (CORE/eQA)
  critbusiness?: boolean;
  task?: boolean; // одиночная задача, а не эпик — без шкалы проходки/ретестов
  // Три стандартные цели. *Enabled — применима ли цель к этому эпику.
  // *Done — выполнена ли. Прогресс = done_enabled / total_enabled.
  firstPassEnabled?: boolean;
  retestEnabled?: boolean;
  smokesEnabled?: boolean;
  firstPassDone?: boolean;
  retestDone?: boolean;
  smokesDone?: boolean;
  /** @deprecated используй firstPassDone/retestDone/smokesDone */
  goalDone?: boolean;
  parallel?: boolean; // разработка идёт параллельно с тестированием
  jiraStatus: JiraStatus; // мок live-статуса
  // Готовность из последнего отчёта QA. Две независимые шкалы:
  //  - firstPass: % первой проходки чек-листа (100 = проходка завершена);
  //  - retest: % ретестов после завершения первой проходки.
  // Если в отчёте процент не указан — поле не заполняется (на доске 0%).
  progress?: { firstPass?: number; retest?: number };
  links: {
    jira: string;
    checklist?: string;
    testChannel?: string; // ссылка на slack-канал теста эпика
  };
}

// Назначение: кто над чем работает + что именно делает.
export interface Assignment {
  memberId: string;
  epicKeys: string[];
  note?: string; // "первая проходка", "ретесты", "ознакомление"...
}

export interface Sprint {
  number: number;
  start: string; // ISO
  endInclusive: string; // ISO
  confluenceUrl: string;
}

const JIRA = "https://sprutgaming.atlassian.net/browse";

export const sprint: Sprint = {
  number: 10,
  start: "2026-06-16",
  endInclusive: "2026-06-29",
  confluenceUrl: "https://sprutgaming.atlassian.net/wiki/x/AYCeJw",
};

export const members: Member[] = [
  // --- CORE TEAM ---
  { id: "denisk", name: "Denis K", slackId: "U0A0JB7CF0D", team: "CORE", role: "Lead QA", jiraAccountId: "712020:ee5687c2-6ce1-441c-8427-8d0fcce3ae2d" },
  { id: "anton", name: "Anton K", slackId: "U0A3BD367H7", team: "CORE", jiraAccountId: "712020:1ca29cee-4e37-48a7-bec1-15b1752bc5b6" },
  { id: "yaroslav", name: "Yaroslav S", slackId: "U0A0FCLNR35", team: "CORE", jiraAccountId: "712020:2c182a5c-52d9-42ed-9b87-6db5b63a571d" },
  { id: "aleksey", name: "Aleksey Ch", slackId: "U0A0KNTM8ES", team: "CORE", jiraAccountId: "712020:6f0d7900-f940-4190-8460-80e739cf3524" },
  { id: "denisv", name: "Denis V", slackId: "U0AHRFQJX51", team: "CORE", role: "Зам", jiraAccountId: "712020:035ea27b-74ca-475c-ae6d-d0aa2b3d959d" },
  { id: "veronika", name: "Veronika S", slackId: "U0AH12E8ANN", team: "CORE", jiraAccountId: "712020:0f009a3a-57de-4d7f-9380-83d2f7e20e98" },
  { id: "daria", name: "Daria A", slackId: "U0A50DNBD1R", team: "CORE", jiraAccountId: "712020:826cca20-fb51-49d5-ba05-1fd1c055c2c1" },
  { id: "julia", name: "Julia T", slackId: "U0B1X5JUQP8", team: "CORE", role: "Trainee", jiraAccountId: "712020:bc0b6bf2-a3ee-4496-9d58-a23538bc975b" },
  { id: "natalia", name: "Natalia", slackId: "U0B7PUX9KHP", team: "CORE", jiraAccountId: "712020:67cfc971-97e9-41f6-ab15-40e3bf30a8be" },
  { id: "vasiliy", name: "Vasiliy K", slackId: "U0B9BAMGY2C", team: "CORE", jiraAccountId: "712020:32678de6-addb-473e-b98f-a699726cb523" },
  // --- eQA TEAM ---
  { id: "edvard", name: "Edvard K", slackId: "U0AP1L6RJKV", team: "eQA", shift: "19:00–01:00", jiraAccountId: "70121:26af151c-c55a-46af-8118-242eb32788fc" },
  { id: "alexander", name: "Alexander P", slackId: "U0B23TV8BBM", team: "eQA" },
  { id: "mariia", name: "Mariia M", slackId: "U0AQ5QB13AL", team: "eQA", shift: "18:00–23:00" },
  { id: "egor", name: "Egor", slackId: "U0APBKGJBT6", team: "eQA", shift: "20:00–00:00" },
  { id: "daniil", name: "Daniil I", slackId: "U0AQPTZQZJB", team: "eQA", shift: "12:00–17:00" },
];

export const epics: Epic[] = [
  // ===== CORE: план спринта 10 =====
  {
    key: "SD-6457",
    title: "Интеграция SMS провайдера MEX10",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 87 },
    links: { jira: `${JIRA}/SD-6457` },
  },
  {
    key: "SD-3881",
    title: "Авторизация через внешние сервисы или логин и пароль",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "block_tests",
    progress: { firstPass: 100, retest: 71.4 },
    links: { jira: `${JIRA}/SD-3881` },
  },
  {
    key: "BF-2209",
    title: "Вёрстка редизайна Профиля пользователя",
    goal: "Дальнейшая проходка по чек-листу.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 96 },
    links: { jira: `${JIRA}/BF-2209` },
  },
  {
    key: "SD-4988",
    title: "Управление группами аватаров",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 80 },
    links: { jira: `${JIRA}/SD-4988` },
  },
  {
    key: "SD-2460",    title: "Комплексное тестирование модуля Bonus Templates",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 20 },
    links: { jira: `${JIRA}/SD-2460`, testChannel: "https://sprutgamingtech.slack.com/archives/C0ATHE2F0KB" },
  },
  {
    key: "SD-2463",    title: "Комплексное тестирование Personal Bonuses",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 0 },
    links: { jira: `${JIRA}/SD-2463`, testChannel: "https://sprutgamingtech.slack.com/archives/C0ATHE2F0KB" },
  },
  {
    key: "SD-2462",    title: "Комплексное тестирование Cashback Bonus",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 99 },
    links: { jira: `${JIRA}/SD-2462` },
  },
  {
    key: "SD-6176",    title: "Комплексное тестирование Sportsbook cashback template",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 95 },
    links: { jira: `${JIRA}/SD-6176` },
  },
  {
    key: "SD-5870",
    title: "Комплексное тестирование Game Service",
    goal: "Завершить разработку, протестировать на стейдже и просмокать на демо.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "rf_release",
    progress: { firstPass: 100, retest: 100 },
    links: { jira: `${JIRA}/SD-5870` },
  },
  {
    key: "SD-2521",    title: "Комплексное тестирование модуля Sportsbook Personal Bonus",
    goal: "Ознакомление, формирование чек-листа, первая проходка.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100 },
    links: { jira: `${JIRA}/SD-2521` },
  },
  {
    key: "SD-2520",    title: "Комплексное тестирование модуля Sportsbook Bonus Template",
    goal: "Ознакомление, формирование чек-листа, первая проходка.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 96 },
    links: { jira: `${JIRA}/SD-2520` },
  },
  {
    key: "BF-2804",
    title: "Вёрстка редизайна Loyalty Program",
    goal: "Ретесты по доступным задачам.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 92 },
    links: { jira: `${JIRA}/BF-2804` },
  },
  {
    key: "BF-2145",
    title: "Обновление дизайна главной страницы",
    goal: "Ретесты (отработать по задачам, доступным для теста).",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 86 },
    links: { jira: `${JIRA}/BF-2145` },
  },
  {
    key: "BF-2809",
    title: "Вёрстка редизайна Achievements",
    goal: "Завершить разработку, протестировать на стейдже (первая проходка).",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 16 },
    links: { jira: `${JIRA}/BF-2809` },
  },
  {
    key: "BF-2970",
    title: "Fortune Wheel // Обновление колеса фортуны",
    goal: "Протестировать (первая проходка).",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100 },
    links: { jira: `${JIRA}/BF-2970` },
  },
  {
    key: "SD-3926",
    title: "DEV // Комплексное тестирование Fortune Wheel",
    goal: "Протестировать (первая проходка).",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    links: { jira: `${JIRA}/SD-3926` },
  },
  {
    key: "SD-4767",
    title: "Risk-Management — доработки и минорные баги",
    goal: "Проверить валидность задач и завершить разработку по оставшимся.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "qa_testing",
    progress: { firstPass: 100, retest: 90 },
    links: { jira: `${JIRA}/SD-4767`, testChannel: "https://sprutgamingtech.slack.com/archives/C0A8SDSP0TD" },
  },
  {
    key: "SD-2896",
    title: "Tournament Service // Миграция на Golang",
    goal: "Сделать смоки на демо.",
    priority: "highest",
    team: "CORE",
    goalDone: true,
    jiraStatus: "done",
    progress: { firstPass: 100, retest: 100 },
    links: { jira: `${JIRA}/SD-2896` },
  },
  {
    key: "SD-4081",
    title: "DEV: Комплексное тестирование Tournaments",
    goal: "Сделать смоки на демо.",
    priority: "highest",
    team: "CORE",
    goalDone: true,
    jiraStatus: "done",
    progress: { firstPass: 100, retest: 100 },
    links: { jira: `${JIRA}/SD-4081` },
  },
  // ===== Свободные (никому пока не назначены) =====
  {
    key: "SD-7002",
    title: "Stage // Kubernetes // Смок-тестирование Kubernetes",
    goal: "Смок-тестирование кубера на стейдже.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "block_tests",
    progress: { firstPass: 100 },
    links: { jira: `${JIRA}/SD-7002` },
  },
  {
    key: "BF-2816",
    title: "Редизайн карточки игры 1.0",
    goal: "Протестировать и закрыть эпик на стейдж.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "rf_qa",
    links: { jira: `${JIRA}/BF-2816` },
  },
  {
    key: "BF-2428",
    title: "Registration // Передавать captcha_token в /register и /attempt",
    goal: "Завершить разработку, протестировать на стейдже.",
    priority: "high",
    team: "CORE",
    jiraStatus: "rf_qa",
    links: { jira: `${JIRA}/BF-2428` },
  },
  {
    key: "SPS-424",
    title: "SEO: исправить технические ошибки на сайте",
    goal: "Протестировать SPS-427 и SPS-431.",
    priority: "highest",
    team: "CORE",
    jiraStatus: "analysis",
    progress: { firstPass: 100, retest: 50 },
    links: { jira: `${JIRA}/SPS-424` },
  },
  {
    key: "BF-3160",
    title: "BetHub // Проверить загрузку и обработку локали PT-BH",
    goal: "Закрыть фронт и протестировать.",
    priority: "high",
    team: "CORE",
    task: true,
    jiraStatus: "rf_release",
    links: { jira: `${JIRA}/BF-3160` },
  },
  // ===== Критбизнес =====
  {
    key: "BF-3193",
    title: "[Risk Service] Технические данные по срабатыванию Duplicates/Proxy",
    goal: "Проверить на стейдже; если ок — в готово. Взять при первой возможности.",
    priority: "highest",
    team: "CORE",
    critbusiness: true,
    task: true,
    goalDone: true,
    jiraStatus: "done",
    links: { jira: `${JIRA}/BF-3193` },
  },
  {
    key: "BR-18",
    title: "New project latina casino // Stage: Provider key connection",
    goal: "Протестировать и при необходимости доработать. Тест со стороны бизнеса.",
    priority: "highest",
    team: "CORE",
    critbusiness: true,
    task: true,
    goalDone: true,
    jiraStatus: "done",
    links: { jira: `${JIRA}/BR-18` },
  },
  // ===== eQA: вне доски SPRUT, сборка чек-листов + первая проходка =====
  {
    key: "BF-2806",
    title: "Вёрстка редизайна Jackpot",
    goal: "Собрать чек-лист, первая проходка с оформлением багов.",
    priority: "highest",
    team: "eQA",
    jiraStatus: "block_tests",
    links: { jira: `${JIRA}/BF-2806` },
  },
  {
    key: "BF-2807",
    title: "Вёрстка редизайна Tournaments",
    goal: "Собрать чек-лист, первая проходка с оформлением багов.",
    priority: "highest",
    team: "eQA",
    jiraStatus: "rf_qa",
    links: { jira: `${JIRA}/BF-2807`, checklist: "https://sprutgaming.atlassian.net/wiki/x/AQD9Jw" },
  },
  {
    key: "BF-2805",
    title: "Вёрстка редизайна VIP Club",
    goal: "Проверить чек-лист на актуальность, при необходимости дополнить; первая проходка.",
    priority: "highest",
    team: "eQA",
    jiraStatus: "qa_testing",
    links: { jira: `${JIRA}/BF-2805`, checklist: "https://sprutgaming.atlassian.net/wiki/x/A4CqIw" },
  },
];

// Распределение на сегодня (17/06). В проде редактируется в админке.
export const assignments: Assignment[] = [
  { memberId: "denisk", epicKeys: ["SD-7002", "BF-3160", "SPS-424", "BF-2816"], note: "смок Kubernetes + локаль PT-BH (BetHub) + SEO-тех. ошибки + редизайн карточки игры" },
  { memberId: "yaroslav", epicKeys: ["SD-2896", "SD-4081", "SD-4767"], note: "миграция + комплекс + доработки риска" },
  { memberId: "aleksey", epicKeys: ["SD-2460", "SD-2463"], note: "тест-эпика-бонусы" },
  { memberId: "denisv", epicKeys: ["SD-5870", "SD-2462", "SD-6176"], note: "комплекс game + кэшбэки" },
  { memberId: "veronika", epicKeys: ["BF-2209", "SD-4988", "SD-3881"], note: "дальнейшая проходка по чек-листу (связ. SD-3881 / SD-4988)" },
  { memberId: "daria", epicKeys: ["BF-2804", "BF-2145", "BF-2809"], note: "ретесты + первая проходка Achievements" },
  { memberId: "julia", epicKeys: ["SD-2520"], note: "ознакомление, чек-лист, первая проходка" },
  { memberId: "natalia", epicKeys: ["SD-2521"], note: "ознакомление, чек-лист, первая проходка" },
  { memberId: "vasiliy", epicKeys: ["SD-6457", "BF-2970", "SD-3926"], note: "" },
  // eQA
  { memberId: "edvard", epicKeys: ["BF-2806", "BF-2807", "BF-2805"], note: "сборка чек-листов + первая проходка" },
  { memberId: "mariia", epicKeys: ["BF-2806", "BF-2807", "BF-2805"], note: "сборка чек-листов + первая проходка" },
  { memberId: "egor", epicKeys: ["BF-2806", "BF-2807", "BF-2805"], note: "сборка чек-листов + первая проходка" },
  { memberId: "daniil", epicKeys: ["BF-2806", "BF-2807", "BF-2805"], note: "сборка чек-листов + первая проходка" },
];
