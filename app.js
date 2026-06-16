const STORAGE_KEY = "yuxia-ledger-v1";
const today = () => new Date().toLocaleDateString("sv-SE");
const uid = () => crypto.randomUUID();
const currencies = {
  CNY: { label: "人民币", symbol: "¥" },
  IDR: { label: "印尼盾", symbol: "Rp" },
  USD: { label: "美元", symbol: "$" }
};
const defaultRates = { CNY: 1, USD: 6.81, IDR: 0.000376 };
const money = (value, currency = "CNY") => new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: currencies[currency] ? currency : "CNY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const defaultState = {
  projects: [],
  types: ["餐饮", "零食", "交通", "购物", "日用", "娱乐", "医疗", "其他"],
  presets: [
    { id: uid(), name: "奶茶", keywords: ["奶茶", "霸王茶姬", "喜茶"], type: "零食" },
    { id: uid(), name: "打车", keywords: ["打车", "滴滴", "出租车"], type: "交通" },
    { id: uid(), name: "午饭", keywords: ["午饭", "午餐"], type: "餐饮" }
  ]
};

let state = loadState();
let route = { page: "home", projectId: null };

function loadState() {
  try {
    const normalized = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  catch { return structuredClone(defaultState); }
}
function normalizeState(value) {
  if (!value || !Array.isArray(value.projects) || !Array.isArray(value.types) || !Array.isArray(value.presets)) throw new Error("Invalid data");
  value.projects.forEach(project => {
    if (!project.id || typeof project.name !== "string" || !Number.isFinite(Number(project.total)) || !Array.isArray(project.records)) throw new Error("Invalid project");
    const oldProjectCurrency = project.currency || "CNY";
    const baseRate = defaultRates[oldProjectCurrency] || 1;
    if (oldProjectCurrency !== "CNY" && !project.convertedToCny) {
      project.total = Number(project.total) * baseRate;
      project.records.forEach(record => { record.amount = Number(record.amount) * baseRate; });
      project.convertedToCny = true;
    }
    project.currency = "CNY";
    project.defaultCurrency = currencies[project.defaultCurrency] ? project.defaultCurrency : "IDR";
    project.archived = Boolean(project.archived);
    project.records.forEach(record => {
      if (!record.id || typeof record.name !== "string" || !Number.isFinite(Number(record.amount)) || typeof record.date !== "string") throw new Error("Invalid record");
      const supportedCurrency = currencies[record.currency] ? record.currency : "CNY";
      record.originalAmount = supportedCurrency === "CNY"
        ? Number(record.amount)
        : Number.isFinite(Number(record.originalAmount)) ? Number(record.originalAmount) : Number(record.amount);
      record.currency = supportedCurrency;
      record.paymentMethod = typeof record.paymentMethod === "string" ? record.paymentMethod : "";
    });
  });
  return value;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function remaining(project) { return project.total - project.records.reduce((sum, item) => sum + Number(item.amount), 0); }
function projectMoney(project, value) { return money(value, project.currency); }
function escapeHtml(value = "") { return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function formatDate(value) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function currencyOptions(selected = "CNY") { return Object.entries(currencies).map(([code, item]) => `<option value="${code}" ${code === selected ? "selected" : ""}>${item.label} · ${code}</option>`).join(""); }
function originalMoney(record, project) { return money(record.originalAmount ?? record.amount, record.currency || project.currency); }
function convertCurrency(amount, from, to) { return Number(amount || 0) * defaultRates[from] / defaultRates[to]; }
function rateHint(currency, rate, baseCurrency) {
  const unit = currency === "IDR" ? 100000 : 1;
  return `${currency} ${new Intl.NumberFormat("zh-CN").format(unit)} ≈ ${money(rate * unit, baseCurrency)}`;
}

const sortOptions = {
  "date-desc": "最新优先",
  "date-asc": "最早优先",
  "amount-desc": "金额从高到低",
  "amount-asc": "金额从低到高"
};

function sortedRecords(project, records = project.records) {
  const mode = project.sortMode || "date-desc";
  return [...records].sort((a, b) => {
    if (mode === "date-asc") return a.date.localeCompare(b.date);
    if (mode === "amount-desc") return Number(b.amount) - Number(a.amount);
    if (mode === "amount-asc") return Number(a.amount) - Number(b.amount);
    return b.date.localeCompare(a.date);
  });
}

function recordTypes(project) {
  return [...new Set(project.records.map(record => record.type || "未分类"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function filteredRecords(project) {
  const selected = project.filterType || "all";
  const records = selected === "all"
    ? project.records
    : project.records.filter(record => (record.type || "未分类") === selected);
  return sortedRecords(project, records);
}

function categoryStats(project) {
  const totals = new Map();
  project.records.forEach(record => {
    const type = record.type || "未分类";
    totals.set(type, (totals.get(type) || 0) + Number(record.amount));
  });
  const spent = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .map(([type, amount]) => ({ type, amount, percent: spent ? amount / spent * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function dailyStats(project) {
  const totals = new Map();
  project.records.forEach(record => totals.set(record.date, (totals.get(record.date) || 0) + Number(record.amount)));
  const recordDates = project.records.map(record => record.date).sort();
  const endText = recordDates.at(-1) > today() ? recordDates.at(-1) : today();
  const end = new Date(`${endText}T12:00:00`);
  const start = new Date(`${recordDates[0] || project.createdAt || today()}T12:00:00`);
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = cursor.toLocaleDateString("sv-SE");
    days.push({ date, amount: totals.get(date) || 0 });
  }
  return days;
}

function navigate(page, projectId = null) { route = { page, projectId }; closeSheet(); render(); scrollTo(0, 0); }
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1800); }

function render() {
  const app = document.querySelector("#app");
  if (route.page === "project") app.innerHTML = projectView();
  else if (route.page === "archive") app.innerHTML = archiveView();
  else if (route.page === "settings") app.innerHTML = settingsView();
  else app.innerHTML = homeView();
  bindPageEvents();
  const dailyScroll = document.querySelector(".daily-scroll");
  if (dailyScroll) requestAnimationFrame(() => requestAnimationFrame(() => {
    dailyScroll.scrollLeft = Math.max(0, dailyScroll.scrollWidth - dailyScroll.clientWidth);
  }));
}

function homeView() {
  const projects = state.projects.filter(project => !project.archived);
  const archivedCount = state.projects.length - projects.length;
  return `<main class="app-shell">
    <header class="topbar"><div><p class="eyebrow">我的资金计划</p><h1>余下</h1></div><button class="icon-button" data-action="settings" aria-label="设置">⚙︎</button></header>
    <section class="project-list">
      ${projects.length ? projects.map(project => {
        const left = remaining(project); const percent = Math.max(0, Math.min(100, left / project.total * 100));
        return `<button class="project-card" data-project="${project.id}"><div class="project-card-top"><div><h2>${escapeHtml(project.name)}</h2><span class="subtle">总额 ${projectMoney(project, project.total)}</span></div><div><div class="subtle">剩余</div><div class="balance">${projectMoney(project, left)}</div></div></div><div class="project-currency">${currencies[project.currency].label} · ${project.currency}</div><div class="progress"><span style="width:${percent}%"></span></div></button>`;
      }).join("") : `<div class="empty">还没有资金项目。<br>建立第一个项目后就可以开始记账。</div>`}
    </section>
    ${archivedCount ? `<button class="archive-entry" data-action="archive">已归档项目 <span>${archivedCount} ›</span></button>` : ""}
    <div class="fab-bar"><button class="primary" data-action="convert">货币换算</button><button class="primary" data-action="new-project">＋ 新增项目</button></div>
  </main>`;
}

function archiveView() {
  const projects = state.projects.filter(project => project.archived);
  return `<main class="app-shell">
    <header class="topbar"><button class="back-button" data-action="home">‹ 返回</button><h1 style="font-size:24px">已归档项目</h1><span style="width:42px"></span></header>
    <p class="page-note">归档只会从首页隐藏项目，账目仍然完整保留。</p>
    <section class="project-list archived-list">
      ${projects.length ? projects.map(project => `<div class="archived-card"><button data-project="${project.id}"><span><strong>${escapeHtml(project.name)}</strong><small>${projectMoney(project, remaining(project))} 剩余</small><small>创建于 ${formatDate(project.createdAt || today())}</small></span><span>›</span></button><button class="restore-button" data-restore="${project.id}">恢复</button></div>`).join("") : `<div class="empty">还没有归档项目。</div>`}
    </section>
  </main>`;
}

function projectView() {
  const project = state.projects.find(item => item.id === route.projectId);
  if (!project) { route = { page: "home", projectId: null }; return homeView(); }
  const records = filteredRecords(project);
  const types = recordTypes(project);
  const stats = categoryStats(project);
  const days = dailyStats(project);
  const maxDaily = Math.max(...days.map(day => day.amount), 1);
  const spent = project.total - remaining(project);
  return `<main class="app-shell">
    <header class="topbar"><button class="back-button" data-action="home">‹ 所有项目</button><button class="icon-button" data-action="edit-project" aria-label="编辑项目">•••</button></header>
    <section class="balance-card"><div class="label">${escapeHtml(project.name)} · 剩余 · ${project.currency}</div><div class="big-number">${projectMoney(project, remaining(project))}</div><div class="balance-meta"><span>总额 ${projectMoney(project, project.total)}</span><span>已用 ${projectMoney(project, project.total - remaining(project))}</span></div></section>
    <div class="section-title"><h2>消费记录</h2><div class="record-tools"><button class="sort-button" data-action="filter-records">${(project.filterType || "all") === "all" ? "全部分类" : escapeHtml(project.filterType)}⌄</button><button class="sort-button" data-action="sort-records">${sortOptions[project.sortMode || "date-desc"]}⌄</button></div></div>
    <div class="record-count">${records.length} 笔记录${(project.filterType || "all") !== "all" ? ` · ${escapeHtml(project.filterType)}` : ""}</div>
    ${records.length ? `<section class="record-list">${records.map(record => { const foreign = (record.currency || project.currency) !== project.currency; return `<button class="record" data-record="${record.id}"><span class="record-name">${escapeHtml(record.name)}</span><span class="record-amount">-${projectMoney(project, record.amount)}</span><span class="record-meta">${escapeHtml(record.type || "未分类")} · ${formatDate(record.date)}${record.paymentMethod ? ` · ${escapeHtml(record.paymentMethod)}` : ""}</span><span class="record-meta record-original">${foreign ? `原金额 ${originalMoney(record, project)}` : ""}</span></button>`; }).join("")}</section>` : `<div class="empty compact-empty">这个分类下还没有消费记录。</div>`}
    <div class="section-title"><h2>消费分类</h2><span class="subtle">共 ${projectMoney(project, spent)}</span></div>
    ${stats.length ? `<section class="dashboard-card">${stats.map((item, index) => `<div class="category-row"><div class="category-meta"><strong>${escapeHtml(item.type)}</strong><span>${projectMoney(project, item.amount)} · ${item.percent.toFixed(1)}%</span></div><div class="category-track"><span class="category-fill tone-${index % 5}" style="width:${item.percent}%"></span></div></div>`).join("")}</section>` : `<section class="dashboard-card dashboard-empty">还没有可统计的数据</section>`}
    <div class="section-title"><h2>每日消费</h2><span class="subtle">全部记录</span></div>
    <section class="daily-card">${project.records.length ? `<div class="daily-scroll"><div class="daily-chart">${days.map((day, index) => `<div class="daily-column" title="${day.date} ${projectMoney(project, day.amount)}"><span class="daily-value">${day.amount ? projectMoney(project, day.amount) : ""}</span><div class="daily-bar-wrap"><span class="daily-bar" style="height:${day.amount ? Math.max(5, day.amount / maxDaily * 100) : 0}%"></span></div><span class="daily-label">${index === 0 || index === days.length - 1 || day.date.endsWith("-01") ? formatDate(day.date) : new Date(`${day.date}T12:00:00`).getDate()}</span></div>`).join("")}</div></div>` : `<div class="dashboard-empty">还没有可展示的数据</div>`}</section>
    <div class="fab-bar"><button class="primary" data-action="new-record">＋ 记一笔</button></div>
  </main>`;
}

function settingsView() {
  return `<main class="app-shell">
    <header class="topbar"><button class="back-button" data-action="home">‹ 返回</button><h1 style="font-size:24px">设置</h1><span style="width:42px"></span></header>
    <section class="settings-section"><div class="section-title"><h2>消费类型</h2><button class="text-button" data-action="new-type">＋ 新增</button></div><p>记账时可以选择，也可以留空。</p><div class="pills">${state.types.map(type => `<button class="pill" data-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join("")}</div></section>
    <section class="settings-section"><div class="section-title"><h2>常用消费名称</h2><button class="text-button" data-action="new-preset">＋ 新增</button></div><p>关键词命中时自动填写关联类型。没有关联类型时保持空白。</p><div class="setting-card">${state.presets.length ? state.presets.map(preset => `<button class="setting-row" data-preset="${preset.id}"><span><strong>${escapeHtml(preset.name)}</strong><span class="subtle">${escapeHtml(preset.keywords.join("、") || "无关键词")}</span></span><span class="subtle">${escapeHtml(preset.type || "未关联")} ›</span></button>`).join("") : `<div class="empty" style="padding:35px 10px">还没有常用名称</div>`}</div></section>
    <section class="settings-section"><div class="section-title"><h2>数据</h2></div><p>账目只保存在当前设备。更换手机或清理浏览器数据前，请先导出备份。</p><div class="setting-card"><button class="setting-row" data-action="export"><span><strong>导出备份</strong><span class="subtle">保存为 JSON 文件</span></span><span>›</span></button><button class="setting-row" data-action="import"><span><strong>导入备份</strong><span class="subtle">从备份文件恢复数据</span></span><span>›</span></button></div></section>
  </main>`;
}

function bindPageEvents() {
  document.querySelectorAll("[data-project]").forEach(el => el.onclick = () => navigate("project", el.dataset.project));
  document.querySelectorAll("[data-restore]").forEach(el => el.onclick = () => {
    const project = state.projects.find(item => item.id === el.dataset.restore);
    if (!project) return;
    project.archived = false;
    saveState();
    render();
    toast("项目已恢复到首页");
  });
  document.querySelectorAll("[data-record]").forEach(el => el.onclick = () => openRecordSheet(el.dataset.record));
  document.querySelectorAll("[data-preset]").forEach(el => el.onclick = () => openPresetSheet(el.dataset.preset));
  document.querySelectorAll("[data-type]").forEach(el => el.onclick = () => openTypeSheet(el.dataset.type));
  document.querySelectorAll("[data-action]").forEach(el => {
    const action = el.dataset.action;
    if (action === "settings") el.onclick = () => navigate("settings");
    if (action === "home") el.onclick = () => navigate("home");
    if (action === "archive") el.onclick = () => navigate("archive");
    if (action === "convert") el.onclick = () => openConverterSheet();
    if (action === "new-project") el.onclick = () => openProjectSheet();
    if (action === "edit-project") el.onclick = () => openProjectSheet(route.projectId);
    if (action === "new-record") el.onclick = () => openRecordSheet();
    if (action === "filter-records") el.onclick = openFilterSheet;
    if (action === "sort-records") el.onclick = openSortSheet;
    if (action === "new-type") el.onclick = () => openTypeSheet();
    if (action === "new-preset") el.onclick = () => openPresetSheet();
    if (action === "export") el.onclick = exportData;
    if (action === "import") el.onclick = () => document.querySelector("#import-file").click();
  });
}

function sheet(title, fields, actions = "", className = "") {
  document.querySelector("#sheet-root").innerHTML = `<div class="sheet-backdrop ${className ? `${className}-backdrop` : ""}"><section class="sheet ${className}" role="dialog" aria-modal="true"><div class="grabber"></div><div class="sheet-head"><h2>${title}</h2><button class="close" data-close>×</button></div>${fields}${actions}</section></div>`;
  document.querySelector("[data-close]").onclick = closeSheet;
  document.querySelector(".sheet-backdrop").onclick = event => { if (event.target.classList.contains("sheet-backdrop")) closeSheet(); };
}
function closeSheet() { document.querySelector("#sheet-root").innerHTML = ""; }

function openSortSheet() {
  const project = state.projects.find(item => item.id === route.projectId);
  const selected = project.sortMode || "date-desc";
  sheet("记录排序", `<div class="choice-list">${Object.entries(sortOptions).map(([value, label]) => `<button class="choice-row ${value === selected ? "selected" : ""}" data-sort="${value}"><span>${label}</span><span>${value === selected ? "✓" : ""}</span></button>`).join("")}</div>`);
  document.querySelectorAll("[data-sort]").forEach(button => button.onclick = () => {
    project.sortMode = button.dataset.sort;
    saveState();
    closeSheet();
    render();
  });
}

function openFilterSheet() {
  const project = state.projects.find(item => item.id === route.projectId);
  const selected = project.filterType || "all";
  const options = [["all", "全部分类"], ...recordTypes(project).map(type => [type, type])];
  sheet("筛选消费分类", `<div class="choice-list">${options.map(([value, label]) => `<button class="choice-row ${value === selected ? "selected" : ""}" data-filter-choice="${escapeHtml(value)}"><span>${escapeHtml(label)}</span><span>${value === selected ? "✓" : ""}</span></button>`).join("")}</div>`);
  document.querySelectorAll("[data-filter-choice]").forEach(button => button.onclick = () => {
    project.filterType = button.dataset.filterChoice;
    saveState();
    closeSheet();
    render();
  });
}

function openProjectSheet(projectId = null) {
  const project = state.projects.find(item => item.id === projectId);
  sheet(project ? "项目设置" : "新增项目", `<form id="project-form"><label class="field"><span>项目名称</span><input name="name" required maxlength="30" value="${escapeHtml(project?.name || "")}" placeholder="例如：巴厘岛旅行"></label><label class="field"><span>总金额（人民币）</span><input name="total" required type="number" min="0" step="0.01" inputmode="decimal" value="${project?.total ?? ""}" placeholder="¥ 0"></label><div class="helper">所有项目统一使用人民币计算余额和统计</div><label class="field"><span>默认支付币种</span><select name="defaultCurrency">${currencyOptions(project?.defaultCurrency || "IDR")}</select></label><div class="helper">以后记一笔时会默认选中这个币种，仍可临时修改</div>${project ? `<section class="project-actions"><button class="secondary-action" type="button" data-archive>${project.archived ? "恢复到首页" : "归档项目"}<small>${project.archived ? "重新显示在首页" : "从首页隐藏，保留全部账目"}</small></button><button class="delete-action" type="button" data-delete>永久删除<small>同时删除项目内全部消费记录</small></button></section>` : ""}<div class="sheet-actions"><button class="primary" type="submit">保存</button></div></form>`);
  document.querySelector("#project-form").onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (project) {
      project.name = data.get("name").trim();
      project.total = Number(data.get("total"));
      project.defaultCurrency = data.get("defaultCurrency");
    } else {
      state.projects.push({ id: uid(), name: data.get("name").trim(), total: Number(data.get("total")), currency: "CNY", defaultCurrency: data.get("defaultCurrency"), createdAt: today(), archived: false, records: [] });
    }
    saveState();
    closeSheet();
    navigate(project ? "project" : "home", project?.id);
    toast("项目已保存");
  };
  if (project) {
    document.querySelector("[data-archive]").onclick = () => {
      project.archived = !project.archived;
      saveState();
      closeSheet();
      navigate(project.archived ? "home" : "project", project.archived ? null : project.id);
      toast(project.archived ? "项目已归档" : "项目已恢复");
    };
    document.querySelector("[data-delete]").onclick = () => {
      if (confirm(`确定永久删除“${project.name}”及其全部记录吗？此操作无法恢复。`)) {
        state.projects = state.projects.filter(item => item.id !== project.id);
        saveState();
        closeSheet();
        navigate(project.archived ? "archive" : "home");
      }
    };
  }
}

function openConverterSheet() {
  sheet("货币换算", `<form id="converter-form"><div class="converter-lines"><label class="converter-line"><span data-from-label>印尼盾 · IDR</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="输入金额"></label><div class="converter-line"><span data-to-label>人民币 · CNY</span><strong data-converter-result>¥0</strong></div></div><small class="converter-rate" data-converter-rate></small><button class="converter-settings-toggle" type="button" data-settings-toggle>设置货币</button><div class="converter-settings" data-converter-settings hidden><label class="field"><span>从</span><select name="from">${currencyOptions("IDR")}</select></label><label class="field"><span>换算到</span><select name="to">${currencyOptions("CNY")}</select></label><button class="secondary swap-button" type="button" data-swap>对调</button></div></form>`, "", "converter-sheet");
  const form = document.querySelector("#converter-form");
  const amountInput = form.elements.amount;
  const fromSelect = form.elements.from;
  const toSelect = form.elements.to;
  const result = form.querySelector("[data-converter-result]");
  const rate = form.querySelector("[data-converter-rate]");
  const fromLabel = form.querySelector("[data-from-label]");
  const toLabel = form.querySelector("[data-to-label]");
  const settings = form.querySelector("[data-converter-settings]");
  const update = () => {
    const converted = convertCurrency(Number(amountInput.value), fromSelect.value, toSelect.value);
    fromLabel.textContent = `${currencies[fromSelect.value].label} · ${fromSelect.value}`;
    toLabel.textContent = `${currencies[toSelect.value].label} · ${toSelect.value}`;
    result.textContent = amountInput.value ? money(converted, toSelect.value) : money(0, toSelect.value);
    rate.textContent = `${rateHint(fromSelect.value, defaultRates[fromSelect.value] / defaultRates[toSelect.value], toSelect.value)} · 固定参考汇率`;
  };
  amountInput.oninput = update;
  fromSelect.onchange = update;
  toSelect.onchange = update;
  form.querySelector("[data-settings-toggle]").onclick = () => {
    settings.hidden = !settings.hidden;
  };
  form.querySelector("[data-swap]").onclick = () => {
    const from = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = from;
    update();
  };
  update();
  setTimeout(() => amountInput.focus(), 100);
}

function findMatchedType(name) {
  const query = name.trim().toLowerCase();
  if (!query) return "";
  const candidates = state.presets.flatMap(preset => [preset.name, ...preset.keywords].filter(Boolean).map(keyword => ({ keyword: keyword.toLowerCase(), type: preset.type })));
  return candidates.filter(item => query.includes(item.keyword) || item.keyword.includes(query)).sort((a, b) => b.keyword.length - a.keyword.length)[0]?.type || "";
}

function typeOptions(selected = "") { return `<option value="">不选择</option>${state.types.map(type => `<option value="${escapeHtml(type)}" ${type === selected ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}`; }

function openRecordSheet(recordId = null) {
  const project = state.projects.find(item => item.id === route.projectId);
  const record = project.records.find(item => item.id === recordId);
  const recordCurrency = record?.currency || project.defaultCurrency || "IDR";
  const convertedAmount = record?.amount ?? "";
  const originalAmount = record?.originalAmount ?? record?.amount ?? "";
  sheet(record ? "编辑记录" : "记一笔", `<form id="record-form"><label class="field"><span>消费名称</span><input name="name" required maxlength="40" autocomplete="off" value="${escapeHtml(record?.name || "")}" placeholder="例如：巴厘岛晚餐"></label><label class="field"><span>消费类型</span><select name="type">${typeOptions(record?.type || "")}</select></label><div class="helper" data-match-helper>${record?.type ? "可以手动修改" : "匹配到预设时会自动填写，也可以留空"}</div><div class="amount-grid"><label class="field"><span>支付币种</span><select name="currency">${currencyOptions(recordCurrency)}</select></label><label class="field"><span>原始金额</span><input name="originalAmount" required type="number" min="0.01" step="0.01" inputmode="decimal" value="${originalAmount}" placeholder="0"></label></div><div data-conversion><label class="field"><span>折合 ${currencies[project.currency].label}（${project.currency}）</span><input name="amount" required type="number" min="0.01" step="0.01" inputmode="decimal" value="${convertedAmount}" placeholder="0"></label><div class="helper" data-rate-helper></div></div><label class="field"><span>支付方式（可不选）</span><select name="paymentMethod"><option value="">不选择</option>${["现金", "Visa", "Mastercard", "支付宝", "微信", "其他"].map(item => `<option value="${item}" ${record?.paymentMethod === item ? "selected" : ""}>${item}</option>`).join("")}</select></label><label class="field"><span>日期</span><input name="date" required type="date" value="${record?.date || today()}"></label><div class="helper">默认记录创建当天，可修改</div><div class="sheet-actions">${record ? `<button class="danger" type="button" data-delete>删除</button>` : ""}<button class="primary" type="submit">保存并扣减</button></div></form>`);
  const form = document.querySelector("#record-form");
  const nameInput = form.elements.name;
  const typeSelect = form.elements.type;
  const currencySelect = form.elements.currency;
  const originalInput = form.elements.originalAmount;
  const amountInput = form.elements.amount;
  const conversion = form.querySelector("[data-conversion]");
  const rateHelper = form.querySelector("[data-rate-helper]");
  let autoType = !record;
  let amountWasEdited = Boolean(record);
  nameInput.oninput = () => { if (!autoType) return; const matched = findMatchedType(nameInput.value); typeSelect.value = matched; document.querySelector("[data-match-helper]").textContent = matched ? `已根据消费名称匹配到“${matched}”` : "没有匹配预设，类型可以留空"; };
  typeSelect.onchange = () => { autoType = false; document.querySelector("[data-match-helper]").textContent = "已手动选择，不会被名称覆盖"; };
  const updateConversion = () => {
    const currency = currencySelect.value;
    const isBase = currency === project.currency;
    conversion.hidden = isBase;
    amountInput.required = !isBase;
    if (isBase) {
      amountInput.value = originalInput.value;
      rateHelper.textContent = "";
      return;
    }
    const rate = defaultRates[currency];
    if (!amountWasEdited && rate && originalInput.value) amountInput.value = (Number(originalInput.value) * rate).toFixed(2).replace(/\.00$/, "");
    rateHelper.textContent = `按固定参考汇率估算：${rateHint(currency, rate, project.currency)}，可修改`;
  };
  currencySelect.onchange = () => { amountWasEdited = false; updateConversion(); };
  originalInput.oninput = updateConversion;
  amountInput.oninput = () => { amountWasEdited = true; };
  updateConversion();
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form);
    const currency = data.get("currency");
    const original = Number(data.get("originalAmount"));
    const converted = currency === project.currency ? original : Number(data.get("amount"));
    const next = { id: record?.id || uid(), name: data.get("name").trim(), type: data.get("type"), currency, originalAmount: original, amount: converted, paymentMethod: data.get("paymentMethod"), date: data.get("date") };
    if (record) Object.assign(record, next); else project.records.push(next);
    saveState();
    closeSheet();
    render();
    toast(record ? "记录已修改，余额已重算" : `已记录 ${next.name} ${projectMoney(project, next.amount)}`);
  };
  if (record) document.querySelector("[data-delete]").onclick = () => { if (confirm("确定删除这笔记录吗？金额会加回余额。")) { project.records = project.records.filter(item => item.id !== record.id); saveState(); closeSheet(); render(); toast("记录已删除，金额已加回"); } };
  setTimeout(() => nameInput.focus(), 100);
}

function openTypeSheet(oldType = "") {
  sheet(oldType ? "编辑消费类型" : "新增消费类型", `<form id="type-form"><label class="field"><span>类型名称</span><input name="name" required maxlength="12" value="${escapeHtml(oldType)}" placeholder="例如：宠物"></label><div class="sheet-actions">${oldType ? `<button class="danger" type="button" data-delete>删除</button>` : ""}<button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#type-form"); form.onsubmit = event => { event.preventDefault(); const name = new FormData(form).get("name").trim(); if (!oldType && state.types.includes(name)) return toast("这个类型已经存在"); if (oldType) { state.types = state.types.map(item => item === oldType ? name : item); state.presets.forEach(item => { if (item.type === oldType) item.type = name; }); state.projects.forEach(project => { project.records.forEach(item => { if (item.type === oldType) item.type = name; }); if (project.filterType === oldType) project.filterType = name; }); } else state.types.push(name); saveState(); closeSheet(); render(); };
  if (oldType) document.querySelector("[data-delete]").onclick = () => { if (confirm(`删除“${oldType}”类型吗？已有记录会变为未分类。`)) { state.types = state.types.filter(item => item !== oldType); state.presets.forEach(item => { if (item.type === oldType) item.type = ""; }); state.projects.forEach(project => { project.records.forEach(item => { if (item.type === oldType) item.type = ""; }); if (project.filterType === oldType) project.filterType = "all"; }); saveState(); closeSheet(); render(); } };
}

function openPresetSheet(presetId = null) {
  const preset = state.presets.find(item => item.id === presetId);
  sheet(preset ? "编辑常用名称" : "新增常用名称", `<form id="preset-form"><label class="field"><span>常用消费名称</span><input name="name" required maxlength="30" value="${escapeHtml(preset?.name || "")}" placeholder="例如：奶茶"></label><label class="field"><span>识别关键词（用逗号分隔）</span><input class="keyword-box" name="keywords" value="${escapeHtml(preset?.keywords.join("，") || "")}" placeholder="奶茶，霸王茶姬，喜茶"></label><label class="field"><span>关联消费类型（可不选）</span><select name="type">${typeOptions(preset?.type || "")}</select></label><div class="sheet-actions">${preset ? `<button class="danger" type="button" data-delete>删除</button>` : ""}<button class="primary" type="submit">保存</button></div></form>`);
  const form = document.querySelector("#preset-form"); form.onsubmit = event => { event.preventDefault(); const data = new FormData(form); const next = { id: preset?.id || uid(), name: data.get("name").trim(), keywords: data.get("keywords").split(/[，,]/).map(item => item.trim()).filter(Boolean), type: data.get("type") }; if (preset) Object.assign(preset, next); else state.presets.push(next); saveState(); closeSheet(); render(); toast("预设已保存"); };
  if (preset) document.querySelector("[data-delete]").onclick = () => { state.presets = state.presets.filter(item => item.id !== preset.id); saveState(); closeSheet(); render(); };
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `余下备份-${today()}.json`; link.click(); URL.revokeObjectURL(url); toast("备份已导出");
}

document.querySelector("#import-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    if (!confirm("导入备份会覆盖当前全部数据，确定继续吗？")) return;
    state = imported;
    saveState();
    navigate("home");
    toast("备份已恢复");
  } catch {
    toast("无法读取这个备份文件");
  } finally {
    event.target.value = "";
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
render();
