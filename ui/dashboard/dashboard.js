import {fmtDate, normalizeStr} from '../../core/utils.mjs';
import { storage } from '../../infrastructure/storage.mjs';

let state = null;
let dashboardAccessState = 'loading'; // loading | ready | project-required | offline
let phaseCreationRequired = false;
let dashboardIntroRequired = false;
let categoryCreationRequired = false;
let tutorialTransitionTimer = null;
let overviewResizeTimer = null;
const TUTORIAL_TRANSITION_DELAY = 2000;

function projectHasCategories() {
  return Array.isArray(state?.project?.categories) && state.project.categories.length > 0;
}

function tutorialStorageKey(projectID = state?.project?.id) {
  return projectID ? `icipo:tutorial:${projectID}` : '';
}

function getTutorialStage(projectID = state?.project?.id) {
  const key = tutorialStorageKey(projectID);
  if (!key) return '';
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}

function setTutorialStage(stage, projectID = state?.project?.id) {
  const key = tutorialStorageKey(projectID);
  if (!key) return;
  try {
    if (stage) window.localStorage.setItem(key, stage);
    else window.localStorage.removeItem(key);
  } catch { /* localStorage indisponível */ }
}

function dashboardIntroStorageKey(projectID = state?.project?.id) {
  return projectID ? `icipo:dashboard-intro:${projectID}` : '';
}

function hasSeenDashboardIntro(projectID = state?.project?.id) {
  const key = dashboardIntroStorageKey(projectID);
  if (!key) return false;
  try { return window.localStorage.getItem(key) === 'seen'; } catch { return false; }
}

function markDashboardIntroSeen(projectID = state?.project?.id) {
  const key = dashboardIntroStorageKey(projectID);
  if (!key) return;
  try { window.localStorage.setItem(key, 'seen'); } catch { /* localStorage indisponível */ }
}

function clearTutorialTransitionTimer() {
  if (tutorialTransitionTimer) {
    clearTimeout(tutorialTransitionTimer);
    tutorialTransitionTimer = null;
  }
}

function updateTutorialNavLocks() {
  const requiredView = dashboardIntroRequired
    ? '__intro__'
    : (phaseCreationRequired ? 'phases' : (categoryCreationRequired ? 'categories' : null));
  $$(".navBtn").forEach((button) => {
    const locked = Boolean(requiredView && (requiredView === '__intro__' || button.dataset.view !== requiredView));
    button.classList.toggle('tutorialLocked', locked);
    button.classList.toggle('phaseLocked', locked);
    button.setAttribute('aria-disabled', locked ? 'true' : 'false');
  });
}

// Incremental token to guard against out-of-order async renders
let renderToken = 0;

function projectHasPhases() {
  return Array.isArray(state?.project?.phases) && state.project.phases.length > 0;
}

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
  dashboardAccessState = 'loading';

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
      dashboardAccessState = 'ready';
      phaseCreationRequired = !projectHasPhases();
      dashboardIntroRequired = phaseCreationRequired && !hasSeenDashboardIntro(project.id);
      const savedTutorialStage = getTutorialStage(project.id);
      categoryCreationRequired = !phaseCreationRequired
        && !projectHasCategories()
        && ['category-pending', 'category-required'].includes(savedTutorialStage);
      toggleServerOfflineNotice(false);
      toggleNoActiveProjectNotice(false);
      resolve(state);

    }).catch((err) => {
      console.log('getActiveProject failed', err);
      if(err.message === "No active project"){
        state = baseState;
        dashboardAccessState = 'project-required';
        phaseCreationRequired = false;
        dashboardIntroRequired = false;
        categoryCreationRequired = false;
        toggleServerOfflineNotice(false);
        toggleNoActiveProjectNotice(true);
        resolve(baseState);
      }else if(err.message === "WebSocket not connected"){
        state = baseState;
        dashboardAccessState = 'offline';
        phaseCreationRequired = false;
        dashboardIntroRequired = false;
        categoryCreationRequired = false;
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
  const allowedView = dashboardIntroRequired
    ? 'overview'
    : (phaseCreationRequired
      ? 'phases'
      : (categoryCreationRequired ? 'categories' : view));
  $$(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === allowedView));
  $$(".view").forEach(v => v.classList.toggle("hidden", v.id !== `view_${allowedView}`));
  if (allowedView === 'overview' && state) renderOverview();
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
  const description = project.description || "Sem descrição cadastrada.";
  const objective = project.objective || description;
  const researchers = formatResearchers(project.researchers || project.researcher) || "—";

  const projectTitle = $("#projectTitle");
  if (projectTitle) projectTitle.textContent = title;

  const meta = $("#projectMeta");
  if (meta) meta.textContent = `${researchers} — ${description}`;

  const brandSub = $("#brandSub");
  if (brandSub) brandSub.textContent = project.id ? `ID: ${project.id}` : "Sem projeto ativo";

  const sidebarResearchers = $("#sidebarResearchers");
  const sidebarObjective = $("#sidebarObjective");
  const sidebarProjectId = $("#sidebarProjectId");
  if (sidebarResearchers) {
    sidebarResearchers.textContent = researchers;
    sidebarResearchers.title = researchers;
  }
  if (sidebarObjective) {
    sidebarObjective.textContent = objective;
    sidebarObjective.title = objective;
  }
  if (sidebarProjectId) {
    sidebarProjectId.textContent = project.id || "—";
    sidebarProjectId.title = project.id || "";
  }
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

function unwrapStoragePayload(response) {
  if (!response) return {};
  if (response.data && typeof response.data === "object") return response.data;
  return typeof response === "object" ? response : {};
}

function getOverviewPaperKey(paper, fallbackIndex = 0) {
  const normalizedUrl = normalizeUrl(paper?.url || "").trim().toLowerCase();
  if (normalizedUrl) return `url:${normalizedUrl}`;
  if (paper?.id || paper?.id === 0) return `id:${paper.id}`;
  return `paper:${fallbackIndex}:${String(paper?.title || "").trim().toLowerCase()}`;
}

function mergeOverviewPaper(base = {}, incoming = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    const current = merged[key];
    const incomingHasValue = Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && value !== "";
    const currentHasValue = Array.isArray(current)
      ? current.length > 0
      : current !== undefined && current !== null && current !== "";
    if (incomingHasValue || !currentHasValue) merged[key] = value;
  }
  return merged;
}

async function loadOverviewContext() {
  let activeScope = {};
  let projectScope = {};

  try {
    activeScope = unwrapStoragePayload(await storage.get(["highlightedLinks", "svat_papers", "svat_project"]));
  } catch (error) {
    console.warn("Não foi possível carregar os artigos da fase ativa para a visão geral.", error);
  }

  try {
    if (typeof storage.getAllHighlightedLinksForActiveProject === "function") {
      projectScope = unwrapStoragePayload(await storage.getAllHighlightedLinksForActiveProject());
    }
  } catch (error) {
    console.warn("Não foi possível carregar as marcações de todas as fases.", error);
  }

  const highlightedLinks = {
    ...(projectScope.highlightedLinks || {}),
    ...(activeScope.highlightedLinks || {}),
  };

  const sources = [
    ...(Array.isArray(state?.papers) ? state.papers : []),
    ...(Array.isArray(projectScope.svat_papers) ? projectScope.svat_papers : []),
    ...(Array.isArray(activeScope.svat_papers) ? activeScope.svat_papers : []),
  ];

  const byKey = new Map();
  sources.forEach((paper, index) => {
    if (!paper || typeof paper !== "object") return;
    const key = getOverviewPaperKey(paper, index);
    byKey.set(key, mergeOverviewPaper(byKey.get(key), paper));
  });

  for (const [url, color] of Object.entries(highlightedLinks)) {
    const key = getOverviewPaperKey({ url });
    const existing = byKey.get(key) || {};
    byKey.set(key, mergeOverviewPaper(existing, {
      id: existing.id || `marked:${normalizeUrl(url).toLowerCase()}`,
      url,
      title: existing.title || url,
      highlightedColor: color,
    }));
  }

  return {
    papers: [...byKey.values()],
    highlightedLinks,
  };
}

function extractPaperYear(paper) {
  const candidates = [
    paper?.year,
    paper?.publicationYear,
    paper?.publishedYear,
    paper?.publication_date,
    paper?.publishedAt,
    paper?.date,
    paper?.authorsRaw,
    paper?.title,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;
    const direct = Number(candidate);
    if (Number.isInteger(direct) && direct > 1900 && direct < 2100) return direct;
    const match = String(candidate).match(/\b(19|20)\d{2}\b/);
    if (match) {
      const year = Number(match[0]);
      if (year > 1900 && year < 2100) return year;
    }
  }
  return null;
}

function getPaperAuthorsText(paper) {
  if (Array.isArray(paper?.authors) && paper.authors.length) {
    return paper.authors.map(author => typeof author === "string" ? author : author?.name).filter(Boolean).join(", ");
  }
  const raw = String(paper?.authorsRaw || "").trim();
  if (!raw) return "—";
  return raw.split(/\s+-\s+/)[0].trim() || raw;
}

function formatOverviewDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (includeTime && sameDay) return `Hoje, ${time}`;
  if (includeTime && isYesterday) return `Ontem, ${time}`;
  return includeTime
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : date.toLocaleDateString("pt-BR");
}

function openPapersFromOverview(_categoryKey = "all", year = "") {
  setActiveView("papers");
  const searchInput = $("#search");
  if (searchInput) searchInput.value = year === "Sem ano" ? "" : String(year || "");
  renderPapersTable();
}

async function renderOverview() {
  const { papers, highlightedLinks } = await loadOverviewContext();
  if (!state) return;

  const project = state.project || {};

  const latestPaperDate = papers
    .map(paper => paper?.updatedAt || paper?.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const updatedAt = project.updatedAt || latestPaperDate || project.createdAt;
  const updatedElement = $("#overviewUpdatedAt");
  if (updatedElement) {
    updatedElement.textContent = updatedAt
      ? `Última atualização: ${formatOverviewDate(updatedAt, true).toLowerCase()}`
      : "Última atualização: agora";
  }

  renderCategoryDistribution(papers, highlightedLinks);
  renderPhaseProgress(papers);
  renderOverviewRecentArticles(papers, highlightedLinks);
}

function buildCategoryDistribution(papers, highlightedLinks = {}) {
  const categories = Array.isArray(state?.project?.categories) ? state.project.categories : [];
  const entries = categories.map(category => ({
    key: getPaperCategoryKey(category),
    label: category.title || category.label || "Categoria",
    color: normalizeHexColor(category.color, "#4CAF50"),
    count: 0,
  })).filter(entry => entry.key);
  const byKey = new Map(entries.map(entry => [entry.key, entry]));
  let uncategorized = 0;

  for (const paper of papers) {
    const category = getPaperCategory(paper, highlightedLinks);
    const key = getPaperCategoryKey(category);
    if (key && byKey.has(key)) byKey.get(key).count += 1;
    else uncategorized += 1;
  }

  if (uncategorized > 0 || entries.length === 0) {
    entries.push({ key: "uncategorized", label: "Sem categoria", color: "#A5ADBA", count: uncategorized });
  }

  return entries;
}

function renderCategoryDistribution(papers, highlightedLinks = {}) {
  const donut = $("#categoryDonut");
  const totalElement = $("#categoryDonutTotal");
  const legend = $("#categoryLegend");
  if (!donut || !legend) return;

  const entries = buildCategoryDistribution(papers, highlightedLinks);
  const total = papers.length;
  if (totalElement) totalElement.textContent = String(total);

  if (!total) {
    donut.style.background = "conic-gradient(#E5E9F0 0 100%)";
  } else {
    let cursor = 0;
    const segments = [];
    for (const entry of entries) {
      if (!entry.count) continue;
      const start = cursor;
      cursor += (entry.count / total) * 100;
      segments.push(`${entry.color} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`);
    }
    donut.style.background = `conic-gradient(${segments.join(", ") || "#E5E9F0 0 100%"})`;
  }

  legend.innerHTML = "";
  for (const entry of entries) {
    const percentage = total ? (entry.count / total) * 100 : 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "categoryLegendRow";
    button.innerHTML = `
      <span class="categoryLegendLabel"><i style="background:${escapeHtml(entry.color)}"></i>${escapeHtml(entry.label)}</span>
      <span>${entry.count} (${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span>
    `;
    button.addEventListener("click", () => openPapersFromOverview(entry.key));
    legend.appendChild(button);
  }
}

function getPhaseOverviewStats(phase, paperCount) {
  const phasePapers = phase?.papers || {};
  const inherited = Array.isArray(phasePapers.inherited) ? phasePapers.inherited : [];
  const added = Array.isArray(phasePapers.new) ? phasePapers.new : [];
  const selected = Array.isArray(phasePapers.selected) ? phasePapers.selected : [];
  const removed = Array.isArray(phasePapers.removed) ? phasePapers.removed : [];
  const totalSet = new Set([...inherited, ...added].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  const processedSet = new Set([...selected, ...removed].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  let total = totalSet.size;
  let processed = processedSet.size;

  if (!total && phase?.label === state?.project?.activePhaseLabel && paperCount) total = paperCount;
  if (phase?.completed && total) processed = total;
  const percentage = total ? Math.min(100, Math.round((processed / total) * 100)) : (phase?.completed ? 100 : 0);
  return { total, processed, percentage };
}

function renderPhaseProgress(papers) {
  const container = $("#phaseProgressList");
  if (!container) return;
  container.replaceChildren();
  const phases = Array.isArray(state?.project?.phases) ? state.project.phases : [];

  if (!phases.length) {
    container.innerHTML = `<div class="overviewEmptyState">Crie uma fase para acompanhar o progresso do projeto.</div>`;
    return;
  }

  phases.slice(0, 6).forEach((phase, index) => {
    const stats = getPhaseOverviewStats(phase, papers.length);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "phaseProgressRow";
    row.innerHTML = `
      <span class="phaseProgressNumber">${index + 1}</span>
      <span class="phaseProgressContent">
        <span class="phaseProgressTop"><strong>${escapeHtml(phase.title || `Fase ${index + 1}`)}</strong><span>${stats.processed}/${stats.total}</span></span>
        <span class="phaseProgressTrack"><i style="width:${stats.percentage}%"></i></span>
      </span>
    `;
    row.addEventListener("click", () => setActiveView("phases"));
    container.appendChild(row);
  });
}

function getPaperPhaseTitle(paper) {
  const phases = Array.isArray(state?.project?.phases) ? state.project.phases : [];
  const requested = paper?.phaseLabel || paper?.phase || paper?.phaseId || paper?.iterationId;
  const phase = phases.find(item => [item?.label, item?.id, item?.title].filter(Boolean).includes(requested));
  if (phase) return phase.title || phase.label;
  const active = phases.find(item => item?.label === state?.project?.activePhaseLabel);
  return active?.title || active?.label || "—";
}

function renderOverviewRecentArticles(papers, highlightedLinks = {}) {
  const tbody = $("#overviewRecentTable tbody");
  if (!tbody) return;
  tbody.replaceChildren();

  const recent = [...papers]
    .sort((a, b) => String(b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.updatedAt || a?.createdAt || "")))
    .slice(0, 5);

  if (!recent.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6" class="overviewEmptyCell">Nenhum artigo marcado neste projeto.</td>`;
    tbody.appendChild(row);
    return;
  }

  for (const paper of recent) {
    const category = getPaperCategory(paper, highlightedLinks);
    const color = getPaperCategoryColor(paper, highlightedLinks) || "#A5ADBA";
    const categoryLabel = category?.title || category?.label || "Sem categoria";
    const year = extractPaperYear(paper) || "—";
    const date = paper?.updatedAt || paper?.createdAt;
    const row = document.createElement("tr");
    const title = escapeHtml(paper?.title || paper?.url || "(sem título)");
    const titleContent = paper?.url
      ? `<a href="${escapeHtml(paper.url)}" target="_blank" rel="noreferrer" title="Abrir artigo">${title}</a>`
      : title;
    row.innerHTML = `
      <td class="overviewRecentTitle">${titleContent}</td>
      <td>${escapeHtml(getPaperAuthorsText(paper))}</td>
      <td>${escapeHtml(year)}</td>
      <td><span class="overviewCategoryBadge"><i style="background:${escapeHtml(color)}"></i>${escapeHtml(categoryLabel)}</span></td>
      <td>${escapeHtml(getPaperPhaseTitle(paper))}</td>
      <td>${escapeHtml(formatOverviewDate(date, true))}</td>
    `;
    tbody.appendChild(row);
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
  };
}

function paperMatchesFilters(paper, filters, highlightedLinks = {}) {
  const category = getPaperCategory(paper, highlightedLinks);

  if (!filters.q) return true;
  const categoryText = category ? `${category.title || ""} ${category.label || ""}` : "sem categoria";
  const hay = normalizeStr(`${paper.title || ""} ${paper.authorsRaw || ""} ${(paper.tags || []).join(" ")} ${paper.year || ""} ${paper.url || ""} ${categoryText}`);
  return hay.includes(filters.q);
}

async function renderPapersTable() {
  // token for this render; only the latest token may write to the DOM
  const myToken = ++renderToken;

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
  const dashboardIntroModal = document.getElementById('dashboardIntroModal');
  const btnContinueDashboardIntro = document.getElementById('btnContinueDashboardIntro');
  const btnDashboardIntroProjects = document.getElementById('btnDashboardIntroProjects');

  function openDashboardIntro() {
    if (!dashboardIntroModal) {
      markDashboardIntroSeen();
      dashboardIntroRequired = false;
      updateTutorialNavLocks();
      requireFirstPhase();
      return;
    }

    dashboardIntroRequired = true;
    dashboardIntroModal.classList.remove('hidden');
    dashboardIntroModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dashboardIntroRequired', 'no-scroll');
    updateTutorialNavLocks();
    setActiveView('overview');
    setTimeout(() => btnContinueDashboardIntro?.focus(), 80);
  }

  function finishDashboardIntro() {
    markDashboardIntroSeen();
    dashboardIntroRequired = false;
    dashboardIntroModal?.classList.add('hidden');
    dashboardIntroModal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dashboardIntroRequired');
    if (!document.querySelector('.sidePanel.open')) document.body.classList.remove('no-scroll');
    updateTutorialNavLocks();
    requireFirstPhase();
  }

  btnContinueDashboardIntro?.addEventListener('click', finishDashboardIntro);
  btnDashboardIntroProjects?.addEventListener('click', () => {
    window.location.href = '../projects/projects.html';
  });

  // Navigation
  $$(".navBtn").forEach(btn => btn.addEventListener("click", () => {
    if (dashboardIntroRequired) {
      dashboardIntroModal?.classList.add('dashboardIntroAttention');
      setTimeout(() => dashboardIntroModal?.classList.remove('dashboardIntroAttention'), 420);
      btnContinueDashboardIntro?.focus();
      return;
    }
    if (phaseCreationRequired && btn.dataset.view !== 'phases') {
      setActiveView('phases');
      document.getElementById('phasePanel')?.classList.add('phaseGateAttention');
      setTimeout(() => document.getElementById('phasePanel')?.classList.remove('phaseGateAttention'), 450);
      document.getElementById('phaseTitle')?.focus();
      return;
    }
    if (categoryCreationRequired && btn.dataset.view !== 'categories') {
      setActiveView('categories');
      const panel = document.getElementById('categoryPanel');
      panel?.classList.add('phaseGateAttention');
      setTimeout(() => panel?.classList.remove('phaseGateAttention'), 450);
      document.getElementById('categoryTitle')?.focus();
      return;
    }
    setActiveView(btn.dataset.view);
  }));

  $$('[data-overview-view]').forEach((button) => {
    button.addEventListener('click', () => setActiveView(button.dataset.overviewView));
  });


  window.addEventListener("resize", () => {
    updateProjectMetaClamp(false);
    clearTimeout(overviewResizeTimer);
    overviewResizeTimer = setTimeout(() => {
      if (!$("#view_overview")?.classList.contains("hidden")) renderOverview();
    }, 160);
  });

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

  // Pesquisa de artigos
  $("#search").addEventListener("input", renderPapersTable);
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
  const categoryRequiredNotice = document.getElementById("categoryRequiredNotice");
  const articleTutorialPanel = document.getElementById("articleTutorialPanel");
  const btnCloseArticleTutorial = document.getElementById("btnCloseArticleTutorial");
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
    categoryPanelTitle.textContent = category
      ? "Editar categoria"
      : (categoryCreationRequired ? "Crie a primeira categoria" : "Nova categoria");
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

  function applyCategoryRequirementUI(required) {
    categoryCreationRequired = Boolean(required);
    document.body.classList.toggle('categoryCreationRequired', categoryCreationRequired);
    categoryPanel?.classList.toggle('categoryCreationRequiredPanel', categoryCreationRequired);
    categoryRequiredNotice?.classList.toggle('hidden', !categoryCreationRequired);

    if (categoryPanelTitle && !editingCategoryLabel) {
      categoryPanelTitle.textContent = categoryCreationRequired ? 'Crie a primeira categoria' : 'Nova categoria';
    }
    if (btnCloseCategory) {
      btnCloseCategory.textContent = categoryCreationRequired ? 'Voltar aos projetos' : 'Fechar';
      btnCloseCategory.title = categoryCreationRequired
        ? 'Voltar à lista de projetos'
        : 'Fechar o formulário';
    }

    updateTutorialNavLocks();
  }

  function closeCategoryPanel(force = false) {
    if (!categoryPanel) return false;
    if (categoryCreationRequired && !force) {
      categoryPanel.classList.add('phaseGateAttention');
      setTimeout(() => categoryPanel.classList.remove('phaseGateAttention'), 450);
      categoryTitleInput?.focus();
      return false;
    }

    categoryPanel.classList.remove("open");
    categoryPanel.setAttribute("aria-hidden", "true");
    categoryPanel.setAttribute("inert", "");
    const phaseOpen = document.getElementById("phasePanel")?.classList.contains("open");
    const tutorialOpen = articleTutorialPanel?.classList.contains('open');
    if (!phaseOpen && !tutorialOpen) {
      sideOverlay?.classList.remove("open");
      sideOverlay?.setAttribute("aria-hidden", "true");
      document.body.classList.remove("no-scroll");
    }
    editingCategoryLabel = null;
    return true;
  }

  function requireFirstCategory() {
    clearTutorialTransitionTimer();
    setTutorialStage('category-required');
    setActiveView('categories');
    applyCategoryRequirementUI(true);
    openCategoryPanel();
  }

  function closeArticleTutorialPanel() {
    if (!articleTutorialPanel) return;
    articleTutorialPanel.classList.remove('open');
    articleTutorialPanel.setAttribute('aria-hidden', 'true');
    articleTutorialPanel.setAttribute('inert', '');
    if (!categoryPanel?.classList.contains('open') && !document.getElementById('phasePanel')?.classList.contains('open')) {
      sideOverlay?.classList.remove('open');
      sideOverlay?.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
    }
    setTutorialStage('complete');
  }

  function openArticleTutorialPanel() {
    clearTutorialTransitionTimer();
    applyCategoryRequirementUI(false);
    setActiveView('papers');
    renderPapersTable();
    if (!articleTutorialPanel) {
      setTutorialStage('complete');
      return;
    }
    articleTutorialPanel.classList.add('open');
    articleTutorialPanel.setAttribute('aria-hidden', 'false');
    articleTutorialPanel.removeAttribute('inert');
    sideOverlay?.classList.add('open');
    sideOverlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTutorialStage('articles-open');
    setTimeout(() => btnCloseArticleTutorial?.focus(), 80);
  }

  function scheduleCategoryTutorial(delay = TUTORIAL_TRANSITION_DELAY) {
    clearTutorialTransitionTimer();
    setTutorialStage('category-pending');
    tutorialTransitionTimer = setTimeout(() => {
      tutorialTransitionTimer = null;
      if (projectHasCategories()) {
        scheduleArticlesTutorial(TUTORIAL_TRANSITION_DELAY);
        return;
      }
      requireFirstCategory();
    }, delay);
  }

  function scheduleArticlesTutorial(delay = TUTORIAL_TRANSITION_DELAY) {
    clearTutorialTransitionTimer();
    setTutorialStage('articles-pending');
    tutorialTransitionTimer = setTimeout(() => {
      tutorialTransitionTimer = null;
      openArticleTutorialPanel();
    }, delay);
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
  btnCloseCategory?.addEventListener("click", () => {
    if (categoryCreationRequired) {
      window.location.href = '../projects/projects.html';
      return;
    }
    closeCategoryPanel();
  });
  btnCloseArticleTutorial?.addEventListener('click', closeArticleTutorialPanel);
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
    const completesRequiredCategory = categoryCreationRequired && !editingCategoryLabel;
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
      renderAll();
      try {
        await updateScholarCategoryMenu();
      } catch (menuError) {
        console.warn('A categoria foi salva, mas o menu do Google Scholar não pôde ser atualizado imediatamente.', menuError);
      }

      if (completesRequiredCategory) {
        applyCategoryRequirementUI(false);
        closeCategoryPanel(true);
        scheduleArticlesTutorial(TUTORIAL_TRANSITION_DELAY);
      } else {
        closeCategoryPanel();
      }
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
      renderAll();
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
  const phasePanelTitle = document.getElementById('phasePanelTitle');
  const phaseRequiredNotice = document.getElementById('phaseRequiredNotice');
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

  function applyPhaseRequirementUI(required) {
    phaseCreationRequired = Boolean(required);
    document.body.classList.toggle('phaseCreationRequired', phaseCreationRequired);
    phasePanel?.classList.toggle('phaseCreationRequiredPanel', phaseCreationRequired);
    phaseRequiredNotice?.classList.toggle('hidden', !phaseCreationRequired);

    if (phasePanelTitle) {
      phasePanelTitle.textContent = phaseCreationRequired ? 'Crie a primeira fase' : 'Nova fase';
    }
    if (btnClosePhase) {
      btnClosePhase.textContent = phaseCreationRequired ? 'Voltar aos projetos' : 'Fechar';
      btnClosePhase.title = phaseCreationRequired
        ? 'Voltar à lista de projetos'
        : 'Fechar o formulário';
    }

    updateTutorialNavLocks();
  }

  function prepareNewPhaseForm() {
    phaseEditingCard = null;
    phaseEditingLabel = null;
    if(phaseTitleInput) phaseTitleInput.value = '';
    if(phaseDescInput) phaseDescInput.value = '';
    if(phaseCriteriaInput) phaseCriteriaInput.value = '';
    if(phaseCategoriesInput) renderPhaseCategories([]);
    phaseLabelStatus = 'pending';
    updateToggleButtonUI();
    updateSaveState();
  }

  function requireFirstPhase() {
    applyPhaseRequirementUI(true);
    setActiveView('phases');
    prepareNewPhaseForm();
    openPhasePanel(false);
  }

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
  function closePhasePanel(force = false){
    if (phaseCreationRequired && !force) {
      phasePanel?.classList.add('phaseGateAttention');
      setTimeout(() => phasePanel?.classList.remove('phaseGateAttention'), 450);
      phaseTitleInput?.focus();
      return false;
    }

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
      prepareNewPhaseForm();
      openPhasePanel(false);
    });
  }
  if (btnClosePhase) btnClosePhase.addEventListener('click', () => {
    if (phaseCreationRequired) {
      window.location.href = '../projects/projects.html';
      return;
    }
    closePhasePanel();
  });
  if (sideOverlay) sideOverlay.addEventListener('click', () => {
    if (phasePanel?.classList.contains('open')) {
      closePhasePanel();
      return;
    }
    if (categoryPanel?.classList.contains('open')) {
      closeCategoryPanel();
      return;
    }
    if (articleTutorialPanel?.classList.contains('open')) {
      closeArticleTutorialPanel();
    }
  });

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
    const completesRequiredFirstPhase = phaseCreationRequired && !phaseEditingLabel;
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
      renderHeader();
      renderOverview();
      const stillRequiresPhase = !projectHasPhases();
      applyPhaseRequirementUI(stillRequiresPhase);
      clearPhaseForm();
      if (stillRequiresPhase) {
        requireFirstPhase();
      } else {
        closePhasePanel(true);
        setActiveView('phases');
        phasesList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (completesRequiredFirstPhase) {
          scheduleCategoryTutorial(TUTORIAL_TRANSITION_DELAY);
        }
      }
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
      renderHeader();
      renderOverview();
      const requiresReplacementPhase = !projectHasPhases();
      applyPhaseRequirementUI(requiresReplacementPhase);
      clearPhaseForm();
      if (requiresReplacementPhase) {
        requireFirstPhase();
      } else {
        closePhasePanel(true);
      }
    } catch (err) {
      console.warn('deletePhase failed', err);
      alert(err?.message || 'Falha ao excluir fase. Veja o console.');
    }
  });

  applyPhaseRequirementUI(phaseCreationRequired);
  applyCategoryRequirementUI(categoryCreationRequired);
  if (phaseCreationRequired) {
    if (dashboardIntroRequired) openDashboardIntro();
    else requireFirstPhase();
  } else {
    const stage = getTutorialStage();
    if (['category-pending', 'category-required'].includes(stage)) {
      if (projectHasCategories()) scheduleArticlesTutorial(TUTORIAL_TRANSITION_DELAY);
      else if (stage === 'category-required') requireFirstCategory();
      else scheduleCategoryTutorial(TUTORIAL_TRANSITION_DELAY);
    } else if (stage === 'articles-pending') {
      scheduleArticlesTutorial(TUTORIAL_TRANSITION_DELAY);
    } else if (stage === 'articles-open') {
      openArticleTutorialPanel();
    }
  }
}

async function init() {
  await loadState();

  if (dashboardAccessState === 'project-required') {
    // O dashboard não pode ser utilizado sem um projeto ativo.
    window.location.replace('../projects/projects.html?dashboardRequiresProject=1');
    return;
  }

  bindEvents();
  renderAll();
  // Load moved features
  loadCategories();
  loadHighlightedLinks();
  setActiveView(dashboardIntroRequired ? 'overview' : (phaseCreationRequired ? 'phases' : (categoryCreationRequired ? 'categories' : 'overview')));
}

init();
