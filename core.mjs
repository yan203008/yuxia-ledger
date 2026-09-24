export const POOLS = [
  { id: "daily", name: "日常生活", hint: "日常吃饭、通勤、日用品" },
  { id: "state", name: "状态投资", hint: "咖啡馆、工作与创作环境" },
  { id: "growth", name: "成长投入", hint: "学习、书籍、课程、生产力工具" },
  { id: "social", name: "社交关系", hint: "朋友聚餐、请客、礼物" },
  { id: "free", name: "自由消费", hint: "衣服、娱乐、旅行等可选消费" }
];

export const DEFAULT_BUDGETS = { daily: 2000, state: 1200, growth: 1500, social: 1000, free: 2000 };
export const POOL_IDS = new Set(POOLS.map(pool => pool.id));
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const monthOf = date => typeof date === "string" ? date.slice(0, 7) : [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0")].join("-");
export const todayLocal = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};
export function shiftMonth(month, offset) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return monthOf(date);
}
export function daysInMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number, 0).getDate();
}
export function monthDate(month, day) {
  return month + "-" + String(Math.min(day, daysInMonth(month))).padStart(2, "0");
}
export function endOfMonth(month) { return monthDate(month, 31); }
export function monthLabel(month) {
  const [year, number] = month.split("-");
  return year + "年" + Number(number) + "月";
}
export function createState() {
  return {
    version: 2,
    startPage: { mode: "current" },
    budgetHistory: [{ from: "0000-01", budgets: { ...DEFAULT_BUDGETS } }],
    months: {},
    tags: [{ id: "avoid", name: "可避免" }],
    presets: [
      { id: "preset-lunch", name: "午饭", keywords: ["午餐", "午饭"], poolId: "daily" },
      { id: "preset-metro", name: "地铁", keywords: ["地铁", "公交"], poolId: "daily" },
      { id: "preset-coffee", name: "咖啡", keywords: ["咖啡"], poolId: "state" },
      { id: "preset-codex", name: "Codex", keywords: ["Codex"], poolId: "growth" },
      { id: "preset-book", name: "书", keywords: ["书籍", "买书"], poolId: "growth" },
      { id: "preset-clothes", name: "衣服", keywords: ["衣服", "服装"], poolId: "free" }
    ],
    recurring: [],
    installments: []
  };
}
export function startupRoute(state, currentMonth) {
  const preference = state.startPage;
  if (preference?.mode === "list") return { page: "home", month: currentMonth };
  const selected = preference?.month;
  const month = preference?.mode === "month" && MONTH_RE.test(selected) &&
    selected <= currentMonth && Object.hasOwn(state.months, selected) ? selected : currentMonth;
  return { page: "month", month };
}
export function budgetsFor(state, month) {
  const revisions = [...state.budgetHistory].sort((a, b) => a.from.localeCompare(b.from));
  let budgets = revisions[0].budgets;
  for (const revision of revisions) if (revision.from <= month) budgets = revision.budgets;
  return budgets;
}
export function setBudgets(state, month, budgets) {
  const snapshot = Object.fromEntries(POOLS.map(pool => [pool.id, roundMoney(budgets[pool.id])]));
  state.budgetHistory = state.budgetHistory.filter(revision => revision.from !== month);
  state.budgetHistory.push({ from: month, budgets: snapshot });
  state.budgetHistory.sort((a, b) => a.from.localeCompare(b.from));
}
export function ensureMonth(state, month) {
  if (!MONTH_RE.test(month)) throw new Error("月份格式不正确");
  state.months[month] ||= { records: [], sortMode: "date-desc", filterPool: "all" };
  return state.months[month];
}
export function installmentShare(total, count, index) {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  return (base + (index < cents % count ? 1 : 0)) / 100;
}
export function monthlyEntries(state, month) {
  const manual = state.months[month]?.records || [];
  const fixed = state.recurring.flatMap(item => {
    const version = item.versions.findLast(rule => rule.from <= month && (!rule.to || month <= rule.to));
    if (!version) return [];
    return [{
      id: "fixed:" + item.id + ":" + month,
      sourceId: item.id,
      source: "fixed",
      name: version.name,
      amount: version.amount,
      poolId: version.poolId,
      tagIds: version.tagIds || [],
      date: monthDate(month, Number(item.startDate.slice(8))),
      createdAt: version.from + "-01T00:00:00"
    }];
  });
  const installments = state.installments.flatMap(item => {
    const index = (Number(month.slice(0, 4)) - Number(item.paidOn.slice(0, 4))) * 12 +
      Number(month.slice(5, 7)) - Number(item.paidOn.slice(5, 7));
    if (index < 0 || index >= item.months) return [];
    return [{
      id: "installment:" + item.id + ":" + month,
      sourceId: item.id,
      source: "installment",
      name: item.name,
      amount: installmentShare(item.paidAmount, item.months, index),
      paidAmount: item.paidAmount,
      poolId: item.poolId,
      tagIds: item.tagIds || [],
      date: index === 0 ? item.paidOn : month + "-01",
      createdAt: item.paidOn + "T00:00:00",
      installmentIndex: index + 1,
      installmentMonths: item.months
    }];
  });
  return [...manual.map(record => ({ ...record, source: "manual" })), ...fixed, ...installments];
}
export function monthlyTotals(state, month) {
  const entries = monthlyEntries(state, month);
  const spent = Object.fromEntries(POOLS.map(pool => [pool.id, 0]));
  let avoidable = 0;
  for (const entry of entries) {
    spent[entry.poolId] = roundMoney(spent[entry.poolId] + Number(entry.amount));
    if ((entry.tagIds || []).includes("avoid")) avoidable = roundMoney(avoidable + Number(entry.amount));
  }
  const budgets = budgetsFor(state, month);
  const total = roundMoney(Object.values(spent).reduce((sum, value) => sum + value, 0));
  const budgetTotal = roundMoney(Object.values(budgets).reduce((sum, value) => sum + value, 0));
  return { entries, spent, budgets, total, budgetTotal, remaining: roundMoney(budgetTotal - total), avoidable };
}
export function matchPreset(state, name) {
  const query = name.trim().toLowerCase();
  if (!query) return "";
  return state.presets.flatMap(preset => [preset.name, ...preset.keywords]
    .filter(Boolean).map(keyword => ({ keyword: keyword.toLowerCase(), poolId: preset.poolId })))
    .filter(item => query.includes(item.keyword) || item.keyword.includes(query))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0]?.poolId || "";
}
export function validateState(value) {
  const fail = () => { throw new Error("备份数据格式不正确"); };
  if (!value || value.version !== 2 || !Array.isArray(value.budgetHistory) ||
      !value.budgetHistory.length || !value.months || typeof value.months !== "object" ||
      !Array.isArray(value.tags) || !Array.isArray(value.presets) ||
      !Array.isArray(value.recurring) || !Array.isArray(value.installments)) fail();
  const validMoney = amount => typeof amount === "number" && Number.isFinite(amount) &&
    amount >= 0 && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7;
  const validDate = value => {
    if (!DATE_RE.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(value + "T12:00:00");
    return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === year &&
      parsed.getMonth() + 1 === month && parsed.getDate() === day;
  };
  const validPool = id => POOL_IDS.has(id);
  if (!value.budgetHistory.some(revision => revision.from === "0000-01")) fail();
  for (const revision of value.budgetHistory) {
    if (!MONTH_RE.test(revision.from) || !revision.budgets ||
        POOLS.some(pool => !validMoney(revision.budgets[pool.id]))) fail();
  }
  const tagIds = new Set();
  for (const tag of value.tags) {
    if (!tag.id || typeof tag.name !== "string" || !tag.name.trim() || tagIds.has(tag.id)) fail();
    tagIds.add(tag.id);
  }
  if (!tagIds.has("avoid")) fail();
  const validTags = ids => Array.isArray(ids) && ids.every(id => tagIds.has(id));
  for (const [month, data] of Object.entries(value.months)) {
    if (!MONTH_RE.test(month) || !data || !Array.isArray(data.records)) fail();
    for (const record of data.records) {
      if (!record.id || typeof record.name !== "string" || !record.name.trim() ||
          !validDate(record.date) || monthOf(record.date) !== month ||
          !validPool(record.poolId) || !validMoney(record.amount) || Number(record.amount) === 0 ||
          !validTags(record.tagIds)) fail();
    }
  }
  for (const preset of value.presets) {
    if (!preset.id || typeof preset.name !== "string" || !Array.isArray(preset.keywords) ||
        !validPool(preset.poolId)) fail();
  }
  for (const item of value.recurring) {
    if (!item.id || !item.name || !validDate(item.startDate) || typeof item.enabled !== "boolean" || !validMoney(item.amount) ||
        !validPool(item.poolId) || !validTags(item.tagIds) || !Array.isArray(item.versions)) fail();
    for (const rule of item.versions) {
      if (!MONTH_RE.test(rule.from) || (rule.to && !MONTH_RE.test(rule.to)) ||
          !rule.name || !validMoney(rule.amount) || Number(rule.amount) === 0 ||
          !validPool(rule.poolId) || !validTags(rule.tagIds)) fail();
    }
  }
  for (const item of value.installments) {
    if (!item.id || !item.name || !validDate(item.paidOn) ||
        !Number.isInteger(Number(item.months)) || Number(item.months) < 1 ||
        !validMoney(item.paidAmount) || Number(item.paidAmount) === 0 ||
        !validPool(item.poolId) || !validTags(item.tagIds)) fail();
  }
  const preference = value.startPage;
  value.startPage = preference?.mode === "list" ? { mode: "list" } :
    preference?.mode === "month" && MONTH_RE.test(preference.month) ?
      { mode: "month", month: preference.month } : { mode: "current" };
  return value;
}
