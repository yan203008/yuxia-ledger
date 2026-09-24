import test from "node:test";
import assert from "node:assert/strict";
import { createState, ensureMonth, startupRoute, validateState } from "../core.mjs";

test("current month follows calendar; list and fixed month retain their choices", () => {
  const state = createState();
  ensureMonth(state, "2026-09");
  assert.deepEqual(startupRoute(state, "2026-09"), { page: "month", month: "2026-09" });
  assert.deepEqual(startupRoute(state, "2026-10"), { page: "month", month: "2026-10" });
  state.startPage = { mode: "list" };
  assert.deepEqual(startupRoute(state, "2026-10"), { page: "home", month: "2026-10" });
  state.startPage = { mode: "month", month: "2026-09" };
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(startupRoute(restored, "2026-10"), { page: "month", month: "2026-09" });
  delete restored.months["2026-09"];
  assert.deepEqual(startupRoute(restored, "2026-10"), { page: "month", month: "2026-10" });
});

test("old backups and malformed preferences preserve ledger and default to current month", () => {
  for (const preference of [undefined, null, {}, { mode: "unknown" }, { mode: "month", month: "bad" }]) {
    const state = createState();
    ensureMonth(state, "2026-09").records.push({ id: "lunch", name: "午饭", amount: 42, poolId: "daily", tagIds: [], date: "2026-09-23" });
    state.startPage = preference;
    const restored = validateState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(restored.startPage, { mode: "current" });
    assert.equal(restored.months["2026-09"].records[0].amount, 42);
    assert.equal(startupRoute(restored, "2026-10").month, "2026-10");
  }
});
