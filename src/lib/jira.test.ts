// src/lib/jira.test.ts
import { describe, it, expect } from "vitest";
import { fetchEpicsMeta, fetchRetestPct, isDoneStatus, mapStatus, extractQaAccountIds } from "./jira";

// Оффлайн: извлечение QA-тестеров из кастомных полей «QA» разных проектов.
// Регрессия: у LC своё поле customfield_12027 — его накрутки должны попадать
// в назначения, иначе LC-карточки навсегда остаются в пуле «Можно взять».
describe("extractQaAccountIds", () => {
  it("берёт accountId из поля QA проекта LC (customfield_12027)", () => {
    const fields = {
      customfield_12027: [{ accountId: "acc-lc-1" }, { accountId: "acc-lc-2" }],
    };
    expect(extractQaAccountIds(fields).sort()).toEqual(["acc-lc-1", "acc-lc-2"]);
  });

  it("объединяет поля QA всех проектов и дедупит", () => {
    const fields = {
      customfield_10721: [{ accountId: "a" }],
      customfield_12027: [{ accountId: "a" }, { accountId: "b" }],
    };
    expect(extractQaAccountIds(fields).sort()).toEqual(["a", "b"]);
  });

  it("пустой результат, если поля QA не заполнены", () => {
    expect(extractQaAccountIds({ assignee: { accountId: "dev" } })).toEqual([]);
  });
});

// Оффлайн (без сети): маппинг названий статусов Jira → наш enum.
// Регрессия: проект LC (team-managed) отдаёт русские имена статусов
// («Реопен», «Аналитика», «Беклог»), которые раньше молча падали в backlog.
describe("mapStatus", () => {
  it("русские статусы LC маппятся корректно", () => {
    expect(mapStatus("Реопен")).toBe("reopen");
    expect(mapStatus("Аналитика")).toBe("analysis");
    expect(mapStatus("Беклог")).toBe("backlog");
    expect(mapStatus("Готово к релизу")).toBe("rf_release");
  });

  it("реопен ловится в любом регистре и на латинице", () => {
    expect(mapStatus("реопен")).toBe("reopen");
    expect(mapStatus("Reopen")).toBe("reopen");
  });

  it("варианты R.F. Release с точками (SPS отдаёт «R.F. Release»)", () => {
    expect(mapStatus("R.F. Release")).toBe("rf_release");
    expect(mapStatus("R.F Release")).toBe("rf_release");
    expect(mapStatus("RF Release")).toBe("rf_release");
  });

  it("неизвестный статус падает в backlog", () => {
    expect(mapStatus("что-то новое")).toBe("backlog");
  });
});

// Оффлайн (без сети): регистронезависимый детект готовности.
describe("isDoneStatus", () => {
  it("true для done/rf_release в любом регистре и языке", () => {
    expect(isDoneStatus("done")).toBe(true);
    expect(isDoneStatus("DONE")).toBe(true);
    expect(isDoneStatus("Готово")).toBe(true);
    expect(isDoneStatus("готово")).toBe(true);
    expect(isDoneStatus("R.F Release")).toBe(true);
    expect(isDoneStatus("rf release")).toBe(true);
  });

  it("false для не-готовых статусов", () => {
    expect(isDoneStatus("QA testing")).toBe(false);
    expect(isDoneStatus("analysis")).toBe(false);
  });
});

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
