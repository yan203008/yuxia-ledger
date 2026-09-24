import { POOLS, POOL_IDS, MONTH_RE, DATE_RE, monthOf, todayLocal, shiftMonth, endOfMonth, monthLabel, createState, startupRoute, budgetsFor, setBudgets, ensureMonth, monthlyEntries, monthlyTotals, matchPreset, validateState, roundMoney } from "./core.mjs?v=26";

const STORAGE_KEY = "yuxia-monthly-v1";
const money = value => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(Number(value) || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const uid = () => crypto.randomUUID();
const nowMonth = () => monthOf(new Date());
const poolName = id => POOLS.find(pool => pool.id === id)?.name || "";
const dateLabel = date => Number(date.slice(5, 7)) + "月" + Number(date.slice(8)) + "日";
const sortModes = { "date-desc": "日期：最新优先", "date-asc": "日期：最早优先", "amount-desc": "金额：从高到低", "amount-asc": "金额：从低到高" };

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? validateState(JSON.parse(saved)) : createState();
  } catch { return createState(); }
}
let state = loadState();
let route = startupRoute(state, nowMonth());
let settingsReturn = "home";
let poolsExpanded = false;
const currentMonthWasMissing = !state.months[nowMonth()];
ensureMonth(state, nowMonth());
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
if (currentMonthWasMissing) save();
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}
function closeSheet() { document.querySelector("#sheet-root").innerHTML = ""; }
function sheet(title, body) {
  document.querySelector("#sheet-root").innerHTML = `<div class="sheet-backdrop"><section class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="close" data-close aria-label="关闭">×</button></div>${body}</section></div>`;
  document.querySelector("[data-close]").onclick = closeSheet;
  document.querySelector(".sheet-backdrop").onclick = event => { if (event.target.classList.contains("sheet-backdrop")) closeSheet(); };
}
function navigate(page, month = route.month) {
  if (page === "settings") settingsReturn = route.page === "month" ? "month" : "home";
  if (page === "month" && (route.page !== "month" || route.month !== month)) poolsExpanded = false;
  route = { page, month };
  if (page === "month") ensureMonth(state, month);
  closeSheet(); render(); window.scrollTo(0, 0);
}
function poolOptions(selected = "daily") {
  return POOLS.map(pool => `<option value="${pool.id}" ${selected === pool.id ? "selected" : ""}>${pool.name}</option>`).join("");
}
function tagChecks(selected = [], skipAvoid = false) {
  return state.tags.filter(tag => !skipAvoid || tag.id !== "avoid").map(tag => `<label class="tag-choice"><input type="checkbox" name="tag" value="${esc(tag.id)}" ${selected.includes(tag.id) ? "checked" : ""}><span>#${esc(tag.name)}</span></label>`).join("");
}
const selectedTags = form => [...form.querySelectorAll('input[name="tag"]:checked')].map(input => input.value);
function tagText(ids = []) {
  return ids.map(id => state.tags.find(tag => tag.id === id)?.name).filter(Boolean).map(name => "#" + esc(name)).join(" ");
}
function render() {
  document.querySelector("#app").innerHTML = route.page === "month" ? monthView(route.month) : route.page === "settings" ? settingsView() : homeView();
  bindEvents();
}
function monthList() {
  const current = nowMonth();
  if (!state.months[current]) { ensureMonth(state, current); save(); }
  return Object.keys(state.months).filter(month => MONTH_RE.test(month) && month <= current).sort().reverse();
}
function homeView() {
  const current = nowMonth();
  return `<main class="app-shell"><header class="topbar"><h1>余下</h1><button class="icon-button" data-action="settings" aria-label="设置">⚙︎</button></header>
    <section class="month-list">${monthList().map(month => `<button class="month-row ${month === current ? "current" : ""}" data-month="${month}"><strong>${monthLabel(month)}</strong><span class="month-row-right">${month === current ? "进行中" : money(monthlyTotals(state, month).total)} <b>›</b></span></button>`).join("")}</section>
    <div class="fab-bar"><button class="primary" data-action="new-month">＋ 新增月份</button></div></main>`;
}
function sortEntries(entries, mode) {
  const list = [...entries];
  if (mode === "amount-desc") list.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
  else if (mode === "amount-asc") list.sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date));
  else if (mode === "date-asc") list.sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  else list.sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return list;
}
function recordRow(entry) {
  const source = entry.source === "fixed" ? "固定消费" : entry.source === "installment" ? `分摊 ${entry.installmentIndex}/${entry.installmentMonths}` : "";
  const details = [poolName(entry.poolId), source, tagText(entry.tagIds)].filter(Boolean).join(" · ");
  return `<button class="record" data-record="${esc(entry.id)}" data-source="${entry.source}"><span class="record-name">${esc(entry.name)}</span><span class="record-amount">−${money(entry.amount)}</span><span class="record-meta">${details}</span><span class="record-meta record-date">${dateLabel(entry.date)}</span></button>`;
}
function recordList(entries, mode) {
  if (!entries.length) return '<div class="empty compact-empty">还没有消费记录。</div>';
  if (mode.startsWith("amount")) return `<section class="record-list">${entries.map(recordRow).join("")}</section>`;
  const groups = new Map();
  entries.forEach(entry => { if (!groups.has(entry.date)) groups.set(entry.date, []); groups.get(entry.date).push(entry); });
  return [...groups.entries()].map(([date, group]) => `<div class="date-heading">${dateLabel(date)}</div><section class="record-list">${group.map(recordRow).join("")}</section>`).join("");
}
function fullPoolCards(summary) {
  return POOLS.map(pool => {
    const used = summary.spent[pool.id], budget = summary.budgets[pool.id], left = roundMoney(budget - used);
    const ratio = budget ? used / budget : used ? 1 : 0;
    const share = summary.total ? Math.round(used / summary.total * 100) : 0;
    return `<button class="pool-card ${ratio >= 1 ? "over" : ratio >= .8 ? "near" : ""}" data-pool="${pool.id}"><div class="pool-top"><strong>${pool.name}</strong><span>${money(used)} / ${money(budget)}</span></div><div class="pool-balance">${left < 0 ? "超出 " + money(Math.abs(left)) : "剩余 " + money(left)}</div><div class="pool-share">占本月支出 ${share}%</div><div class="progress"><span style="width:${Math.min(100, Math.max(0, ratio * 100))}%"></span></div></button>`;
  }).join("");
}
function compactPools(summary) {
  return `<section class="budget-compact" aria-label="各预算池使用进度">${POOLS.map(pool => {
    const used = summary.spent[pool.id], budget = summary.budgets[pool.id];
    const ratio = budget ? used / budget : used ? 1 : 0;
    const percent = budget ? Math.round(ratio * 100) + "%" : used ? "超额" : "0%";
    return `<div class="budget-row ${ratio >= 1 ? "over" : ratio >= .8 ? "near" : ""}"><span class="budget-row-name">${pool.name}</span><div class="budget-row-track" role="progressbar" aria-label="${pool.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(ratio * 100))}"><span style="width:${Math.min(100, Math.max(0, ratio * 100))}%"></span></div><strong class="budget-row-percent">${percent}</strong></div>`;
  }).join("")}</section>`;
}
function monthView(month) {
  const past = month < nowMonth();
  const summary = monthlyTotals(state, month);
  const data = ensureMonth(state, month);
  const entries = data.filterPool === "all" ? summary.entries : summary.entries.filter(item => item.poolId === data.filterPool);
  const sorted = sortEntries(entries, data.sortMode || "date-desc");
  return `<main class="app-shell"><header class="topbar"><button class="back-button" data-action="home">‹ 月份</button><button class="icon-button" data-action="settings" aria-label="设置">⚙︎</button></header>
    <div class="section-title budget-title"><h1>${month.replace("-", "")} 预算池</h1><button class="budget-toggle" data-action="toggle-pools" aria-expanded="${poolsExpanded}" aria-label="${poolsExpanded ? "收起" : "展开"}全部预算池"><span class="budget-triangle ${poolsExpanded ? "open" : ""}"></span></button></div>
    ${poolsExpanded ? `<section class="pool-list">${fullPoolCards(summary)}</section>` : compactPools(summary)}
    ${past ? `<section class="review-card"><h2>${Number(month.slice(5))}月总结</h2><div class="review-grid"><div><small>总支出</small><strong>${money(summary.total)}</strong></div><div><small>总预算</small><strong>${money(summary.budgetTotal)}</strong></div><div><small>${summary.remaining < 0 ? "超支" : "结余"}</small><strong>${money(Math.abs(summary.remaining))}</strong></div></div><p>#可避免 ${money(summary.avoidable)}</p></section>` : ""}
    ${!past && summary.avoidable ? `<p class="avoidable-note">#可避免 ${money(summary.avoidable)}</p>` : ""}
    <div class="section-title records-title"><h2>消费记录</h2><span class="subtle">${entries.length} 笔</span></div>
    <div class="record-tools"><button class="sort-button" data-action="filter">${data.filterPool === "all" ? "全部预算池" : poolName(data.filterPool)}⌄</button><button class="sort-button" data-action="sort">${sortModes[data.sortMode || "date-desc"]}⌄</button></div>
    ${recordList(sorted, data.sortMode || "date-desc")}
    <div class="fab-bar"><button class="primary" data-action="new-record">＋ 记一笔</button></div></main>`;
}
function fixedIsActive(item) { return item.enabled; }
function installmentStatus(item) {
  const current = nowMonth(), start = monthOf(item.paidOn);
  const elapsed = (Number(current.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(current.slice(5, 7)) - Number(start.slice(5, 7));
  return elapsed < 0 ? "尚未开始" : elapsed >= item.months ? "已完成" : `还剩 ${item.months - elapsed} 个月（含本月）`;
}
function settingsView() {
  const budgets = budgetsFor(state, nowMonth());
  return `<main class="app-shell settings-page"><header class="topbar"><button class="back-button" data-action="back-month">‹ 返回</button><h1>设置</h1><span style="width:42px"></span></header>
    <section class="settings-section"><div class="section-title"><h2>打开时显示</h2></div><div class="setting-card"><button class="setting-row" data-action="startup"><strong>${state.startPage?.mode === "list" ? "月份列表" : state.startPage?.mode === "month" ? esc(monthLabel(state.startPage.month)) : "当前月份"}</strong><span>修改 ›</span></button></div></section>
    <section class="settings-section"><div class="section-title"><h2>预算设置</h2><button class="text-button" data-action="budget">修改</button></div><p>修改本月与以后月份的额度，过去月份保持原样。</p><div class="setting-card">${POOLS.map(pool => `<div class="setting-row static-row"><span><strong>${pool.name}</strong><span class="subtle">${pool.hint}</span></span><b>${money(budgets[pool.id])}</b></div>`).join("")}</div></section>
    <section class="settings-section"><div class="section-title"><h2>固定消费</h2><button class="text-button" data-action="new-fixed">＋ 新增</button></div><p>启用后每个月自动计入对应预算池。</p><div class="setting-card">${state.recurring.length ? state.recurring.map(item => `<button class="setting-row" data-fixed="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><span class="subtle">${poolName(item.poolId)} · ${fixedIsActive(item) ? "已启用" : "已停用"}</span></span><span>${money(item.amount)} ›</span></button>`).join("") : '<div class="setting-empty">还没有固定消费</div>'}</div></section>
    <section class="settings-section"><div class="section-title"><h2>分摊消费</h2><button class="text-button" data-action="new-installment">＋ 新增</button></div><p>实际支付一次，预算按月计入。</p><div class="setting-card">${state.installments.length ? state.installments.map(item => `<button class="setting-row" data-installment="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><span class="subtle">${poolName(item.poolId)} · ${installmentStatus(item)}</span></span><span>${money(item.paidAmount)} / ${item.months}月 ›</span></button>`).join("") : '<div class="setting-empty">还没有分摊消费</div>'}</div></section>
    <section class="settings-section"><div class="section-title"><h2>Tag 管理</h2><button class="text-button" data-action="new-tag">＋ 新增</button></div><div class="pills">${state.tags.map(tag => `<button class="pill" data-tag="${esc(tag.id)}">#${esc(tag.name)}</button>`).join("")}</div></section>
    <section class="settings-section"><div class="section-title"><h2>常用消费</h2><button class="text-button" data-action="new-preset">＋ 新增</button></div><p>输入名称命中关键词时，自动选择预算池。</p><div class="setting-card">${state.presets.length ? state.presets.map(preset => `<button class="setting-row" data-preset="${esc(preset.id)}"><span><strong>${esc(preset.name)}</strong><span class="subtle">${esc(preset.keywords.join("、") || "无关键词")}</span></span><span>${poolName(preset.poolId)} ›</span></button>`).join("") : '<div class="setting-empty">还没有常用消费</div>'}</div></section>
    <section class="settings-section"><div class="section-title"><h2>数据</h2></div><p>账目只保存在当前浏览器。更换设备前请导出 JSON 备份。</p><div class="setting-card"><button class="setting-row" data-action="export"><strong>导出备份</strong><span>›</span></button><button class="setting-row" data-action="import"><strong>导入备份</strong><span>›</span></button></div></section></main>`;
}
function bindEvents() {
  document.querySelectorAll("[data-month]").forEach(button => button.onclick = () => navigate("month", button.dataset.month));
  document.querySelectorAll("[data-pool]").forEach(button => button.onclick = () => {
    const month = ensureMonth(state, route.month);
    month.filterPool = month.filterPool === button.dataset.pool ? "all" : button.dataset.pool;
    save(); render(); document.querySelector(".records-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelectorAll("[data-record]").forEach(button => button.onclick = () => button.dataset.source === "manual" ? openRecordSheet(button.dataset.record) : openGeneratedDetail(button.dataset.record));
  document.querySelectorAll("[data-fixed]").forEach(button => button.onclick = () => openFixedSheet(button.dataset.fixed));
  document.querySelectorAll("[data-installment]").forEach(button => button.onclick = () => openInstallmentDetail(button.dataset.installment));
  document.querySelectorAll("[data-tag]").forEach(button => button.onclick = () => openTagSheet(button.dataset.tag));
  document.querySelectorAll("[data-preset]").forEach(button => button.onclick = () => openPresetSheet(button.dataset.preset));
  document.querySelectorAll("[data-action]").forEach(button => button.onclick = () => {
    const action = button.dataset.action;
    if (action === "home") navigate("home");
    else if (action === "settings") navigate("settings");
    else if (action === "back-month") navigate(settingsReturn, route.month);
    else if (action === "new-month") openMonthSheet();
    else if (action === "toggle-pools") { poolsExpanded = !poolsExpanded; render(); }
    else if (action === "new-record") openRecordSheet();
    else if (action === "sort") openChoiceSheet("sort");
    else if (action === "filter") openChoiceSheet("filter");
    else if (action === "startup") openStartupSheet();
    else if (action === "budget") openBudgetSheet();
    else if (action === "new-fixed") openFixedSheet();
    else if (action === "new-installment") openInstallmentSheet();
    else if (action === "new-tag") openTagSheet();
    else if (action === "new-preset") openPresetSheet();
    else if (action === "export") exportData();
    else if (action === "import") document.querySelector("#import-file").click();
  });
}
function openStartupSheet() {
  const preference = state.startPage || { mode: "current" };
  const selectedMonth = preference.month || route.month;
  sheet("打开时显示", `<form id="startup-form">
    <label class="field"><span>默认展示</span><select name="mode">${[["current", "当前月份（自动跟随月份）"], ["list", "月份列表"], ["month", "指定月份"]].map(([value, label]) => `<option value="${value}" ${preference.mode === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label class="field" id="startup-month-field" ${preference.mode === "month" ? "" : "hidden"}><span>选择月份</span><select name="month">${monthList().map(month => `<option value="${month}" ${selectedMonth === month ? "selected" : ""}>${monthLabel(month)}</option>`).join("")}</select></label>
    <p class="helper">下次打开生效。当前月份会自动切换到新的自然月。</p>
    <div class="sheet-actions"><button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#startup-form");
  form.elements.mode.onchange = () => {
    document.querySelector("#startup-month-field").hidden = form.elements.mode.value !== "month";
  };
  form.onsubmit = event => {
    event.preventDefault();
    const mode = form.elements.mode.value, month = form.elements.month.value;
    if (!["current", "list", "month"].includes(mode)) return;
    if (mode === "month" && !monthList().includes(month)) return toast("请选择已有月份");
    state.startPage = mode === "month" ? { mode, month } : { mode };
    save(); closeSheet(); render(); toast("默认展示已保存，下次打开生效");
  };
}
function openMonthSheet() {
  sheet("新增月份", `<form id="month-form"><label class="field"><span>选择月份</span><input name="month" required type="month" max="${nowMonth()}" value="${shiftMonth(nowMonth(), -1)}"></label><div class="sheet-actions"><button class="primary" type="submit">进入月份</button></div></form>`);
  document.querySelector("#month-form").onsubmit = event => {
    event.preventDefault();
    const month = new FormData(event.currentTarget).get("month");
    if (!MONTH_RE.test(month) || month > nowMonth()) return toast("请选择本月或过去的月份");
    const existed = Boolean(state.months[month]);
    ensureMonth(state, month);
    save();
    navigate("month", month);
    if (existed) toast("已打开这个月份");
  };
}
function openChoiceSheet(kind) {
  const month = ensureMonth(state, route.month);
  const choices = kind === "sort" ? Object.entries(sortModes) : [["all", "全部预算池"], ...POOLS.map(pool => [pool.id, pool.name])];
  const selected = kind === "sort" ? month.sortMode : month.filterPool;
  sheet(kind === "sort" ? "记录排序" : "筛选预算池", `<div class="choice-list">${choices.map(([id, name]) => `<button class="choice-row ${selected === id ? "selected" : ""}" data-choice="${id}">${name}<span>${selected === id ? "✓" : ""}</span></button>`).join("")}</div>`);
  document.querySelectorAll("[data-choice]").forEach(button => button.onclick = () => {
    if (kind === "sort") month.sortMode = button.dataset.choice;
    else month.filterPool = button.dataset.choice;
    save(); closeSheet(); render();
  });
}
function openRecordSheet(id = null) {
  const month = ensureMonth(state, route.month);
  const record = month.records.find(item => item.id === id);
  const defaultDate = route.month === nowMonth() ? todayLocal() : endOfMonth(route.month);
  const tags = record?.tagIds || [];
  sheet(record ? "编辑消费" : "记一笔", `<form id="record-form">
    <label class="field quick-amount"><span>金额 · 人民币</span><input name="amount" required type="number" min="0.01" step="0.01" inputmode="decimal" value="${record?.amount ?? ""}" placeholder="0.00"></label>
    <label class="field"><span>消费名称</span><input name="name" required maxlength="40" autocomplete="off" value="${esc(record?.name || "")}" placeholder="例如：午饭"></label>
    <label class="field"><span>预算池</span><select name="poolId">${poolOptions(record?.poolId || "daily")}</select></label>
    <label class="tag-choice quick-tag"><input type="checkbox" name="tag" value="avoid" ${tags.includes("avoid") ? "checked" : ""}><span>#可避免</span></label>
    <details class="extra-fields" ${record && (record.date !== defaultDate || tags.some(tag => tag !== "avoid")) ? "open" : ""}><summary>日期和更多 Tag</summary>
      <label class="field"><span>日期</span><input name="date" required type="date" min="${route.month}-01" max="${endOfMonth(route.month)}" value="${record?.date || defaultDate}"></label>
      <div class="tag-list">${tagChecks(tags, true)}</div></details>
    <div class="sheet-actions">${record ? '<button class="danger" type="button" data-delete>删除</button>' : ""}<button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#record-form");
  let autoPool = !record;
  form.elements.name.oninput = () => { if (!autoPool) return; form.elements.poolId.value = matchPreset(state, form.elements.name.value) || "daily"; };
  form.elements.poolId.onchange = () => { autoPool = false; };
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form), amount = Number(data.get("amount")), date = data.get("date");
    if (!Number.isFinite(amount) || amount <= 0 || !DATE_RE.test(date) || monthOf(date) !== route.month) return toast("请检查金额和日期");
    const next = { id: record?.id || uid(), name: data.get("name").trim(), amount: roundMoney(amount), poolId: data.get("poolId"), tagIds: selectedTags(form), date, createdAt: record?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (!next.name || !POOL_IDS.has(next.poolId)) return toast("请填写名称和预算池");
    if (record) Object.assign(record, next); else month.records.push(next);
    save(); closeSheet(); render(); toast(record ? "记录已修改" : "已记下 " + next.name);
  };
  if (record) form.querySelector("[data-delete]").onclick = () => {
    if (!confirm("确定删除这笔消费吗？金额会回到对应预算池。")) return;
    month.records = month.records.filter(item => item.id !== record.id);
    save(); closeSheet(); render(); toast("记录已删除，预算已恢复");
  };
  setTimeout(() => form.elements.amount.focus(), 80);
}
function openBudgetSheet() {
  const budgets = budgetsFor(state, nowMonth());
  sheet("设置月度预算", `<form id="budget-form">${POOLS.map(pool => `<label class="field"><span>${pool.name}</span><input name="${pool.id}" required type="number" min="0" step="0.01" inputmode="decimal" value="${budgets[pool.id]}"></label>`).join("")}<p class="helper">修改从本月起生效，过去月份的预算不变。</p><div class="sheet-actions"><button class="primary" type="submit">保存预算</button></div></form>`);
  document.querySelector("#budget-form").onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = Object.fromEntries(POOLS.map(pool => [pool.id, Number(data.get(pool.id))]));
    if (Object.values(next).some(value => !Number.isFinite(value) || value < 0)) return toast("请输入正确预算");
    setBudgets(state, nowMonth(), next); save(); closeSheet(); render(); toast("本月预算已更新");
  };
}
function activeRule(item) { return [...item.versions].reverse().find(rule => !rule.to); }
function closeCurrentRule(item) {
  const rule = activeRule(item);
  if (!rule) return;
  if (rule.from >= nowMonth()) item.versions = item.versions.filter(version => version !== rule);
  else rule.to = shiftMonth(nowMonth(), -1);
}
function openFixedSheet(id = null) {
  const item = state.recurring.find(entry => entry.id === id);
  const active = item ? item.enabled : false;
  sheet(item ? "编辑固定消费" : "新增固定消费", `<form id="fixed-form">
    <label class="field"><span>名称</span><input name="name" required maxlength="40" value="${esc(item?.name || "")}" placeholder="例如：Codex"></label>
    <label class="field"><span>每月金额</span><input name="amount" required type="number" min="0.01" step="0.01" inputmode="decimal" value="${item?.amount ?? ""}"></label>
    <label class="field"><span>预算池</span><select name="poolId">${poolOptions(item?.poolId || "growth")}</select></label>
    ${item ? `<p class="helper">开始于 ${esc(item.startDate)}；修改从本月起生效。</p>` : `<label class="field"><span>开始日期</span><input name="startDate" required type="date" value="${todayLocal()}"></label>`}
    <div class="tag-list">${tagChecks(item?.tagIds || [])}</div>
    <div class="sheet-actions"><button class="primary" type="submit">保存</button></div>
    ${item ? `<div class="secondary-actions"><button type="button" data-toggle-fixed>${active ? "停用：从本月起不再计入" : "重新启用"}</button><button type="button" data-delete-fixed>永久删除</button></div>` : ""}</form>`);
  const form = document.querySelector("#fixed-form");
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form), name = data.get("name").trim(), amount = Number(data.get("amount")), poolId = data.get("poolId"), tagIds = selectedTags(form);
    if (!name || !Number.isFinite(amount) || amount <= 0 || !POOL_IDS.has(poolId)) return toast("请检查固定消费信息");
    if (item) {
      const effectiveMonth = active && activeRule(item)?.from > nowMonth() ? activeRule(item).from : nowMonth();
      if (active) closeCurrentRule(item);
      Object.assign(item, { name, amount: roundMoney(amount), poolId, tagIds });
      if (active) item.versions.push({ from: effectiveMonth, to: null, name, amount: roundMoney(amount), poolId, tagIds });
    } else {
      const startDate = data.get("startDate");
      if (!DATE_RE.test(startDate)) return toast("请选择开始日期");
      state.recurring.push({ id: uid(), name, amount: roundMoney(amount), poolId, tagIds, startDate, enabled: true, versions: [{ from: monthOf(startDate), to: null, name, amount: roundMoney(amount), poolId, tagIds }] });
    }
    save(); closeSheet(); render(); toast("固定消费已保存");
  };
  if (item) {
    form.querySelector("[data-toggle-fixed]").onclick = () => {
      if (active) closeCurrentRule(item);
      else item.versions.push({ from: nowMonth(), to: null, name: item.name, amount: item.amount, poolId: item.poolId, tagIds: item.tagIds || [] });
      item.enabled = !active;
      save(); closeSheet(); render(); toast(active ? "固定消费已停用" : "固定消费已启用");
    };
    form.querySelector("[data-delete-fixed]").onclick = () => {
      if (!confirm("永久删除固定消费及其在所有月份的自动记录吗？")) return;
      state.recurring = state.recurring.filter(entry => entry.id !== item.id);
      save(); closeSheet(); render(); toast("固定消费已删除");
    };
  }
}
function openInstallmentSheet() {
  sheet("新增分摊消费", `<form id="installment-form">
    <label class="field"><span>名称</span><input name="name" required maxlength="40" placeholder="例如：网费"></label>
    <label class="field"><span>实际支付金额</span><input name="paidAmount" required type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="1200"></label>
    <label class="field"><span>支付日期</span><input name="paidOn" required type="date" value="${todayLocal()}"></label>
    <label class="field"><span>分摊月数</span><input name="months" required type="number" min="1" max="120" step="1" inputmode="numeric" value="12"></label>
    <label class="field"><span>预算池</span><select name="poolId">${poolOptions("daily")}</select></label><div class="tag-list">${tagChecks()}</div>
    <div class="sheet-actions"><button class="primary" type="submit">建立分摊</button></div></form>`);
  const form = document.querySelector("#installment-form");
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form), name = data.get("name").trim(), paidAmount = Number(data.get("paidAmount")), months = Number(data.get("months")), paidOn = data.get("paidOn"), poolId = data.get("poolId");
    if (!name || !Number.isFinite(paidAmount) || paidAmount <= 0 || !Number.isInteger(months) || months < 1 || months > 120 || !DATE_RE.test(paidOn) || !POOL_IDS.has(poolId)) return toast("请检查分摊信息");
    state.installments.push({ id: uid(), name, paidAmount: roundMoney(paidAmount), paidOn, months, poolId, tagIds: selectedTags(form) });
    save(); closeSheet(); render(); toast("分摊已建立");
  };
}
function openInstallmentDetail(id) {
  const item = state.installments.find(entry => entry.id === id);
  if (!item) return;
  sheet("分摊消费", `<div class="detail-lines"><strong>${esc(item.name)}</strong><p>实际支付：${money(item.paidAmount)} · ${esc(item.paidOn)}</p><p>分摊：${item.months} 个月 · ${poolName(item.poolId)}</p><p>${installmentStatus(item)}</p></div><div class="sheet-actions"><button class="danger" data-delete-installment>删除分摊</button><button class="primary" data-close-detail>完成</button></div>`);
  document.querySelector("[data-close-detail]").onclick = closeSheet;
  document.querySelector("[data-delete-installment]").onclick = () => {
    if (!confirm("删除后所有月份的这笔分摊记录都会移除，确定吗？")) return;
    state.installments = state.installments.filter(entry => entry.id !== id);
    save(); closeSheet(); render(); toast("分摊已删除");
  };
}
function openGeneratedDetail(id) {
  const entry = monthlyEntries(state, route.month).find(item => item.id === id);
  if (!entry) return;
  const text = entry.source === "fixed" ? "固定消费 · 每月自动计入" : `分摊消费 · 第 ${entry.installmentIndex}/${entry.installmentMonths} 个月`;
  sheet(entry.name, `<div class="detail-lines"><strong>本月计入 ${money(entry.amount)}</strong><p>${text}</p><p>预算池：${poolName(entry.poolId)}</p>${entry.source === "installment" ? `<p>实际支付 ${money(entry.paidAmount)}，分月扣减预算。</p>` : ""}</div><div class="sheet-actions"><button class="primary" data-go-settings>到设置中管理</button></div>`);
  document.querySelector("[data-go-settings]").onclick = () => navigate("settings");
}
function openTagSheet(id = null) {
  const tag = state.tags.find(item => item.id === id);
  if (id === "avoid") { sheet("默认 Tag", '<p class="helper">#可避免 用于月度复盘，始终保留。</p>'); return; }
  sheet(tag ? "编辑 Tag" : "新增 Tag", `<form id="tag-form"><label class="field"><span>Tag 名称</span><input name="name" required maxlength="20" value="${esc(tag?.name || "")}" placeholder="例如：衣服"></label><div class="sheet-actions">${tag ? '<button class="danger" type="button" data-delete-tag>删除</button>' : ""}<button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#tag-form");
  form.onsubmit = event => {
    event.preventDefault();
    const name = new FormData(form).get("name").trim().replace(/^#/, "");
    if (!name || state.tags.some(item => item.name === name && item.id !== id)) return toast("Tag 名称已存在或为空");
    if (tag) tag.name = name; else state.tags.push({ id: uid(), name });
    save(); closeSheet(); render();
  };
  if (tag) form.querySelector("[data-delete-tag]").onclick = () => {
    if (!confirm("删除这个 Tag 吗？已有消费上的标记也会移除。")) return;
    state.tags = state.tags.filter(item => item.id !== id);
    Object.values(state.months).forEach(month => month.records.forEach(record => { record.tagIds = (record.tagIds || []).filter(tagId => tagId !== id); }));
    state.recurring.forEach(item => { item.tagIds = (item.tagIds || []).filter(tagId => tagId !== id); item.versions.forEach(rule => { rule.tagIds = (rule.tagIds || []).filter(tagId => tagId !== id); }); });
    state.installments.forEach(item => { item.tagIds = (item.tagIds || []).filter(tagId => tagId !== id); });
    save(); closeSheet(); render();
  };
}
function openPresetSheet(id = null) {
  const preset = state.presets.find(item => item.id === id);
  sheet(preset ? "编辑常用消费" : "新增常用消费", `<form id="preset-form"><label class="field"><span>消费名称</span><input name="name" required maxlength="30" value="${esc(preset?.name || "")}" placeholder="例如：咖啡"></label><label class="field"><span>识别关键词（用逗号分隔）</span><input name="keywords" value="${esc(preset?.keywords.join("，") || "")}" placeholder="咖啡，拿铁"></label><label class="field"><span>默认预算池</span><select name="poolId">${poolOptions(preset?.poolId || "daily")}</select></label><div class="sheet-actions">${preset ? '<button class="danger" type="button" data-delete-preset>删除</button>' : ""}<button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#preset-form");
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form);
    const next = { id: preset?.id || uid(), name: data.get("name").trim(), keywords: data.get("keywords").split(/[，,]/).map(item => item.trim()).filter(Boolean), poolId: data.get("poolId") };
    if (!next.name || !POOL_IDS.has(next.poolId)) return toast("请检查常用消费信息");
    if (preset) Object.assign(preset, next); else state.presets.push(next);
    save(); closeSheet(); render(); toast("常用消费已保存");
  };
  if (preset) form.querySelector("[data-delete-preset]").onclick = () => {
    if (!confirm("删除这个常用消费吗？已有记录不会改变。")) return;
    state.presets = state.presets.filter(item => item.id !== id);
    save(); closeSheet(); render();
  };
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "余下月度备份-" + todayLocal() + ".json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast("备份已导出");
}
document.querySelector("#import-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = validateState(JSON.parse(await file.text()));
    if (!confirm("导入备份会覆盖当前全部月度数据，确定继续吗？")) return;
    state = imported; ensureMonth(state, nowMonth()); save(); navigate("home", nowMonth()); toast("备份已导入");
  } catch { toast("无法读取备份；请使用新版月度账本导出的 JSON"); }
  finally { event.target.value = ""; }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
render();
