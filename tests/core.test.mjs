import test from "node:test";
import assert from "node:assert/strict";
import {
  createState, validateState, ensureMonth, monthlyEntries, monthlyTotals,
  setBudgets, installmentShare, matchPreset, shiftMonth
} from "../core.mjs";

test("current and historical months keep their own budget revision", () => {
  const state = createState();
  assert.equal(monthlyTotals(state, "2026-08").budgets.daily, 2000);
  setBudgets(state, "2026-09", { daily: 2500, state: 1200, growth: 1500, social: 1000, free: 2000 });
  assert.equal(monthlyTotals(state, "2026-08").budgets.daily, 2000);
  assert.equal(monthlyTotals(state, "2026-09").budgets.daily, 2500);
  assert.equal(monthlyTotals(state, "2026-10").budgets.daily, 2500);
});

test("manual entry edits and deletion recalculate pool balances", () => {
  const state = createState();
  const month = ensureMonth(state, "2026-09");
  month.records.push({ id: "one", name: "午饭", amount: 42, poolId: "daily", tagIds: [], date: "2026-09-23" });
  assert.equal(monthlyTotals(state, "2026-09").spent.daily, 42);
  assert.equal(monthlyTotals(state, "2026-09").budgets.daily - monthlyTotals(state, "2026-09").spent.daily, 1958);
  month.records[0].amount = 52;
  month.records[0].poolId = "social";
  assert.equal(monthlyTotals(state, "2026-09").spent.daily, 0);
  assert.equal(monthlyTotals(state, "2026-09").spent.social, 52);
  month.records = [];
  assert.equal(monthlyTotals(state, "2026-09").spent.social, 0);
});

test("fixed expense counts every active month while prior versions stay stable", () => {
  const state = createState();
  state.recurring.push({
    id: "codex", name: "Codex", amount: 680, poolId: "growth", tagIds: [],
    startDate: "2026-08-23", enabled: true,
    versions: [
      { from: "2026-08", to: "2026-08", name: "Codex", amount: 680, poolId: "growth", tagIds: [] },
      { from: "2026-09", to: null, name: "Codex", amount: 700, poolId: "growth", tagIds: [] }
    ]
  });
  assert.equal(monthlyTotals(state, "2026-08").spent.growth, 680);
  assert.equal(monthlyTotals(state, "2026-09").spent.growth, 700);
  assert.equal(monthlyTotals(state, "2026-10").spent.growth, 700);
  state.recurring[0].versions[1].to = "2026-09";
  assert.equal(monthlyTotals(state, "2026-10").spent.growth, 0);
  assert.equal(monthlyTotals(state, "2026-08").spent.growth, 680);
});

test("installments use monthly accrued amount and sum to the actual payment", () => {
  const state = createState();
  state.installments.push({ id: "internet", name: "网费", paidAmount: 1200, paidOn: "2026-09-23", months: 12, poolId: "daily", tagIds: [] });
  assert.equal(monthlyTotals(state, "2026-09").spent.daily, 100);
  assert.equal(monthlyTotals(state, "2026-10").spent.daily, 100);
  assert.equal(monthlyTotals(state, "2027-08").spent.daily, 100);
  assert.equal(monthlyTotals(state, "2027-09").spent.daily, 0);
  assert.equal(monthlyEntries(state, "2026-09")[0].paidAmount, 1200);
  assert.equal(monthlyEntries(state, "2026-09")[0].amount, 100);
  const shares = Array.from({ length: 3 }, (_, index) => installmentShare(100, 3, index));
  assert.deepEqual(shares, [33.34, 33.33, 33.33]);
  assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 100), 10000);
});

test("avoid tag total includes manual and automatic entries once", () => {
  const state = createState();
  ensureMonth(state, "2026-09").records.push({ id: "coat", name: "衣服", amount: 399, poolId: "free", tagIds: ["avoid"], date: "2026-09-23" });
  state.installments.push({ id: "gift", name: "礼物", paidAmount: 120, paidOn: "2026-09-10", months: 2, poolId: "social", tagIds: ["avoid"] });
  assert.equal(monthlyTotals(state, "2026-09").avoidable, 459);
  assert.equal(monthlyTotals(state, "2026-10").avoidable, 60);
});

test("preset matching and imported data validation", () => {
  const state = createState();
  assert.equal(matchPreset(state, "买 Codex 订阅"), "growth");
  assert.equal(matchPreset(state, "朋友晚餐"), "");
  assert.equal(validateState(state), state);
  ensureMonth(state, "2026-02").records.push({ id: "bad-date", name: "无效日期", amount: 1, poolId: "daily", tagIds: [], date: "2026-02-30" });
  assert.throws(() => validateState(state));
  state.months["2026-02"].records = [];
  ensureMonth(state, "2026-09").records.push({ id: "bad", name: "坏记录", amount: 1, poolId: "unknown", tagIds: [], date: "2026-09-23" });
  assert.throws(() => validateState(state));
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
