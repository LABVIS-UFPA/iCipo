import {fmtDate, normalizeStr} from '../../core/utils.mjs';
import { storage } from '../../infrastructure/storage.mjs';

let state = null;
// Incremental token to guard against out-of-order async renders
let renderToken = 0;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatResearchers(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean).join(', ');
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean).join(', ');
  }
  return '';
}

// ======= Categories & Highlighted Links (moved from options) =======
function normalizeUrl(url) {
  return (url || "").replace(/[\?\&]casa\_token=\S+/i, "");
}

function getLuminanceFromHex(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = (hex || '').replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}


function normalizeHexColor(value, fallback = "") {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map(ch => ch + ch).join("")}`.toUpperCase();
  }
  return fallback;
}

function hexToRgba(hex, alpha = 0.12) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "transparent";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function getPaperCategory(paper, highlightedLinks = {}) {
  const categories = Array.isArray(state?.project?.categories) ? state.project.categories : [];
  const tags = Array.isArray(paper?.tags)
    ? paper.tags.map(tag => String(tag).trim().toLowerCase()).filter(Boolean)
    : [];

  const categoryByTag = categories.find(cat => {
    const label = String(cat?.label || "").trim().toLowerCase();
    const title = String(cat?.title || "").trim().toLowerCase();
    return (label && tags.includes(label)) || (title && tags.includes(title));
  });
  if (categoryByTag) return categoryByTag;

  const normalizedPaperUrl = normalizeUrl(paper?.url || "");
  let resolvedColor = "";
  for (const [url, color] of Object.entries(highlightedLinks || {})) {
    if (normalizeUrl(url) === normalizedPaperUrl) {
      resolvedColor = normalizeHexColor(color);
      break;
    }
  }

  if (!resolvedColor) {
    resolvedColor = normalizeHexColor(paper?.highlightedColor || paper?.highlightColor || paper?.color);
  }

  if (!resolvedColor) return null;
  return categories.find(cat => normalizeHexColor(cat?.color) === resolvedColor) || null;
}

function getPaperCategoryKey(category) {
  return String(category?.label || category?.title || "").trim();
}

function getPaperCategoryColor(paper, highlightedLinks = {}) {
  const category = getPaperCategory(paper, highlightedLinks);
  if (category) return normalizeHexColor(category.color);

  const normalizedPaperUrl = normalizeUrl(paper?.url || "");
  for (const [url, color] of Object.entries(highlightedLinks || {})) {
    if (normalizeUrl(url) === normalizedPaperUrl) {
      const normalized = normalizeHexColor(color);
      if (normalized) return normalized;
    }
  }

  return normalizeHexColor(paper?.highlightedColor || paper?.highlightColor || paper?.color);
}

function syncCategoryFilterOptions() {
  const select = document.getElementById("f_category");
  if (!select) return;

  const previous = select.value || "all";
  const categories = [...(Array.isArray(state?.project?.categories) ? state.project.categories : [])]
    .sort((a, b) => String(a?.title || a?.label || "").localeCompare(String(b?.title || b?.label || "")));

  select.innerHTML = `
    <option value="all">Categoria: todas</option>
    <option value="uncategorized">Sem categoria</option>
  `;

  for (const category of categories) {
    const key = getPaperCategoryKey(category);
    if (!key) continue;
    const option = document.createElement("option");
    option.value = key;
    option.textContent = category.title || category.label || key;
    select.appendChild(option);
  }

  select.value = Array.from(select.options).some(option => option.value === previous) ? previous : "all";
}

function loadCategories() {
  const categoryList = document.getElementById("categoryList");
  if (!categoryList) return;

  categoryList.innerHTML = "";
  const project = state && state.project ? state.project : null;

  const rawCats = Array.isArray(project?.categories) ? project.categories : [];
  
  // Copy to avoid mutating original data during sort, which can cause issues with state management and rendering
  const items = [...rawCats];

  items.sort((a, b) => String(a.title).localeCompare(String(b.title)));

  function persistProjectAndReload() {
    if (!project || !project.id) return;
    console.log('Persisting project changes...', project);
    // Save using Project wrapper for compatibility with remote storage
    storage.saveProject(project).then(() => {
      loadCategories();
    }).catch((e) => {
      console.warn('saveProject failed', e);
      alert("Não foi possível salvar as categorias. As alterações não foram aplicadas.");
      loadCategories();
    });
  }

  for (const cat of items) {
    const category = cat.title;
    const categoryLabel = cat.label;
    const color = cat.color || "#ffffff";

    const li = document.createElement("li");
    li.style.backgroundColor = color;

    const left = document.createElement("div");
    left.className = "left";

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.style.backgroundColor = color;

    const textWrap = document.createElement("div");
    textWrap.style.minWidth = "0";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = category;

    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = cat.description || "";

    textWrap.appendChild(title);
    if (sub.textContent) textWrap.appendChild(sub);

    left.appendChild(pill);
    left.appendChild(textWrap);

    const right = document.createElement("div");
    right.className = "right";

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = color;
    meta.style.fontFamily = "monospace";
    meta.style.fontSize = "12px";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("icipo:edit-category", { detail: { label: categoryLabel } }));
    });

    const btn = document.createElement("button");
    btn.textContent = "Excluir";
    btn.addEventListener("click", () => {
      if (!confirm(`Excluir a categoria "${category}"?`)) return;
      try {
        project.removeCategory(categoryLabel);
        persistProjectAndReload();
      } catch (error) {
        alert(error?.message || "Não foi possível excluir a categoria.");
      }
    });

    const textColor = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";
    title.style.color = textColor;
    meta.style.color = textColor;
    editBtn.style.color = textColor;
    btn.style.color = textColor;
    if (textColor === "#000") {
      editBtn.classList.add("dark");
      btn.classList.add("dark");
    }

    right.appendChild(meta);
    right.appendChild(editBtn);
    right.appendChild(btn);

    li.appendChild(left);
    li.appendChild(right);

    categoryList.appendChild(li);
  }

  chrome.runtime.sendMessage({ action: "updateContextMenu" });
}

async function deleteMarkedLink(urlToDelete, done) {
  const target = normalizeUrl(urlToDelete);
  const data = await storage.get(["highlightedLinks", "svat_papers"]);
  const highlightedLinks = (data && data.highlightedLinks) ? data.highlightedLinks : {};

  for (const k of Object.keys(highlightedLinks)) {
    const nk = normalizeUrl(k);
    if (k === urlToDelete || nk === target || nk.startsWith(target) || target.startsWith(nk)) {
      delete highlightedLinks[k];
    }
  }

  const papers = Array.isArray(data && data.svat_papers) ? data.svat_papers : [];
  const papersToDelete = [
    ...papers.filter((p) => normalizeUrl(p?.url) === target).map((p) => p.id),
    ...(state?.papers || []).filter((p) => normalizeUrl(p?.url) === target).map((p) => p.id),
  ].filter(Boolean);

  const filteredPapers = papers.filter((p) => normalizeUrl(p?.url) !== target);

  for (const paperId of [...new Set(papersToDelete)]) {
    await storage.deletePaper(paperId).catch((e) => console.warn('deletePaper failed:', e));
  }

  await storage.set({ highlightedLinks, svat_papers: filteredPapers });
  if (state && Array.isArray(state.papers)) {
    state.papers = state.papers.filter((p) => normalizeUrl(p?.url) !== target);
  }
  if (done) done();
}

function loadHighlightedLinks() {
  const highlightedList = document.getElementById("highlightedList");
  if (!highlightedList) return;
  storage.get(["highlightedLinks", "svat_papers"]).then((data) => {
    const links = (data && data.highlightedLinks) ? data.highlightedLinks : {};
    const papers = Array.isArray(data && data.svat_papers) ? data.svat_papers : [];
    renderHighlighted(links, papers);
  });

  function renderHighlighted(links, papers) {
    highlightedList.innerHTML = "";
    const titleByUrl = new Map();
    for (const p of papers || []) {
      const nu = normalizeUrl(p?.url);
      if (!nu) continue;
      const t = (p?.title || "").trim();
      if (t) titleByUrl.set(nu, t);
    }

    const q = (document.getElementById('highlightSearch')?.value || "").trim().toLowerCase();

    const items = Object.keys(links || {})
      .map((url) => {
        const nurl = normalizeUrl(url);
        const title = titleByUrl.get(nurl) || "";
        return { url, nurl, title, color: links[url] };
      })
      .filter((it) => {
        if (!q) return true;
        return (it.url || "").toLowerCase().includes(q) || (it.title || "").toLowerCase().includes(q);
      });

    const removeBtn = document.getElementById('removeLinks');
    if (removeBtn) removeBtn.style.display = items.length ? "inline-block" : "none";

    for (const it of items) {
      const li = document.createElement("li");
      li.style.backgroundColor = it.color;
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "8px";
      li.style.padding = "6px";

      const linkWrap = document.createElement("div");
      linkWrap.style.flex = "1";
      linkWrap.style.display = "flex";
      linkWrap.style.flexDirection = "column";
      linkWrap.style.gap = "2px";

      const a = document.createElement("a");
      a.href = it.url;
      a.textContent = it.title ? it.title : it.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.style.fontWeight = it.title ? "600" : "400";
      a.style.overflowWrap = "anywhere";
      a.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

      const urlSmall = document.createElement("div");
      if (it.title) {
        urlSmall.textContent = it.url;
        urlSmall.style.fontSize = "12px";
        urlSmall.style.opacity = "0.85";
        urlSmall.style.overflowWrap = "anywhere";
      }

      linkWrap.appendChild(a);
      if (it.title) linkWrap.appendChild(urlSmall);

      const meta = document.createElement("span");
      meta.textContent = it.color;
      meta.style.fontFamily = "monospace";
      meta.style.fontSize = "12px";
      meta.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

      const btn = document.createElement("button");
      btn.textContent = "Excluir";
      btn.addEventListener("click", () => {
        if (!confirm("Excluir este link marcado?")) return;
        deleteMarkedLink(it.url, () => loadHighlightedLinks());
      });
      btn.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";
      if (getLuminanceFromHex(it.color) >= 0.5) btn.classList.add("dark");

      li.appendChild(linkWrap);
      li.appendChild(meta);
      li.appendChild(btn);

      highlightedList.appendChild(li);
    }
  }
}

function toggleNoActiveProjectNotice(show) {
  const el = document.getElementById('noActiveProjectNotice');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function toggleServerOfflineNotice(show) {
  const el = document.getElementById('serverOfflineNotice');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function isConnectionError(res, err) {
  if (err) return true;
  if (!res) return false;
  if (res.status === 'error') return true;
  const msg = (res.message || res.error || '').toString().toLowerCase();
  return msg.includes('not connected') || msg.includes('websocket') || msg.includes('offline') || msg.includes('timeout');
}

async function loadState() {
  const baseState = {
    project: {},
    papers: [],
  };

  state = baseState;

  return new Promise((resolve, reject) => {
    storage.getActiveProject().then(async (res) => {

      if(!res) throw new Error("No active project");

      let project = res;
      let papers = [];
      if (project.id) {
        const papersRes = await storage.listPapers(project.id);
        if (Array.isArray(papersRes)) papers = papersRes;
        else if (papersRes?.data && Array.isArray(papersRes.data)) papers = papersRes.data;
      }

      state = { project, papers };
      toggleServerOfflineNotice(false);
      toggleNoActiveProjectNotice(false);
      resolve(state);

    }).catch((err) => {
      console.log('getActiveProject failed', err);
      if(err.message === "No active project"){
        state = baseState;
        toggleServerOfflineNotice(false);
        toggleNoActiveProjectNotice(true);
        resolve(baseState);
      }else if(err.message === "WebSocket not connected"){
        state = baseState;
        toggleServerOfflineNotice(true); 
        toggleNoActiveProjectNotice(false);
        resolve(baseState);
      }else{
        reject(err);
      }
      
    }); 
  });

  
}

function setActiveView(view) {
  $$(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("hidden", v.id !== `view_${view}`));
}

function computeOverviewMetrics(highlightedLinks = {}) {
  const papers = Array.isArray(state?.papers) ? state.papers : [];
  const categories = Array.isArray(state?.project?.categories) ? state.project.categories : [];
  const categorized = papers.filter(paper => Boolean(getPaperCategory(paper, highlightedLinks))).length;
  const withYear = papers.filter(paper => {
    const year = Number(paper?.year);
    return Number.isFinite(year) && year > 1900 && year < 2100;
  }).length;

  return {
    total: papers.length,
    categories: categories.length,
    categorized,
    uncategorized: papers.length - categorized,
    withYear,
    withoutYear: papers.length - withYear,
  };
}

function ensureHistory(p) {
  if (!p.history || !Array.isArray(p.history)) p.history = [];
  return p.history;
}

function pushHistory(paper, action, details = {}) {
  //TODO: migrar para usar o infrastructure/storage.mjs
  // const h = ensureHistory(paper);
  // h.push({ ts: svatNowIso(), action, details });
  // // Keep it bounded
  // if (h.length > 200) paper.history = h.slice(h.length - 200);
}

function renderHeader() {
  const project = state?.project || {};
  const title = project.name || project.title || project.id || "Projeto";
  const description = project.description || project.objective || "Sem descrição";
  const researchers = formatResearchers(project.researchers || project.researcher) || "—";

  $("#projectTitle").textContent = title;
  const meta = $("#projectMeta");
  if (meta) {
    meta.innerHTML = `
      <div class="metaLine metaResearchers">Pesquisadores: ${escapeHtml(researchers)}</div>
      <div class="metaLine metaDescWrap">
        <span class="metaDesc" id="projectMetaDesc">${escapeHtml(description)}</span>
        <button class="linkBtn metaToggle hidden" id="projectMetaToggle" type="button">Ler mais</button>
      </div>
    `;
    updateProjectMetaClamp(false);
  }
  $("#brandSub").textContent = project.id ? `ID: ${project.id}` : "Sem projeto ativo";
}

function updateProjectMetaClamp(expand) {
  const desc = document.getElementById("projectMetaDesc");
  const toggle = document.getElementById("projectMetaToggle");
  const topbar = document.querySelector(".topbar");
  if (!desc || !toggle) return;

  desc.classList.add("clamped");
  desc.classList.remove("expanded");

  const needsClamp = desc.scrollWidth > desc.clientWidth + 1;
  if (!needsClamp) {
    toggle.classList.add("hidden");
    toggle.onclick = null;
    if (topbar) topbar.classList.remove("metaExpanded");
    return;
  }

  if (expand) {
    desc.classList.add("expanded");
    desc.classList.remove("clamped");
    toggle.textContent = "Ler menos";
    if (topbar) topbar.classList.add("metaExpanded");
  } else {
    desc.classList.add("clamped");
    desc.classList.remove("expanded");
    toggle.textContent = "Ler mais";
    if (topbar) topbar.classList.remove("metaExpanded");
  }

  toggle.classList.remove("hidden");
  toggle.onclick = () => updateProjectMetaClamp(!desc.classList.contains("expanded"));
}

async function renderOverview() {
  let highlightedLinks = {};
  try {
    const data = await storage.get(["highlightedLinks"]);
    highlightedLinks = data?.highlightedLinks || {};
  } catch (error) {
    console.warn("Não foi possível carregar as categorias dos artigos no dashboard.", error);
  }

  const metrics = computeOverviewMetrics(highlightedLinks);
  $("#kpi_total").textContent = metrics.total;
  $("#kpi_categories").textContent = metrics.categories;
  $("#kpi_categorized").textContent = metrics.categorized;
  $("#kpi_uncategorized").textContent = metrics.uncategorized;
  $("#kpi_with_year").textContent = metrics.withYear;
  $("#kpi_without_year").textContent = metrics.withoutYear;

  renderCategoryBars(highlightedLinks);
  renderTimeline();
  renderRecentTable(highlightedLinks);
}

function renderCategoryBars(highlightedLinks = {}) {
  const bars = $("#categoryBars");
  if (!bars) return;
  bars.innerHTML = "";

  const categories = Array.isArray(state?.project?.categories) ? state.project.categories : [];
  const counts = new Map(categories.map(category => [getPaperCategoryKey(category), 0]));
  let uncategorized = 0;

  for (const paper of state?.papers || []) {
    const category = getPaperCategory(paper, highlightedLinks);
    const key = getPaperCategoryKey(category);
    if (key && counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    else uncategorized += 1;
  }

  const rows = categories.map(category => ({
    label: category.title || category.label || "Categoria",
    value: counts.get(getPaperCategoryKey(category)) || 0,
    color: normalizeHexColor(category.color, "#7AA2FF"),
  }));
  rows.push({ label: "Sem categoria", value: uncategorized, color: "#7C879E" });

  const max = Math.max(1, ...rows.map(row => row.value));
  for (const row of rows) {
    const div = document.createElement("div");
    div.className = "barRow";
    div.innerHTML = `
      <div>${escapeHtml(row.label)}</div>
      <div class="bar"><span style="width:${(row.value / max) * 100}%;background:${escapeHtml(row.color)}"></span></div>
      <div style="text-align:right;font-variant-numeric:tabular-nums">${row.value}</div>
    `;
    bars.appendChild(div);
  }
}

function renderTimeline() {
  const svg = $("#timeline");
  // Clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const years = state.papers
    .map(p => Number(p.year))
    .filter(y => Number.isFinite(y) && y > 1900 && y < 2100);
  if (!years.length) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "12");
    t.setAttribute("y", "24");
    t.setAttribute("fill", "#666");
    t.textContent = "Sem anos detectados ainda (ok — você pode adicionar manualmente na tabela).";
    svg.appendChild(t);
    return;
  }
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const counts = new Map();
  for (let y = minY; y <= maxY; y++) counts.set(y, 0);
  for (const y of years) counts.set(y, (counts.get(y) || 0) + 1);
  const entries = [...counts.entries()];
  const maxC = Math.max(...entries.map(([, v]) => v));

  const box = svg.getBoundingClientRect();
  const w = Math.max(300, box.width || 600);
  const h = 180;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const pad = { l: 24, r: 10, t: 10, b: 26 };
  const bw = (w - pad.l - pad.r) / entries.length;

  // Bars
  entries.forEach(([y, v], i) => {
    const bh = (v / maxC) * (h - pad.t - pad.b);
    const x = pad.l + i * bw;
    const y0 = h - pad.b - bh;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x + 1);
    rect.setAttribute("y", y0);
    rect.setAttribute("width", Math.max(2, bw - 2));
    rect.setAttribute("height", bh);
    rect.setAttribute("rx", "4");
    rect.setAttribute("fill", "#111");
    rect.setAttribute("opacity", "0.85");
    rect.style.cursor = "pointer";
    rect.addEventListener("click", () => {
      setActiveView("papers");
      $("#f_category").value = "all";
      $("#search").value = String(y);
      renderPapersTable();
    });
    svg.appendChild(rect);

    if (i % Math.ceil(entries.length / 8) === 0) {
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", x + bw / 2);
      tx.setAttribute("y", h - 10);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-size", "10");
      tx.setAttribute("fill", "#555");
      tx.textContent = String(y);
      svg.appendChild(tx);
    }
  });

  // Axis line
  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", pad.l);
  axis.setAttribute("x2", w - pad.r);
  axis.setAttribute("y1", h - pad.b);
  axis.setAttribute("y2", h - pad.b);
  axis.setAttribute("stroke", "#ddd");
  svg.appendChild(axis);
}

function renderRecentTable(highlightedLinks = {}) {
  const tbody = $("#recentTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const recent = [...(state?.papers || [])]
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    .slice(0, 8);

  for (const paper of recent) {
    const category = getPaperCategory(paper, highlightedLinks);
    const color = getPaperCategoryColor(paper, highlightedLinks);
    const categoryLabel = category?.title || category?.label || "Sem categoria";
    const marker = color
      ? `<span class="paperCategoryMarker" style="background:${escapeHtml(color)}" aria-hidden="true"></span>`
      : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(paper.title || paper.url || "(sem título)")}</td>
      <td><span class="categoryBadge">${marker}<span>${escapeHtml(categoryLabel)}</span></span></td>
    `;
    tbody.appendChild(tr);
  }

  if (!recent.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="muted">Nenhum artigo cadastrado.</td>`;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHistoryTable(targetTbody, history) {
  targetTbody.innerHTML = "";
  const rows = Array.isArray(history) ? [...history] : [];
  rows.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  for (const h of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(fmtDate(h.ts))}</td>
      <td><span class="pill">${escapeHtml(h.action || "-")}</span></td>
      <td style="color:#444">${escapeHtml(JSON.stringify(h.details || {}))}</td>
    `;
    targetTbody.appendChild(tr);
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color:#666">Sem histórico para este artigo ainda.</td>`;
    targetTbody.appendChild(tr);
  }
}

function showHistory(paperId) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;

  const modal = document.getElementById("historyModal");
  const title = document.getElementById("historyModalTitle");
  const tbody = document.querySelector("#historyModalTable tbody");

  if (title) title.textContent = `Histórico: ${(paper.title || paper.url || paper.id).slice(0, 90)}`;
  if (tbody) renderHistoryTable(tbody, paper.history);
  if (modal) modal.classList.remove("hidden");
}

function getFilters() {
  return {
    q: normalizeStr($("#search").value),
    category: $("#f_category").value,
  };
}

function paperMatchesFilters(paper, filters, highlightedLinks = {}) {
  const category = getPaperCategory(paper, highlightedLinks);
  const categoryKey = getPaperCategoryKey(category);

  if (filters.category === "uncategorized" && category) return false;
  if (filters.category !== "all" && filters.category !== "uncategorized" && categoryKey !== filters.category) return false;

  if (!filters.q) return true;
  const categoryText = category ? `${category.title || ""} ${category.label || ""}` : "sem categoria";
  const hay = normalizeStr(`${paper.title || ""} ${paper.authorsRaw || ""} ${(paper.tags || []).join(" ")} ${paper.year || ""} ${paper.url || ""} ${categoryText}`);
  return hay.includes(filters.q);
}

async function renderPapersTable() {
  // token for this render; only the latest token may write to the DOM
  const myToken = ++renderToken;

  syncCategoryFilterOptions();
  const f = getFilters();

  // fetch highlighted links and svat_papers
  let hl = {};
  let svat = [];
  try {
    const d = await storage.get(["highlightedLinks", "svat_papers"]);
    hl = (d && d.highlightedLinks) ? d.highlightedLinks : {};
    svat = Array.isArray(d && d.svat_papers) ? d.svat_papers : [];
  } catch (e) {
    // ignore
  }

  // Early cancellation: if a newer render started, bail out
  if (myToken !== renderToken) return;

  const base = (state.papers || []).filter(paper => paperMatchesFilters(paper, f, hl));

  const titleByUrl = new Map();
  for (const p of svat || []) {
    const nu = normalizeStr(String(p?.url || ''));
    if (!nu) continue;
    const t = (p?.title || '').trim();
    if (t) titleByUrl.set(nu, t);
  }

  // Map existing papers by normalized url to avoid duplicates
  const present = new Set((state.papers || []).map(p => normalizeStr(p.url || '')));

  const synth = [];
  for (const url of Object.keys(hl || {})) {
    const nurl = normalizeStr(url);
    if (present.has(nurl)) continue;
    const title = titleByUrl.get(nurl) || url;
    const color = hl[url];
    const item = {
      id: `marked:${nurl}`,
      title,
      authorsRaw: '',
      createdAt: '',
      year: '',
      tags: [],
      url: url,
      highlightedColor: color,
    };
    if (!paperMatchesFilters(item, f, hl)) continue;
    synth.push(item);
  }

  const rows = [...base, ...synth].sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));

  // build HTML in memory
  let rowsHtml = "";
  for (const p of rows) {
    const tags = Array.isArray(p.tags) ? p.tags.join(";") : "";
    // Use a light tint from the selected category so the title stays readable.
    const category = getPaperCategory(p, hl);
    const categoryColor = getPaperCategoryColor(p, hl);
    const rowStyle = categoryColor
      ? `style="--paper-category-color:${escapeHtml(categoryColor)};--paper-category-tint:${escapeHtml(hexToRgba(categoryColor, 0.25))};--paper-category-tint-hover:${escapeHtml(hexToRgba(categoryColor, 0.50))}"`
      : "";
    const rowClass = categoryColor ? "paperCategoryRow" : "";
    const categoryMarker = categoryColor
      ? `<span class="paperCategoryMarker" style="background:${escapeHtml(categoryColor)}" aria-hidden="true"></span>`
      : "";

    rowsHtml += `
      <tr class="${rowClass}" ${rowStyle}>
        <td><input type="checkbox" class="rowCheck" data-id="${p.id}" /></td>
        <td>
          <div class="paperTitleWrap">
            <button class="linkBtn" data-show-history="${p.id}" title="Ver histórico">${escapeHtml(p.title || "(sem título)")}</button>
          </div>
          <div style="color:#666;font-size:11px;margin-top:4px">${escapeHtml(p.authorsRaw || "")} • ${escapeHtml(fmtDate(p.createdAt))}</div>
        </td>
        <td><input class="cellInput" data-field="year" data-id="${p.id}" value="${escapeHtml(p.year ?? "")}" placeholder="—" style="width:64px" /></td>
        <td>
          <span class="categoryBadge">
            ${categoryMarker}
            <span>${escapeHtml(category?.title || category?.label || "Sem categoria")}</span>
          </span>
        </td>
        <td><input class="cellInput" data-field="tags" data-id="${p.id}" value="${escapeHtml(tags)}" placeholder="ex: vis;ml" /></td>
        <td><a class="link" href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">Abrir</a></td>
      </tr>
    `;
  }

  // Before writing to DOM, ensure this render is still the latest
  if (myToken !== renderToken) return;

  const tbody = $("#papersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = rowsHtml;

  // Bind inputs
  tbody.querySelectorAll(".cellInput").forEach(el => el.addEventListener("change", onCellChange));
  tbody.querySelectorAll("button[data-show-history]").forEach(b => {
    b.addEventListener("click", () => showHistory(b.getAttribute("data-show-history")));
  });
  $("#checkAll").checked = false;
}


async function onCellChange(e) {
  const el = e.target;
  const id = el.getAttribute("data-id");
  const field = el.getAttribute("data-field");
  const paper = state.papers.find(p => p.id === id);
  if (!paper) return;
  let val = el.value;
  const prev = paper[field];
  if (field === "year") {
    const n = Number(val);
    paper.year = Number.isFinite(n) ? n : null;
  } else if (field === "tags") {
    paper.tags = val.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  } else {
    paper[field] = val;
  }
  pushHistory(paper, "update_field", { field, from: prev, to: paper[field] });
  await persist();
  renderAll();
}

function selectedPaperIds() {
  return $$(".rowCheck:checked").map(ch => ch.getAttribute("data-id"));
}

async function bulkDeleteMarkedSelected() {
  const ids = selectedPaperIds();
  if (!ids.length) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  if (!confirm(`Remover/excluir ${ids.length} artigo(s) selecionado(s)?`)) return;

  const d = await storage.get(["highlightedLinks", "svat_papers"]);
  const highlightedLinks = (d && d.highlightedLinks) ? d.highlightedLinks : {};
  const svat_papers = Array.isArray(d && d.svat_papers) ? d.svat_papers : [];

  const selectedUrls = new Set();
  const paperIdsToDelete = new Set();

  for (const id of ids) {
    if (id && id.startsWith("marked:")) {
      selectedUrls.add(id.slice(7));
      continue;
    }

    paperIdsToDelete.add(id);
    const paper = (state.papers || []).find((p) => p.id === id);
    if (paper?.url) selectedUrls.add(normalizeStr(paper.url));
  }

  for (const p of svat_papers) {
    const nu = normalizeStr(p?.url || "");
    if (selectedUrls.has(nu) && p?.id) paperIdsToDelete.add(p.id);
  }

  for (const t of selectedUrls) {
    for (const k of Object.keys(highlightedLinks)) {
      try {
        if (normalizeStr(k) === t || normalizeUrl(k) === t || normalizeStr(normalizeUrl(k)) === t) {
          delete highlightedLinks[k];
        }
      } catch (e) {
        // ignore
      }
    }
  }

  const filteredPapers = svat_papers.filter((p) => {
    const nu = normalizeStr(p?.url || "");
    return !selectedUrls.has(nu) && !paperIdsToDelete.has(p?.id);
  });

  for (const paperId of paperIdsToDelete) {
    await storage.deletePaper(paperId).catch((e) => console.warn('deletePaper failed:', e));
  }

  await storage.set({ highlightedLinks, svat_papers: filteredPapers });

  state.papers = (state.papers || []).filter((p) => !paperIdsToDelete.has(p.id));
  await loadState();
  loadHighlightedLinks();
  renderAll();
}

async function persist() {
  if (!state || !Array.isArray(state.papers)) return;

  for (const paper of state.papers) {
    if (!paper || (!paper.id && !(paper.id === 0))) continue;
    paper.updatedAt = new Date().toISOString();
    await storage.savePaper(paper);
  }
}

function renderAll() {
  renderHeader();
  renderOverview();
  renderPapersTable();
}

function bindEvents() {
  // Navigation
  $$(".navBtn").forEach(btn => btn.addEventListener("click", () => setActiveView(btn.dataset.view)));

  window.addEventListener("resize", () => updateProjectMetaClamp(false));

  // Top actions
  const btnProjects = document.getElementById("btnProjects");
  if (btnProjects) btnProjects.addEventListener("click", () => {
    
    // Go to the dedicated Projects page (ui/projects/projects.html).
    // Note: we intentionally *don't* open options/config aqui.
    try {
      window.location.href = "../projects/projects.html";
    } catch {
      alert("Não foi possível abrir a página de Projetos.");
    }
  });
  $("#btnOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  // (btnClear removed) — replaced by "Projetos"

  
  // History modal close
  const btnClose = document.getElementById("btnCloseHistory");
  if (btnClose) btnClose.addEventListener("click", () => document.getElementById("historyModal")?.classList.add("hidden"));
  const modal = document.getElementById("historyModal");
  if (modal) modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // Papers filters
  ["search", "f_category"].forEach(id => {
    $("#" + id).addEventListener("input", renderPapersTable);
    $("#" + id).addEventListener("change", renderPapersTable);
  });
  $("#checkAll").addEventListener("change", (e) => {
    const checked = e.target.checked;
    $$(".rowCheck").forEach(ch => ch.checked = checked);
  });

  $("#btnBulkDeleteMarked").addEventListener("click", () => bulkDeleteMarkedSelected());

  // Categories CRUD
  const btnShowAddCategory = document.getElementById("btnShowAddCategory");
  const categoryPanel = document.getElementById("categoryPanel");
  const categoryPanelTitle = document.getElementById("categoryPanelTitle");
  const btnCloseCategory = document.getElementById("btnCloseCategory");
  const btnSaveCategory = document.getElementById("btnSaveCategory");
  const btnDeleteCategory = document.getElementById("btnDeleteCategory");
  const categoryTitleInput = document.getElementById("categoryTitle");
  const categoryDescriptionInput = document.getElementById("categoryDescription");
  const categoryColorInput = document.getElementById("categoryColor");
  const categoryColorValue = document.getElementById("categoryColorValue");
  const categoryPhasesInput = document.getElementById("categoryPhases");
  const categoryCriteriaInput = document.getElementById("categoryCriteria");
  const categoryCriterionNewInput = document.getElementById("categoryCriterionNew");
  const btnAddCategoryCriterion = document.getElementById("btnAddCategoryCriterion");
  const categoryTitleError = document.getElementById("categoryTitleError");
  const highlightSearch = document.getElementById("highlightSearch");
  const removeLinks = document.getElementById("removeLinks");
  let editingCategoryLabel = null;
  let categoryDraftCriteria = [];

  const makeLabel = (value) => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function renderCategoryRequirementOptions(container, items, selected = []) {
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted categoryEmptyRequirements";
      empty.textContent = "Nenhum item cadastrado.";
      container.appendChild(empty);
      return;
    }

    for (const item of items) {
      const label = item.label || makeLabel(item.title);
      const wrapper = document.createElement("label");
      wrapper.className = "phaseCategoryItem";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = label;
      checkbox.checked = selected.includes(label);
      const text = document.createElement("span");
      text.textContent = item.title || label;
      wrapper.append(checkbox, text);
      container.appendChild(wrapper);
    }
  }

  function renderCategoryCriteria() {
    if (!categoryCriteriaInput) return;
    categoryCriteriaInput.innerHTML = "";

    if (!categoryDraftCriteria.length) {
      const empty = document.createElement("div");
      empty.className = "muted categoryEmptyRequirements";
      empty.textContent = "Nenhum critério cadastrado.";
      categoryCriteriaInput.appendChild(empty);
      return;
    }

    categoryDraftCriteria.forEach((criterion, index) => {
      const row = document.createElement("div");
      row.className = "categoryCriterionItem";

      const text = document.createElement("span");
      text.className = "categoryCriterionText";
      text.textContent = criterion;

      const actions = document.createElement("div");
      actions.className = "categoryCriterionActions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.title = "Editar critério";
      editButton.textContent = "✎";
      editButton.addEventListener("click", () => {
        const nextValue = prompt("Editar critério:", criterion)?.trim();
        if (!nextValue || nextValue === criterion) return;
        const duplicated = categoryDraftCriteria.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === nextValue.toLowerCase());
        if (duplicated) return alert("Este critério já foi adicionado à categoria.");
        categoryDraftCriteria[index] = nextValue;
        renderCategoryCriteria();
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger";
      deleteButton.title = "Excluir critério";
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => {
        categoryDraftCriteria.splice(index, 1);
        renderCategoryCriteria();
      });

      actions.append(editButton, deleteButton);
      row.append(text, actions);
      categoryCriteriaInput.appendChild(row);
    });
  }

  function addCategoryCriterion() {
    const title = categoryCriterionNewInput?.value?.trim();
    if (!title) return;
    if (categoryDraftCriteria.some(item => item.toLowerCase() === title.toLowerCase())) {
      return alert("Este critério já foi adicionado à categoria.");
    }
    categoryDraftCriteria.push(title);
    renderCategoryCriteria();
    categoryCriterionNewInput.value = "";
    categoryCriterionNewInput.focus();
  }

  function selectedValues(container) {
    return Array.from(container?.querySelectorAll('input[type="checkbox"]:checked') || []).map(input => input.value);
  }

  function openCategoryPanel(category = null) {
    if (!categoryPanel) return;
    editingCategoryLabel = category?.label || null;
    categoryPanelTitle.textContent = category ? "Editar categoria" : "Nova categoria";
    categoryTitleInput.value = category?.title || "";
    categoryDescriptionInput.value = category?.description || "";
    categoryColorInput.value = category?.color || "#4CAF50";
    categoryColorValue.textContent = categoryColorInput.value.toUpperCase();
    categoryTitleError.classList.remove("visible");
    categoryTitleError.textContent = "";

    const project = state?.project;
    renderCategoryRequirementOptions(categoryPhasesInput, project?.phases || [], category?.phases || []);
    categoryDraftCriteria = Array.isArray(category?.criteria) ? [...category.criteria] : [];
    renderCategoryCriteria();
    if (categoryCriterionNewInput) categoryCriterionNewInput.value = "";

    btnDeleteCategory.style.display = category ? "" : "none";
    categoryPanel.classList.add("open");
    categoryPanel.setAttribute("aria-hidden", "false");
    categoryPanel.removeAttribute("inert");
    sideOverlay?.classList.add("open");
    sideOverlay?.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    setTimeout(() => categoryTitleInput?.focus(), 60);
  }

  function closeCategoryPanel() {
    if (!categoryPanel) return;
    categoryPanel.classList.remove("open");
    categoryPanel.setAttribute("aria-hidden", "true");
    categoryPanel.setAttribute("inert", "");
    if (!document.getElementById("phasePanel")?.classList.contains("open")) {
      sideOverlay?.classList.remove("open");
      sideOverlay?.setAttribute("aria-hidden", "true");
      document.body.classList.remove("no-scroll");
    }
    editingCategoryLabel = null;
  }

  async function reloadCategoryProjectFromWebSocket(projectID) {
    const freshProject = await storage.loadProject(projectID);
    if (!freshProject) throw new Error("O projeto salvo não pôde ser recarregado pelo WebSocket.");
    state.project = freshProject;
    return freshProject;
  }

  async function updateScholarCategoryMenu() {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "updateContextMenu" }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

    if (response?.status === "error") {
      throw new Error(response.message || "Não foi possível atualizar as categorias no Google Scholar.");
    }
  }

  btnShowAddCategory?.addEventListener("click", () => openCategoryPanel());
  btnCloseCategory?.addEventListener("click", closeCategoryPanel);
  btnAddCategoryCriterion?.addEventListener("click", addCategoryCriterion);
  categoryCriterionNewInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); addCategoryCriterion(); }
  });
  categoryColorInput?.addEventListener("input", () => {
    categoryColorValue.textContent = categoryColorInput.value.toUpperCase();
  });
  window.addEventListener("icipo:edit-category", event => {
    const category = state?.project?.getCategoryByLabel?.(event.detail?.label)
      || state?.project?.categories?.find(item => item.label === event.detail?.label);
    if (category) openCategoryPanel(category);
  });

  btnSaveCategory?.addEventListener("click", async () => {
    const project = state?.project;
    if (!project?.id) return alert("Nenhum projeto ativo.");
    const title = categoryTitleInput.value.trim();
    if (!title) {
      categoryTitleError.textContent = "Preencha o título da categoria.";
      categoryTitleError.classList.add("visible");
      categoryTitleInput.focus();
      return;
    }

    const data = {
      title,
      label: makeLabel(title),
      description: categoryDescriptionInput.value.trim(),
      color: categoryColorInput.value,
      phases: selectedValues(categoryPhasesInput),
      criteria: [...categoryDraftCriteria],
    };

    try {
      if (editingCategoryLabel) project.updateCategory(editingCategoryLabel, data);
      else project.addCategory(data);

      // project.json no servidor é a única fonte persistente das categorias.
      await storage.saveProject(project);
      await reloadCategoryProjectFromWebSocket(project.id);

      loadCategories();
      renderPhaseCategories?.([]);
      await updateScholarCategoryMenu();
      closeCategoryPanel();
    } catch (error) {
      console.warn("category save failed", error);
      categoryTitleError.textContent = error?.message || "Não foi possível salvar a categoria.";
      categoryTitleError.classList.add("visible");
    }
  });

  btnDeleteCategory?.addEventListener("click", async () => {
    const project = state?.project;
    const category = project?.categories?.find(item => item.label === editingCategoryLabel);
    if (!category || !confirm(`Excluir a categoria "${category.title}"?`)) return;
    try {
      project.removeCategory(editingCategoryLabel);

      // Persiste exclusivamente no project.json via WebSocket e recarrega a
      // confirmação do servidor antes de atualizar a interface.
      await storage.saveProject(project);
      await reloadCategoryProjectFromWebSocket(project.id);

      loadCategories();
      await updateScholarCategoryMenu();
      closeCategoryPanel();
    } catch (error) {
      alert(error?.message || "Não foi possível excluir a categoria.");
    }
  });

  if (removeLinks) {
    removeLinks.addEventListener("click", () => {
      if (!confirm("Tem certeza que deseja remover TODOS os links marcados?")) return;
      storage.set({ highlightedLinks: {}, svat_papers: [] }).then(loadHighlightedLinks)
        .catch((e) => console.warn("removeLinks set failed", e));
    });
  }

  highlightSearch?.addEventListener("input", loadHighlightedLinks);

  // --- Phases (persistidas no project.json via WebSocket) ---
  const btnShowAddPhase = document.getElementById('btnShowAddPhase');
  const phasePanel = document.getElementById('phasePanel');
  const sideOverlay = document.getElementById('sideOverlay');
  const btnClosePhase = document.getElementById('btnClosePhase');
  const btnSavePhase = document.getElementById('btnSavePhase');
  const phasesList = document.getElementById('phasesList');

  const phaseTitleInput = document.getElementById('phaseTitle');
  const phaseDescInput = document.getElementById('phaseDesc');
  const phaseCriteriaInput = document.getElementById('phaseCriteria');
  const phaseCategoriesInput = document.getElementById('phaseCategories');
  const btnTogglePhaseStatus = document.getElementById('btnTogglePhaseStatus');
  const btnDeletePhase = document.getElementById('btnDeletePhase');
  const phaseTitleError = document.getElementById('phaseTitleError');
  const phaseDescError = document.getElementById('phaseDescError');
  const phaseCriteriaError = document.getElementById('phaseCriteriaError');
  let phaseEditingCard = null; // card em edição
  let phaseEditingLabel = null; // label original da fase em edição
  let phaseLabelStatus = 'pending'; // 'pending' | 'done'

  function updateToggleButtonUI(){
    if(!btnTogglePhaseStatus) return;
    const s = phaseLabelStatus === 'done' ? 'done' : 'pending';
    btnTogglePhaseStatus.dataset.status = s;
    btnTogglePhaseStatus.textContent = s === 'done' ? 'Concluída' : 'Em análise';
    btnTogglePhaseStatus.classList.toggle('ghost', s === 'pending');
  }

  if(btnTogglePhaseStatus){
    btnTogglePhaseStatus.addEventListener('click', (e) => {
      e.preventDefault();
      phaseLabelStatus = (phaseLabelStatus === 'done') ? 'pending' : 'done';
      updateToggleButtonUI();
    });
  }

  // Render available categories as checkboxes inside the phase edit panel.
  function renderPhaseCategories(selected = []){
    if(!phaseCategoriesInput) return;
    phaseCategoriesInput.innerHTML = '';

    // Primeiro tenta usar as categorias do projeto ativo; se não houver,
    // faz fallback para o storage antigo de categorias.
    const render = (catsSource) => {
      const catsArray = Array.isArray(catsSource)
        ? catsSource
        : Object.entries(catsSource || {}).map(([title, color]) => ({ title, label: title, color }));

      const cats = catsArray
        .map((c) => ({
          title: c.title || c.label || String(c),
          label: c.label || c.title || String(c),
          color: c.color || 'transparent'
        }))
        .sort((a,b)=>(a.title || '').localeCompare(b.title || ''));

      for (const cat of cats){
        const value = cat.label || cat.title;
        const id = `phase_cat_${cssSafeId(value)}`;
        const wrap = document.createElement('label');
        wrap.className = 'phaseCategoryItem';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = value;
        cb.id = id;
        if(Array.isArray(selected) && selected.includes(value)) cb.checked = true;
        const pill = document.createElement('span');
        pill.className = 'catPill';
        pill.style.width = '12px';
        pill.style.height = '12px';
        pill.style.borderRadius = '4px';
        pill.style.flex = '0 0 auto';
        pill.style.background = cat.color || 'transparent';
        pill.style.border = '1px solid rgba(0,0,0,0.12)';
        const txt = document.createElement('span');
        txt.textContent = cat.title || value;
        wrap.appendChild(cb);
        wrap.appendChild(pill);
        wrap.appendChild(txt);
        phaseCategoriesInput.appendChild(wrap);
      }
    };

    if (state?.project?.categories && Array.isArray(state.project.categories) && state.project.categories.length) {
      render(state.project.categories);
      return;
    }

    storage.get('categories').then((data) => {
      render((data && data.categories) ? data.categories : {});
    }).catch(() => { /* ignore */ });
  }

  function cssSafeId(s){
    return String(s||'').replace(/[^a-z0-9_-]+/ig,'_');
  }

  function phaseCriteriaToText(criteria){
    if(Array.isArray(criteria)) return criteria.join('\n');
    return String(criteria || '');
  }

  function phaseTextToCriteria(criteriaText){
    return String(criteriaText || '')
      .split(/\r?\n|,/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  function getPhaseStats(phase = {}){
    const papers = phase.papers || {};
    return {
      inherited: Array.isArray(papers.inherited) ? papers.inherited.length : 0,
      added: Array.isArray(papers.new) ? papers.new.length : 0,
      selected: Array.isArray(papers.selected) ? papers.selected.length : 0,
      removed: Array.isArray(papers.removed) ? papers.removed.length : 0,
      utilization: phase.completed ? 100 : 0
    };
  }

  function createPhaseCard(phaseData = {}) {
    const title = phaseData.title || '';
    const desc = phaseData.desc ?? phaseData.description ?? '';
    const criteria = phaseCriteriaToText(phaseData.criteria);
    const categories = Array.isArray(phaseData.categories) ? phaseData.categories : [];
    const label = phaseData.label || cssSafeId(title).toLowerCase();
    const labelStatus = phaseData.labelStatus || (phaseData.completed ? 'done' : 'pending');
    const stats = phaseData.stats || getPhaseStats(phaseData);

    const el = document.createElement('div');
    el.className = 'phaseCard';
    if (state?.project?.activePhaseLabel === label) el.classList.add('active');
    el.dataset.label = label;
    el.dataset.labelStatus = labelStatus;
    el.dataset.desc = desc;
    el.dataset.criteria = criteria;
    el.dataset.categories = JSON.stringify(categories);

    const safeTitle = escapeHtml(title || '(sem título)');
    const s = stats || { inherited:0, added:0, selected:0, removed:0, utilization:0 };

    el.innerHTML = `
      <div class="phaseCardHeader">
        <div class="statusDot" title="Ativa"></div>
        <div class="phaseHeadText">
          <div class="phaseTitle">${safeTitle}</div>
        </div>
      </div>
      <div class="phaseCardBody">
        <div class="papersSection">
          <div class="papersTitle">📊 Papers</div>
          <div class="papersGrid">
            <div><span class="muted">Herdados:</span> <strong>${s.inherited}</strong></div>
            <div><span class="muted">Novos:</span> <strong>${s.added}</strong></div>
            <div><span class="muted">Selecionados:</span> <strong>${s.selected}</strong></div>
            <div><span class="muted">Removidos:</span> <strong>${s.removed}</strong></div>
          </div>
          <div class="papersUtil">Rótulo: <strong class="phaseLabelStatus ${labelStatus === 'done' ? 'done' : 'pending'}">${labelStatus === 'done' ? 'Concluída' : 'Em análise'}</strong></div>
        </div>
      </div>
      <div class="phaseCardFooter">
        <span class="activeLabel pill" aria-hidden="true">Ativo</span>
        <div class="phaseCardActions">
          <button class="btn small" data-action="edit">Editar</button>
        </div>
      </div>
    `;

    const btnEdit = el.querySelector('button[data-action="edit"]');
    if(btnEdit) btnEdit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if(phaseTitleInput) phaseTitleInput.value = title || '';
      if(phaseDescInput) phaseDescInput.value = desc || '';
      if(phaseCriteriaInput) phaseCriteriaInput.value = criteria || '';
      if(phaseCategoriesInput) renderPhaseCategories(categories || []);
      phaseLabelStatus = el.dataset.labelStatus || labelStatus || 'pending';
      phaseEditingLabel = el.dataset.label || label;
      updateToggleButtonUI();
      phaseEditingCard = el;
      updateSaveState();
      openPhasePanel(true);
    });

    el.addEventListener('click', async (ev) => {
      if(ev.target.closest('button')) return;
      if(!state?.project?.id){
        alert('Abra um projeto antes de ativar uma fase.');
        return;
      }

      try {
        console.log('🟢 Enviando set_active_phase para WS', { projectID: state.project.id, phaseLabel: label });
        await storage.setActivePhase(state.project.id, label);
        state.project.activePhaseLabel = label;

        loadHighlightedLinks();
        await renderPapersTable();

        if(phasesList){
          Array.from(phasesList.querySelectorAll('.phaseCard.active')).forEach(c => c.classList.remove('active'));
        }
        el.classList.add('active');
      } catch (err) {
        console.warn('setActivePhase failed', err);
        alert(err?.message || 'Falha ao ativar fase. Veja o console.');
      }
    });

    return el;
  }

  function renderPhasesFromProject(){
    if(!phasesList) return;
    phasesList.innerHTML = '';
    const phases = Array.isArray(state?.project?.phases) ? state.project.phases : [];
    if (phases.length && !state.project.activePhaseLabel) {
      state.project.activePhaseLabel = phases[0].label;
    }
    phases.forEach((phase) => phasesList.appendChild(createPhaseCard(phase)));
  }

  renderPhasesFromProject();

  function openPhasePanel(isEditing){
    phasePanel.classList.add('open');
    phasePanel.setAttribute('aria-hidden', 'false');
    phasePanel.removeAttribute('inert');
    if(sideOverlay) { sideOverlay.classList.add('open'); sideOverlay.setAttribute('aria-hidden','false'); }
    if(sideOverlay) { sideOverlay.removeAttribute('inert'); }
    document.body.classList.add('no-scroll');
    // ensure custom resizers are present and wired
    enhanceSidePanelTextareas();
    // show delete button when editing an existing card
    if(btnDeletePhase){
      if(isEditing) btnDeletePhase.style.display = '';
      else btnDeletePhase.style.display = 'none';
    }
    setTimeout(() => phaseTitleInput?.focus(), 60);
  }
  function closePhasePanel(){
    phasePanel.classList.remove('open');
    phasePanel.setAttribute('aria-hidden','true');
    phasePanel.setAttribute('inert', '');
    if(sideOverlay) { sideOverlay.classList.remove('open'); sideOverlay.setAttribute('aria-hidden','true'); }
    if(sideOverlay) { sideOverlay.setAttribute('inert', ''); }
    document.body.classList.remove('no-scroll');
    // clear editing state and any inline errors when closing/cancelling
    phaseEditingCard = null;
    phaseEditingLabel = null;
    if(phaseCategoriesInput) phaseCategoriesInput.innerHTML = '';
    phaseLabelStatus = 'pending';
    updateToggleButtonUI();
    if(phaseTitleError){ phaseTitleError.classList.remove('visible'); phaseTitleError.textContent=''; }
    if(phaseDescError){ phaseDescError.classList.remove('visible'); phaseDescError.textContent=''; }
    if(phaseCriteriaError){ phaseCriteriaError.classList.remove('visible'); phaseCriteriaError.textContent=''; }
    if(btnDeletePhase) btnDeletePhase.style.display = 'none';
  }

  // Enhance side panel textareas: remove native resize UI and add a modern draggable resizer
  function enhanceSidePanelTextareas(){
    if(!phasePanel) return;
    const textareas = phasePanel.querySelectorAll('textarea');
    textareas.forEach((t) => {
      if(t.closest('.textarea-resizable')) return; // already enhanced
      try{
        t.style.resize = 'none';
        const wrapper = document.createElement('div');
        wrapper.className = 'textarea-resizable';
        t.parentNode.insertBefore(wrapper, t);
        wrapper.appendChild(t);

        const handle = document.createElement('div');
        handle.className = 'textarea-resizer';
        wrapper.appendChild(handle);

        let startY = 0, startH = 0, dragging = false;

        const onMouseMove = (e) => {
          if(!dragging) return;
          const dy = e.clientY - startY;
          const newH = Math.max(40, startH + dy);
          t.style.height = newH + 'px';
        };
        const onMouseUp = () => {
          if(!dragging) return;
          dragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.userSelect = '';
        };

        handle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          startY = e.clientY;
          startH = t.offsetHeight;
          dragging = true;
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          document.body.style.userSelect = 'none';
        });

        // touch support
        const onTouchMove = (e) => {
          if(!dragging) return;
          e.preventDefault();
          const touch = e.touches[0];
          const dy = touch.clientY - startY;
          const newH = Math.max(40, startH + dy);
          t.style.height = newH + 'px';
        };
        const onTouchEnd = () => {
          dragging = false;
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
          document.body.style.userSelect = '';
        };
        handle.addEventListener('touchstart', (e) => {
          const touch = e.touches[0];
          if(!touch) return;
          startY = touch.clientY;
          startH = t.offsetHeight;
          dragging = true;
          document.addEventListener('touchmove', onTouchMove, { passive: false });
          document.addEventListener('touchend', onTouchEnd);
          document.body.style.userSelect = 'none';
        });
      }catch(err){console.warn('enhanceSidePanelTextareas error', err)}
    });
  }

  if (btnShowAddPhase && phasePanel) {
    btnShowAddPhase.addEventListener('click', () => {
      // ensure fresh empty form when adding
      phaseEditingCard = null;
      if(phaseTitleInput) phaseTitleInput.value = '';
      if(phaseDescInput) phaseDescInput.value = '';
      if(phaseCriteriaInput) phaseCriteriaInput.value = '';
      if(phaseCategoriesInput) renderPhaseCategories([]);
      phaseLabelStatus = 'pending';
      updateToggleButtonUI();
      updateSaveState();
      openPhasePanel(false);
    });
  }
  if (btnClosePhase) btnClosePhase.addEventListener('click', closePhasePanel);
  if (sideOverlay) sideOverlay.addEventListener('click', closePhasePanel);

  // Disable save until required fields are filled
  function updateSaveState(){
    const ok = (phaseTitleInput?.value || '').trim() && (phaseDescInput?.value || '').trim() && (phaseCriteriaInput?.value || '').trim();
    if(btnSavePhase) {
      if(ok) btnSavePhase.classList.add('ready'); else btnSavePhase.classList.remove('ready');
    }
  }
  // Init
  // keep button enabled so user can attempt save and see validation messages
  updateSaveState();
  [phaseTitleInput, phaseDescInput, phaseCriteriaInput].forEach(inp => {
    if(!inp) return;
    inp.addEventListener('input', (e) => {
      updateSaveState();
      // clear inline error for this field when user types
      if(!e?.target) return;
      const id = e.target.id;
      if(id === 'phaseTitle' && phaseTitleError){ phaseTitleError.classList.remove('visible'); phaseTitleError.textContent=''; }
      if(id === 'phaseDesc' && phaseDescError){ phaseDescError.classList.remove('visible'); phaseDescError.textContent=''; }
      if(id === 'phaseCriteria' && phaseCriteriaError){ phaseCriteriaError.classList.remove('visible'); phaseCriteriaError.textContent=''; }
    });
  });
  async function reloadActiveProjectAfterPhaseChange(){
    try {
      const fresh = await storage.getActiveProject();
      if (fresh) state.project = fresh;
    } catch (err) {
      console.warn('Não foi possível recarregar o projeto ativo após salvar fase.', err);
    }
  }

  function clearPhaseForm(){
    if(phaseTitleInput) phaseTitleInput.value = '';
    if(phaseDescInput) phaseDescInput.value = '';
    if(phaseCriteriaInput) phaseCriteriaInput.value = '';
    if(phaseCategoriesInput) phaseCategoriesInput.innerHTML = '';
    phaseEditingCard = null;
    phaseEditingLabel = null;
    phaseLabelStatus = 'pending';
    updateToggleButtonUI();
    updateSaveState();
  }

  if (btnSavePhase) btnSavePhase.addEventListener('click', async (e) => {
    e.preventDefault();
    const title = (phaseTitleInput?.value || '').trim();
    const desc = (phaseDescInput?.value || '').trim();
    const criteriaText = (phaseCriteriaInput?.value || '').trim();
    if(phaseTitleError){ phaseTitleError.classList.remove('visible'); phaseTitleError.textContent=''; }
    if(phaseDescError){ phaseDescError.classList.remove('visible'); phaseDescError.textContent=''; }
    if(phaseCriteriaError){ phaseCriteriaError.classList.remove('visible'); phaseCriteriaError.textContent=''; }

    const emptyFields = [];
    if(!title) emptyFields.push('title');
    if(!desc) emptyFields.push('desc');
    if(!criteriaText) emptyFields.push('criteria');
    if(emptyFields.length){
      if(emptyFields.includes('title') && phaseTitleError){ phaseTitleError.textContent = 'Preencha o título da fase.'; phaseTitleError.classList.add('visible'); }
      if(emptyFields.includes('desc') && phaseDescError){ phaseDescError.textContent = 'Preencha a descrição da fase.'; phaseDescError.classList.add('visible'); }
      if(emptyFields.includes('criteria') && phaseCriteriaError){ phaseCriteriaError.textContent = 'Preencha os critérios da fase.'; phaseCriteriaError.classList.add('visible'); }
      if(emptyFields[0] === 'title') phaseTitleInput?.focus();
      else if(emptyFields[0] === 'desc') phaseDescInput?.focus();
      else if(emptyFields[0] === 'criteria') phaseCriteriaInput?.focus();
      return;
    }

    if(!state?.project?.id){
      alert('Abra um projeto antes de salvar fases.');
      return;
    }

    let categories = [];
    if(phaseCategoriesInput){
      const checked = Array.from(phaseCategoriesInput.querySelectorAll('input[type=checkbox]:checked'));
      categories = checked.map(c => (c.value || '').trim()).filter(Boolean);
    }

    const phasePayload = {
      title,
      description: desc,
      completed: phaseLabelStatus === 'done',
      categories,
      criteria: phaseTextToCriteria(criteriaText)
    };

    try {
      btnSavePhase.disabled = true;

      if(phaseEditingLabel){
        console.log('🧭 Enviando update_phase para WS', { projectID: state.project.id, phaseLabel: phaseEditingLabel, data: phasePayload });
        await storage.updatePhase(state.project.id, phaseEditingLabel, phasePayload);
      } else {
        console.log('🧭 Enviando save_phase para WS', { projectID: state.project.id, data: phasePayload });
        await storage.savePhase(state.project.id, phasePayload);
      }

      await reloadActiveProjectAfterPhaseChange();
      renderPhasesFromProject();
      clearPhaseForm();
      closePhasePanel();
    } catch (err) {
      console.warn('savePhase failed', err);
      alert(err?.message || err?.message || err?.payload?.message || 'Falha ao salvar fase. Veja o console.');
    } finally {
      btnSavePhase.disabled = false;
    }
  });

  // Delete handler (persistido no project.json)
  if(btnDeletePhase) btnDeletePhase.addEventListener('click', async () => {
    if(!phaseEditingLabel) return;
    if(!confirm('Excluir esta fase?')) return;
    if(!state?.project?.id){
      alert('Abra um projeto antes de excluir fases.');
      return;
    }

    try {
      console.log('🧭 Enviando delete_phase para WS', { projectID: state.project.id, phaseLabel: phaseEditingLabel });
      await storage.deletePhase(state.project.id, phaseEditingLabel);
      await reloadActiveProjectAfterPhaseChange();
      renderPhasesFromProject();
      clearPhaseForm();
      closePhasePanel();
    } catch (err) {
      console.warn('deletePhase failed', err);
      alert(err?.message || 'Falha ao excluir fase. Veja o console.');
    }
  });

}

async function init() {
  await loadState();
  bindEvents();
  renderAll();
  // Load moved features
  loadCategories();
  loadHighlightedLinks();
  setActiveView("overview");
}

init();
