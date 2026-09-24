import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createState, ensureMonth } from "../core.mjs";

for (const startMode of ["current", "list"]) test(`startup ${startMode} and budget details preserve records`, async () => {
  const app = { innerHTML: "" };
  const sheet = { innerHTML: "" };
  const fileInput = { addEventListener() {} };
  const date = new Date();
  const currentMonth = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  const monthButton = { dataset: { month: currentMonth }, onclick: null };
  const toggleButton = { dataset: { action: "toggle-pools" }, onclick: null };
  const fixture = createState();
  fixture.startPage = { mode: startMode };
  ensureMonth(fixture, currentMonth).records.push({ id: "lunch", name: "日常消费", amount: 1200, poolId: "daily", tagIds: [], date: currentMonth + "-01" });
  globalThis.localStorage = { getItem: () => JSON.stringify(fixture), setItem() {} };
  globalThis.window = { scrollTo() {} };
  globalThis.document = {
    querySelector: selector => ({ "#app": app, "#sheet-root": sheet, "#import-file": fileInput })[selector] || null,
    querySelectorAll: selector => {
      if (selector === "[data-month]" && app.innerHTML.includes("data-month=")) return [monthButton];
      if (selector === "[data-action]" && app.innerHTML.includes('data-action="toggle-pools"')) return [toggleButton];
      return [];
    }
  };

  const source = (await readFile(new URL("../app.js", import.meta.url), "utf8"))
    .replace('"./core.mjs?v=26"', JSON.stringify(new URL("../core.mjs", import.meta.url).href));
  await import("data:text/javascript," + encodeURIComponent(source) + "#" + startMode);

  if (startMode === "list") {
    assert.equal((app.innerHTML.match(/class="month-row /g) || []).length, 1);
    assert.match(app.innerHTML, /新增月份/);
    monthButton.onclick();
  } else {
    assert.match(app.innerHTML, /＋ 记一笔/);
    assert.match(app.innerHTML, /‹ 月份/);
  }
  assert.doesNotMatch(app.innerHTML, /看见每一类还剩多少|月度倒扣记账|本月预算正在使用/);

  assert.match(app.innerHTML, new RegExp(currentMonth.replace("-", "") + " 预算池"));
  assert.doesNotMatch(app.innerHTML, /month-hero/);
  assert.match(app.innerHTML, /budget-compact/);
  assert.equal((app.innerHTML.match(/class="budget-row /g) || []).length, 5);
  assert.match(app.innerHTML, /60%/);
  assert.doesNotMatch(app.innerHTML, /class="pool-card /);
  const records = app.innerHTML.slice(app.innerHTML.indexOf('class="section-title records-title"'));

  toggleButton.onclick();
  assert.equal((app.innerHTML.match(/class="pool-card /g) || []).length, 5);
  assert.doesNotMatch(app.innerHTML, /class="budget-compact"/);
  assert.equal(app.innerHTML.slice(app.innerHTML.indexOf('class="section-title records-title"')), records);

  toggleButton.onclick();
  assert.match(app.innerHTML, /budget-compact/);
});
