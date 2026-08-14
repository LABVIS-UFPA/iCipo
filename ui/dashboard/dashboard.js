import {
  fmtDate,
  normalizeStr,
  normalizeMetricType,
  normalizeCategoryMetricType,
  normalizeArticleUrl,
  inferMetricTypeFromCategory,
  inferFromCategory,
  hashId,
} from '../../core/utils.mjs';
import { storage, ICIPO_DATA_REVISION_KEY } from '../../infrastructure/storage.mjs';

let state = null;
let dashboardAccessState = 'loading'; // loading | ready | project-required | offline
let phaseCreationRequired = false;
let dashboardIntroRequired = false;
let categoryCreationRequired = false;
let tutorialTransitionTimer = null;
let overviewResizeTimer = null;
let paperMetricFilter = "all";
let paperCategoryFilter = "all";
let renderedPapersById = new Map();
let paperBulkBusy = false;
let paperBulkPendingOutcome = null;
let paperBulkStatusTimer = null;
let expandedCompletedPhaseLabel = null;
let refreshPhaseCards = () => {};
let syncRequirementViews = () => {};
let dashboardRefreshTimer = null;
let dashboardRefreshInFlight = null;
let dashboardRefreshQueued = false;
let liveSyncBound = false;
let lastDataRevisionId = '';
const TUTORIAL_TRANSITION_DELAY = 2000;
const LIVE_REFRESH_DEBOUNCE_MS = 220;

const PAPER_METRIC_LABELS = Object.freeze({
  included: "Incluídos",
  excluded: "Excluídos",
  duplicate: "Duplicados",
  pending: "Pendentes",
});

const PAPER_BULK_ACTION_COPY = Object.freeze({
  included: {
    button: "Incluir",
    result: "Incluído",
    singular: "incluído",
    plural: "incluídos",
  },
  excluded: {
    button: "Remover",
    result: "Removido",
    singular: "removido",
    plural: "removidos",
  },
  pending: {
    button: "Pendente",
    result: "Pendente",
    singular: "marcado como pendente",
    plural: "marcados como pendentes",
  },
});

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
  return normalizeArticleUrl(url);
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


function getContrastRatio(firstLuminance, secondLuminance) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableCategoryTextColor(backgroundColor) {
  const backgroundLuminance = getLuminanceFromHex(backgroundColor);
  const darkText = "#101828";
  const lightText = "#FFFFFF";
  const darkContrast = getContrastRatio(backgroundLuminance, getLuminanceFromHex(darkText));
  const lightContrast = getContrastRatio(backgroundLuminance, getLuminanceFromHex(lightText));

  return darkContrast >= lightContrast ? darkText : lightText;
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

function getPaperClassification(paper) {
  const classifications = paper?.classifications;
  if (!classifications || typeof classifications !== "object" || Array.isArray(classifications)) return null;

  const preferredKeys = [
    state?.project?.activePhaseLabel,
    paper?.phaseLabel,
    paper?.iterationId,
  ].filter(Boolean);

  for (const key of preferredKeys) {
    if (classifications[key] && typeof classifications[key] === "object") {
      return classifications[key];
    }
  }

  return Object.values(classifications)
    .filter(item => item && typeof item === "object")
    .sort((a, b) => String(b.classifiedAt || "").localeCompare(String(a.classifiedAt || "")))[0]
    || null;
}

function getPaperClassificationForPhase(paper, phaseLabel) {
  if (!paper || !phaseLabel) return null;
  const classifications = paper.classifications;
  if (
    classifications
    && typeof classifications === "object"
    && !Array.isArray(classifications)
    && classifications[phaseLabel]
    && typeof classifications[phaseLabel] === "object"
  ) {
    return classifications[phaseLabel];
  }

  const paperPhase = paper.phaseLabel || paper.phaseId || paper.iterationId;
  if (paperPhase !== phaseLabel) return null;
  return {
    phaseLabel,
    categoryLabel: paper.categoryLabel || null,
    outcome: paper.status || "pending",
    classifiedAt: paper.updatedAt || paper.createdAt || null,
  };
}

function getDynamicPhaseStats(phaseLabel) {
  const stats = {
    total: 0,
    inherited: 0,
    included: 0,
    excluded: 0,
    duplicate: 0,
    pending: 0,
    processed: 0,
  };

  for (const paper of Array.isArray(state?.papers) ? state.papers : []) {
    if (paper?.visited === false) continue;
    const classification = getPaperClassificationForPhase(paper, phaseLabel);
    if (!classification) continue;

    stats.total += 1;
    const entryType = String(classification.entryType || "").toLowerCase();
    if (
      classification.inherited === true
      || entryType === "inherited"
      || classification.inheritedFromPhaseLabel
    ) {
      stats.inherited += 1;
    }
    const outcome = normalizeMetricType(classification.outcome ?? paper.status, "pending");
    if (outcome === "included") stats.included += 1;
    else if (outcome === "excluded") stats.excluded += 1;
    else if (outcome === "duplicate") stats.duplicate += 1;
    else stats.pending += 1;
  }

  stats.processed = stats.included + stats.excluded + stats.duplicate;
  return stats;
}

function isInheritedPhaseClassification(classification = {}) {
  const entryType = String(classification?.entryType || "").toLowerCase();
  return classification?.inherited === true
    || entryType === "inherited"
    || Boolean(classification?.inheritedFromPhaseLabel);
}

function isPhaseCompleted(phase = {}) {
  return phase?.completed === true || String(phase?.labelStatus || "").toLowerCase() === "done";
}

function getPhaseArchiveDomId(phaseLabel) {
  return `phaseArchive_${hashId(String(phaseLabel || "fase")).slice(2)}`;
}

function getPhaseArchiveRecords(phase = {}) {
  const phaseLabel = phase?.label;
  if (!phaseLabel) return [];

  const projectPapers = Array.isArray(state?.papers) ? state.papers : [];
  const paperById = new Map();
  const paperByUrl = new Map();
  projectPapers.forEach((paper) => {
    if (!paper || typeof paper !== "object") return;
    if (paper.id || paper.id === 0) paperById.set(String(paper.id), paper);
    const normalizedUrl = normalizeUrl(paper.url || "");
    if (normalizedUrl) paperByUrl.set(normalizedUrl, paper);
  });

  const records = new Map();
  const getRecordKey = (paper = {}, fallbackReference = "") => {
    if (paper?.id || paper?.id === 0) return `id:${String(paper.id)}`;
    const normalizedUrl = normalizeUrl(paper?.url || fallbackReference || "");
    if (normalizedUrl) return `url:${normalizedUrl}`;
    return `ref:${String(fallbackReference || paper?.title || records.size)}`;
  };

  const addRecord = (paper, classification = {}, fallback = {}) => {
    const safePaper = paper && typeof paper === "object" ? paper : {};
    const safeClassification = classification && typeof classification === "object"
      ? classification
      : {};
    const key = getRecordKey(safePaper, fallback.reference);
    const inherited = fallback.inherited === true
      || isInheritedPhaseClassification(safeClassification);
    const paperPhaseLabel = safePaper.phaseLabel || safePaper.phaseId || safePaper.iterationId;
    const categoryLabel = safeClassification.categoryLabel
      || fallback.categoryLabel
      || (paperPhaseLabel === phaseLabel ? safePaper.categoryLabel : null)
      || null;
    let outcome = normalizeMetricType(
      safeClassification.outcome
        ?? fallback.outcome
        ?? (paperPhaseLabel === phaseLabel ? safePaper.status : "pending"),
      "pending"
    );
    if (
      paperPhaseLabel === phaseLabel
      && (safePaper.autoDuplicate === true || safePaper.duplicateOfId)
    ) {
      outcome = "duplicate";
    }
    const classifiedAt = safeClassification.classifiedAt
      || fallback.classifiedAt
      || safePaper.updatedAt
      || safePaper.createdAt
      || null;

    const current = records.get(key);
    if (current) {
      current.inherited = current.inherited || inherited;
      current.inheritedFromPhaseLabel = current.inheritedFromPhaseLabel
        || safeClassification.inheritedFromPhaseLabel
        || fallback.inheritedFromPhaseLabel
        || null;
      return current;
    }

    const record = {
      key,
      paper: safePaper,
      classification: safeClassification,
      outcome,
      categoryLabel,
      classifiedAt,
      inherited,
      inheritedFromPhaseLabel: safeClassification.inheritedFromPhaseLabel
        || fallback.inheritedFromPhaseLabel
        || null,
    };
    records.set(key, record);
    return record;
  };

  for (const paper of projectPapers) {
    const classification = getPaperClassificationForPhase(paper, phaseLabel);
    if (!classification) continue;
    addRecord(paper, classification);
  }

  const resolveReference = (reference) => {
    if (reference && typeof reference === "object") return reference;
    const rawReference = String(reference ?? "").trim();
    if (!rawReference) return null;
    return paperById.get(rawReference)
      || paperByUrl.get(normalizeUrl(rawReference))
      || {
        id: rawReference,
        title: `Registro ${rawReference}`,
        url: /^https?:\/\//i.test(rawReference) ? rawReference : "",
      };
  };

  const phasePapers = phase?.papers && typeof phase.papers === "object" ? phase.papers : {};
  const addBucket = (values, fallback = {}) => {
    for (const reference of Array.isArray(values) ? values : []) {
      const paper = resolveReference(reference);
      if (!paper) continue;
      addRecord(paper, {}, { ...fallback, reference });
    }
  };

  // Compatibilidade com projetos antigos que possuem apenas os grupos salvos
  // no card da fase, sem classificação completa em cada artigo.
  addBucket(phasePapers.selected, { outcome: "included" });
  addBucket(phasePapers.removed, { outcome: "excluded" });
  addBucket(phasePapers.new, { outcome: "pending" });
  addBucket(phasePapers.inherited, { inherited: true, outcome: "pending" });

  return [...records.values()].sort((first, second) => {
    const dateOrder = String(second.classifiedAt || "").localeCompare(String(first.classifiedAt || ""));
    if (dateOrder) return dateOrder;
    const firstTitle = String(first.paper?.title || first.paper?.url || first.paper?.id || "");
    const secondTitle = String(second.paper?.title || second.paper?.url || second.paper?.id || "");
    return firstTitle.localeCompare(secondTitle, "pt-BR");
  });
}

function getPhaseArchiveOutcomeLabel(outcome) {
  const normalizedOutcome = normalizeMetricType(outcome, "pending");
  if (normalizedOutcome === "included") return "Selecionado";
  if (normalizedOutcome === "excluded") return "Removido";
  if (normalizedOutcome === "duplicate") return "Duplicado";
  return "Pendente";
}

function getPhaseArchiveCategory(record) {
  if (!record || record.outcome === "duplicate") return null;
  const categoryLabel = String(record.categoryLabel || "").trim().toLowerCase();
  if (!categoryLabel) return null;
  return (Array.isArray(state?.project?.categories) ? state.project.categories : []).find((category) => {
    const label = String(category?.label || "").trim().toLowerCase();
    const title = String(category?.title || "").trim().toLowerCase();
    return label === categoryLabel || title === categoryLabel;
  }) || null;
}

function createPhaseArchiveArticleItem(record) {
  const paper = record?.paper || {};
  const outcome = normalizeMetricType(record?.outcome, "pending");
  const category = getPhaseArchiveCategory(record);
  const categoryColor = normalizeHexColor(category?.color, "#A5ADBA");
  const categoryName = outcome === "duplicate"
    ? "Duplicado automático"
    : (category?.title || category?.label || record?.categoryLabel || "Sem categoria");
  const title = String(paper.title || paper.url || paper.id || "Artigo sem título").trim();
  const article = document.createElement("article");
  article.className = `phaseArchiveArticle phaseArchiveArticle--${outcome}`;

  const heading = document.createElement("div");
  heading.className = "phaseArchiveArticleHeading";
  const validUrl = /^https?:\/\//i.test(String(paper.url || ""));
  const titleElement = document.createElement(validUrl ? "a" : "span");
  titleElement.className = "phaseArchiveArticleTitle";
  titleElement.textContent = title;
  titleElement.title = title;
  if (validUrl) {
    titleElement.href = paper.url;
    titleElement.target = "_blank";
    titleElement.rel = "noreferrer";
  }

  const outcomeBadge = document.createElement("span");
  outcomeBadge.className = `phaseArchiveOutcome phaseArchiveOutcome--${outcome}`;
  outcomeBadge.textContent = getPhaseArchiveOutcomeLabel(outcome);
  heading.append(titleElement, outcomeBadge);

  const metaParts = [];
  const authors = getPaperAuthorsText(paper);
  if (authors && authors !== "—") metaParts.push(authors);
  const year = extractPaperYear(paper);
  if (year) metaParts.push(String(year));
  if (record?.classifiedAt) metaParts.push(formatOverviewDate(record.classifiedAt, true));

  const meta = document.createElement("div");
  meta.className = "phaseArchiveArticleMeta";
  meta.textContent = metaParts.length ? metaParts.join(" · ") : "Sem metadados adicionais";

  const badges = document.createElement("div");
  badges.className = "phaseArchiveArticleBadges";

  const categoryBadge = document.createElement("span");
  categoryBadge.className = "phaseArchiveCategoryBadge";
  const categoryMarker = document.createElement("i");
  categoryMarker.style.backgroundColor = categoryColor;
  categoryMarker.setAttribute("aria-hidden", "true");
  const categoryText = document.createElement("span");
  categoryText.textContent = categoryName;
  categoryBadge.append(categoryMarker, categoryText);
  badges.appendChild(categoryBadge);

  const originBadge = document.createElement("span");
  originBadge.className = record?.inherited
    ? "phaseArchiveOriginBadge phaseArchiveOriginBadge--inherited"
    : "phaseArchiveOriginBadge";
  const inheritedFromPhase = record?.inheritedFromPhaseLabel
    ? (Array.isArray(state?.project?.phases) ? state.project.phases : [])
        .find(phase => phase?.label === record.inheritedFromPhaseLabel)
    : null;
  const inheritedFromName = inheritedFromPhase?.title || record?.inheritedFromPhaseLabel || "";
  originBadge.textContent = record?.inherited
    ? `Herdado${inheritedFromName ? ` de ${inheritedFromName}` : ""}`
    : "Novo na fase";
  badges.appendChild(originBadge);

  article.append(heading, meta, badges);
  return article;
}

function createPhaseArchiveGroup({ title, description, tone, records }) {
  const group = document.createElement("section");
  group.className = `phaseArchiveGroup phaseArchiveGroup--${tone}`;

  const header = document.createElement("div");
  header.className = "phaseArchiveGroupHeader";
  const headingWrap = document.createElement("div");
  headingWrap.className = "phaseArchiveGroupHeading";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const sub = document.createElement("p");
  sub.textContent = description;
  headingWrap.append(heading, sub);
  const count = document.createElement("span");
  count.className = "phaseArchiveGroupCount";
  count.textContent = String(records.length);
  header.append(headingWrap, count);

  const list = document.createElement("div");
  list.className = "phaseArchiveArticleList";
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "phaseArchiveEmpty";
    empty.textContent = "Nenhum artigo neste grupo.";
    list.appendChild(empty);
  } else {
    records.forEach(record => list.appendChild(createPhaseArchiveArticleItem(record)));
  }

  group.append(header, list);
  return group;
}

function createCompletedPhaseArchivePanel(phase = {}) {
  const phaseLabel = phase?.label || "";
  const panelId = getPhaseArchiveDomId(phaseLabel);
  const records = getPhaseArchiveRecords(phase);
  const selected = records.filter(record => record.outcome === "included");
  const removed = records.filter(record => record.outcome === "excluded" || record.outcome === "duplicate");
  const inherited = records.filter(record => record.inherited);
  const pending = records.filter(record => record.outcome === "pending");

  const panel = document.createElement("section");
  panel.id = panelId;
  panel.className = "phaseArchivePanel";
  panel.dataset.phaseArchiveLabel = phaseLabel;
  panel.hidden = expandedCompletedPhaseLabel !== phaseLabel;
  panel.setAttribute("aria-label", `Artigos trabalhados na fase ${phase.title || phaseLabel}`);

  const header = document.createElement("div");
  header.className = "phaseArchiveHeader";
  const headerText = document.createElement("div");
  headerText.className = "phaseArchiveHeaderText";
  const eyebrow = document.createElement("span");
  eyebrow.className = "phaseArchiveEyebrow";
  eyebrow.textContent = "Histórico da fase concluída";
  const title = document.createElement("h3");
  title.textContent = phase.title || phaseLabel || "Fase";
  const description = document.createElement("p");
  description.textContent = inherited.length
    ? `${records.length} artigo${records.length === 1 ? "" : "s"} trabalhado${records.length === 1 ? "" : "s"}. Artigos herdados também aparecem no grupo do resultado final da triagem.`
    : `${records.length} artigo${records.length === 1 ? "" : "s"} trabalhado${records.length === 1 ? "" : "s"} nesta fase.`;
  headerText.append(eyebrow, title, description);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn phaseArchiveClose";
  closeButton.textContent = "Fechar lista";
  closeButton.addEventListener("click", () => toggleCompletedPhaseArchive(phaseLabel));
  header.append(headerText, closeButton);

  const summary = document.createElement("div");
  summary.className = "phaseArchiveSummary";
  const summaryItems = [
    ["Selecionados", selected.length, "selected"],
    ["Removidos", removed.length, "removed"],
    ["Herdados", inherited.length, "inherited"],
  ];
  if (pending.length) summaryItems.push(["Pendentes", pending.length, "pending"]);
  for (const [label, value, tone] of summaryItems) {
    const item = document.createElement("span");
    item.className = `phaseArchiveSummaryItem phaseArchiveSummaryItem--${tone}`;
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    summary.appendChild(item);
  }

  const groups = document.createElement("div");
  groups.className = "phaseArchiveGroups";
  groups.appendChild(createPhaseArchiveGroup({
    title: "Selecionados",
    description: "Artigos incluídos ao final da triagem desta fase.",
    tone: "selected",
    records: selected,
  }));
  groups.appendChild(createPhaseArchiveGroup({
    title: "Removidos",
    description: "Artigos excluídos ou identificados automaticamente como duplicados.",
    tone: "removed",
    records: removed,
  }));
  if (inherited.length) {
    groups.appendChild(createPhaseArchiveGroup({
      title: "Herdados",
      description: "Artigos recebidos da fase anterior e submetidos a uma nova triagem.",
      tone: "inherited",
      records: inherited,
    }));
  }
  if (pending.length) {
    groups.appendChild(createPhaseArchiveGroup({
      title: "Pendentes",
      description: "Registros antigos que ainda não possuem uma decisão final nesta fase.",
      tone: "pending",
      records: pending,
    }));
  }

  panel.append(header, summary, groups);
  return panel;
}

function applyCompletedPhaseArchiveState({ scroll = false } = {}) {
  const phasesList = document.getElementById("phasesList");
  if (!phasesList) return;

  phasesList.querySelectorAll(".phaseCard[data-label]").forEach((card) => {
    const isCompleted = card.classList.contains("phaseCard--completed");
    const isOpen = isCompleted && card.dataset.label === expandedCompletedPhaseLabel;
    card.classList.toggle("phaseCard--archive-open", isOpen);
    if (isCompleted) card.setAttribute("aria-expanded", String(isOpen));
    const toggleButton = card.querySelector('[data-action="archive"]');
    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", String(isOpen));
      toggleButton.classList.toggle("is-open", isOpen);
      const label = toggleButton.querySelector("span:first-child");
      if (label) label.textContent = isOpen ? "Ocultar artigos" : "Ver artigos";
    }
  });

  phasesList.querySelectorAll(".phaseArchivePanel").forEach((panel) => {
    const isOpen = panel.dataset.phaseArchiveLabel === expandedCompletedPhaseLabel;
    panel.hidden = !isOpen;
    panel.classList.toggle("is-open", isOpen);
  });

  if (scroll && expandedCompletedPhaseLabel) {
    const panel = [...phasesList.querySelectorAll(".phaseArchivePanel")]
      .find(item => item.dataset.phaseArchiveLabel === expandedCompletedPhaseLabel);
    setTimeout(() => panel?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 0);
  }
}

function toggleCompletedPhaseArchive(phaseLabel) {
  expandedCompletedPhaseLabel = expandedCompletedPhaseLabel === phaseLabel ? null : phaseLabel;
  applyCompletedPhaseArchiveState({ scroll: Boolean(expandedCompletedPhaseLabel) });
}

function getPaperCategory(paper, highlightedLinks = {}) {
  if (paper?.autoDuplicate) return null;
  const categories = Array.isArray(state?.project?.categories) ? state.project.categories : [];
  const classification = getPaperClassification(paper);
  const explicitCategoryCandidates = [
    classification?.categoryLabel,
    paper?.categoryLabel,
    paper?.categoryId,
    typeof paper?.category === "string" ? paper.category : "",
  ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);

  const categoryByReference = categories.find(cat => {
    const label = String(cat?.label || "").trim().toLowerCase();
    const title = String(cat?.title || "").trim().toLowerCase();
    return (label && explicitCategoryCandidates.includes(label))
      || (title && explicitCategoryCandidates.includes(title));
  });
  if (categoryByReference) return categoryByReference;

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

function getPaperMetricType(paper, highlightedLinks = {}) {
  if (paper?.autoDuplicate || (paper?.duplicateOfId && normalizeMetricType(paper?.status, "pending") === "duplicate")) {
    return "duplicate";
  }

  const category = getPaperCategory(paper, highlightedLinks);
  if (category) {
    return normalizeMetricType(category.metricType, inferMetricTypeFromCategory(category));
  }

  const classification = getPaperClassification(paper);
  const fallbackCategory = classification?.categoryLabel
    || paper?.categoryLabel
    || (Array.isArray(paper?.tags) ? paper.tags.join(" ") : "");
  return normalizeMetricType(
    classification?.outcome ?? paper?.status,
    inferMetricTypeFromCategory(fallbackCategory)
  );
}

function getPaperMetricLabel(metricType) {
  return PAPER_METRIC_LABELS[normalizeMetricType(metricType, "pending")] || "Pendentes";
}

function getDuplicateCandidateLabel(paper) {
  const title = String(paper?.title || paper?.url || paper?.id || "Artigo sem título").trim();
  const compactTitle = title.length > 72 ? `${title.slice(0, 69)}…` : title;
  const year = extractPaperYear(paper);
  return year ? `${compactTitle} (${year})` : compactTitle;
}

function renderDuplicateOriginalSelect(paper, candidates = []) {
  const selectedId = String(paper?.duplicateOfId ?? "");
  const original = candidates.find(candidate => String(candidate?.id ?? "") === selectedId) || null;
  const originalLabel = original
    ? getDuplicateCandidateLabel(original)
    : (selectedId ? `Registro ${selectedId}` : "Original não localizado");

  return `
    <span class="duplicateRelation">
      <span class="duplicateOriginalAutomatic" title="Vínculo identificado automaticamente pelo endereço do artigo">
        Original: ${escapeHtml(originalLabel)}
      </span>
      <small>Vínculo automático pelo mesmo link</small>
    </span>
  `;
}

function applyCategoryMetricToPaper(paper, category, previousLabel = category?.label) {
  if (!paper || paper.autoDuplicate || !category?.label) return false;
  const labels = new Set([previousLabel, category.label].filter(Boolean));
  const tags = Array.isArray(paper.tags) ? paper.tags : [];
  const classifications = paper.classifications
    && typeof paper.classifications === "object"
    && !Array.isArray(paper.classifications)
    ? paper.classifications
    : {};
  const matchingClassifications = Object.values(classifications)
    .filter(item => item && labels.has(item.categoryLabel));
  const matches = labels.has(paper.categoryLabel)
    || tags.some(tag => labels.has(tag))
    || matchingClassifications.length > 0;

  if (!matches) return false;

  const metricType = normalizeCategoryMetricType(category.metricType, inferMetricTypeFromCategory(category));
  paper.categoryLabel = category.label;
  paper.status = metricType;
  if (metricType !== "duplicate") paper.duplicateOfId = null;
  paper.tags = [...new Set(tags.map(tag => labels.has(tag) ? category.label : tag))];

  for (const classification of matchingClassifications) {
    classification.categoryLabel = category.label;
    classification.outcome = metricType;
  }

  return true;
}

async function syncCategoryMetricAcrossActivePapers(category, previousLabel = category?.label) {
  if (!category?.label) return;

  try {
    const scoped = await storage.get(["svat_papers"]);
    const scopedPapers = Array.isArray(scoped?.svat_papers) ? scoped.svat_papers : [];
    let scopedChanged = false;
    for (const paper of scopedPapers) {
      scopedChanged = applyCategoryMetricToPaper(paper, category, previousLabel) || scopedChanged;
    }
    if (scopedChanged) await storage.set({ svat_papers: scopedPapers });
  } catch (error) {
    console.warn("Não foi possível atualizar a métrica dos artigos da fase ativa.", error);
  }

  const projectPapers = Array.isArray(state?.papers) ? state.papers : [];
  for (const paper of projectPapers) {
    if (!applyCategoryMetricToPaper(paper, category, previousLabel)) continue;
    try {
      await storage.savePaper(paper);
    } catch (error) {
      console.warn("Não foi possível atualizar a métrica de um artigo persistido.", error);
    }
  }
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

function getCategoryDeletionBlockReason(project, categoryLabel) {
  const categories = Array.isArray(project?.categories) ? project.categories : [];
  if (categories.length <= 1) {
    return "O projeto deve manter pelo menos uma categoria.";
  }

  const blockingPhases = (Array.isArray(project?.phases) ? project.phases : [])
    .filter(phase => {
      const assigned = Array.isArray(phase?.categories) ? phase.categories : [];
      return assigned.includes(categoryLabel) && assigned.length <= 1;
    });
  if (blockingPhases.length) {
    const names = blockingPhases.map(phase => phase.title || phase.label).join(", ");
    return `Vincule outra categoria antes de excluir. Esta é a única categoria ativa em: ${names}.`;
  }

  return "";
}

function loadCategories({ refreshContextMenu = true } = {}) {
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
    const color = normalizeHexColor(cat.color, "#FFFFFF");
    const metricType = normalizeCategoryMetricType(cat.metricType, inferMetricTypeFromCategory(cat));
    const textColor = getReadableCategoryTextColor(color);
    const usesDarkText = textColor === "#101828";

    const li = document.createElement("li");
    li.style.backgroundColor = color;
    li.style.setProperty("--category-foreground", textColor);
    li.style.setProperty("--category-description", textColor);
    li.dataset.categoryTone = usesDarkText ? "light" : "dark";

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

    const metricBadge = document.createElement("span");
    metricBadge.className = `categoryMetricBadge categoryMetricBadge--${metricType}`;
    metricBadge.textContent = getPaperMetricLabel(metricType);
    metricBadge.title = `Impacto na métrica: ${getPaperMetricLabel(metricType)}`;

    const editBtn = document.createElement("button");
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("icipo:edit-category", { detail: { label: categoryLabel } }));
    });

    const btn = document.createElement("button");
    btn.textContent = "Excluir";
    const deletionBlockReason = getCategoryDeletionBlockReason(project, categoryLabel);
    btn.disabled = Boolean(deletionBlockReason);
    btn.title = deletionBlockReason || `Excluir a categoria ${category}`;
    btn.addEventListener("click", () => {
      if (deletionBlockReason) return alert(deletionBlockReason);
      if (!confirm(`Excluir a categoria "${category}"?`)) return;
      try {
        project.removeCategory(categoryLabel);
        persistProjectAndReload();
      } catch (error) {
        alert(error?.message || "Não foi possível excluir a categoria.");
      }
    });

    right.appendChild(metricBadge);
    right.appendChild(meta);
    right.appendChild(editBtn);
    right.appendChild(btn);

    li.appendChild(left);
    li.appendChild(right);

    categoryList.appendChild(li);
  }

  if (refreshContextMenu && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ action: "updateContextMenu" }, () => {
      // A ausência temporária do service worker não deve impedir a renderização
      // das categorias no dashboard.
      void chrome.runtime.lastError;
    });
  }
}

function getPaperClassificationsMap(paper) {
  return paper?.classifications
    && typeof paper.classifications === "object"
    && !Array.isArray(paper.classifications)
    ? { ...paper.classifications }
    : {};
}

function getLatestRemainingClassification(classifications) {
  const phases = Array.isArray(state?.project?.phases) ? state.project.phases : [];
  for (let index = phases.length - 1; index >= 0; index -= 1) {
    const phaseLabel = phases[index]?.label;
    if (phaseLabel && classifications?.[phaseLabel]) {
      return [phaseLabel, classifications[phaseLabel]];
    }
  }

  return Object.entries(classifications || {})
    .filter(([, classification]) => classification && typeof classification === "object")
    .sort(([, first], [, second]) => (
      String(second?.classifiedAt || "").localeCompare(String(first?.classifiedAt || ""))
    ))[0] || null;
}

function removePaperClassificationFromActivePhase(paper) {
  const activePhaseLabel = state?.project?.activePhaseLabel;
  if (!paper || !activePhaseLabel) return null;

  const classifications = getPaperClassificationsMap(paper);
  delete classifications[activePhaseLabel];

  const updatedAt = new Date().toISOString();
  const history = Array.isArray(paper.history) ? [...paper.history] : [];
  history.push({
    ts: updatedAt,
    action: "unmark",
    details: { phaseLabel: activePhaseLabel, visited: false },
  });

  const latest = getLatestRemainingClassification(classifications);
  if (!latest) {
    return {
      ...paper,
      classifications: {},
      phaseLabel: null,
      iterationId: null,
      categoryLabel: null,
      status: paper.autoDuplicate ? "duplicate" : "pending",
      duplicateOfId: paper.autoDuplicate ? (paper.duplicateOfId || null) : null,
      visited: false,
      updatedAt,
      history,
    };
  }

  const [latestPhaseLabel, latestClassification] = latest;
  const categoryLabels = new Set(
    (Array.isArray(state?.project?.categories) ? state.project.categories : [])
      .map(category => category?.label)
      .filter(Boolean)
  );
  const categoryLabel = paper.autoDuplicate
    ? null
    : (latestClassification?.categoryLabel || null);
  const baseTags = (Array.isArray(paper.tags) ? paper.tags : [])
    .filter(tag => !categoryLabels.has(tag) && tag !== "duplicado-automatico");
  const tags = paper.autoDuplicate
    ? [...new Set([...baseTags, "duplicado-automatico"])]
    : [...new Set([...baseTags, ...(categoryLabel ? [categoryLabel] : [])])];

  return {
    ...paper,
    classifications,
    phaseLabel: latestClassification?.phaseLabel || latestPhaseLabel,
    iterationId: latestClassification?.phaseLabel || latestPhaseLabel,
    categoryLabel,
    status: paper.autoDuplicate
      ? "duplicate"
      : normalizeMetricType(latestClassification?.outcome, "pending"),
    duplicateOfId: paper.autoDuplicate ? (paper.duplicateOfId || null) : null,
    tags,
    visited: true,
    updatedAt,
    history,
  };
}

async function removeUrlsFromActivePhase(urls = []) {
  const targets = new Set(
    (Array.isArray(urls) ? urls : [urls])
      .map(normalizeUrl)
      .filter(Boolean)
  );
  if (!targets.size) return;

  const activePhaseLabel = state?.project?.activePhaseLabel;
  if (!activePhaseLabel) throw new Error("Nenhuma fase ativa disponível.");

  const data = await storage.get(["highlightedLinks", "svat_papers"]);
  const highlightedLinks = data?.highlightedLinks && typeof data.highlightedLinks === "object"
    ? { ...data.highlightedLinks }
    : {};
  for (const storedUrl of Object.keys(highlightedLinks)) {
    if (targets.has(normalizeUrl(storedUrl))) delete highlightedLinks[storedUrl];
  }

  const scopedPapers = Array.isArray(data?.svat_papers) ? data.svat_papers : [];
  const removedScopedPapers = scopedPapers.filter(paper => targets.has(normalizeUrl(paper?.url)));
  const remainingScopedPapers = scopedPapers.filter(paper => !targets.has(normalizeUrl(paper?.url)));

  // Retira imediatamente os itens da fase ativa. Os arquivos consolidados são
  // atualizados em seguida sem apagar classificações de fases anteriores.
  await storage.set({ highlightedLinks, svat_papers: remainingScopedPapers });

  const processedIds = new Set();
  for (const scopedPaper of removedScopedPapers) {
    const paperId = scopedPaper?.id;
    if ((!paperId && paperId !== 0) || processedIds.has(String(paperId))) continue;
    processedIds.add(String(paperId));

    let persistedPaper = null;
    try {
      persistedPaper = await storage.loadPaper(paperId);
      if (persistedPaper && typeof persistedPaper.toJSON === "function") {
        persistedPaper = persistedPaper.toJSON();
      }
    } catch (_) {
      persistedPaper = null;
    }

    const mergedPaper = {
      ...(persistedPaper || {}),
      ...scopedPaper,
      classifications: {
        ...getPaperClassificationsMap(persistedPaper),
        ...getPaperClassificationsMap(scopedPaper),
      },
    };
    const nextPaper = removePaperClassificationFromActivePhase(mergedPaper);

    await storage.savePaper(nextPaper);
    const stateIndex = (state?.papers || []).findIndex(paper => String(paper?.id) === String(paperId));
    if (stateIndex >= 0) state.papers[stateIndex] = nextPaper;
    else if (Array.isArray(state?.papers)) state.papers.push(nextPaper);
  }
}

async function deleteMarkedLink(urlToDelete, done) {
  await removeUrlsFromActivePhase([urlToDelete]);
  if (done) done();
}

function loadHighlightedLinks() {
  const highlightedList = document.getElementById("highlightedList");
  if (!highlightedList) return Promise.resolve();
  return storage.get(["highlightedLinks", "svat_papers"]).then((data) => {
    const links = (data && data.highlightedLinks) ? data.highlightedLinks : {};
    const papers = Array.isArray(data && data.svat_papers) ? data.svat_papers : [];
    renderHighlighted(links, papers);
  }).catch((error) => {
    console.warn("Não foi possível atualizar a lista de links marcados.", error);
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

function getPaperCellBeingEdited() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement
    && activeElement.classList.contains("cellInput")
    && activeElement.closest("#papersTable")
    ? activeElement
    : null;
}

async function refreshDashboardFromStorage(reason = "external_change") {
  if (dashboardRefreshInFlight) {
    dashboardRefreshQueued = true;
    return dashboardRefreshInFlight;
  }

  const previousState = state;
  dashboardRefreshInFlight = (async () => {
    try {
      await loadState();

      if (dashboardAccessState === "project-required") {
        window.location.replace('../projects/projects.html?dashboardRequiresProject=1');
        return;
      }

      if (dashboardAccessState !== "ready") {
        // Uma oscilação de conexão não deve apagar os dados que já estavam
        // visíveis. Assim que o WebSocket reconectar, server_status dispara
        // uma nova tentativa automaticamente.
        if (previousState?.project?.id) state = previousState;
        return;
      }

      renderHeader();
      updatePaperFilterBar();
      loadCategories({ refreshContextMenu: false });
      refreshPhaseCards();
      syncRequirementViews();

      const renderTasks = [
        renderOverview(),
        loadHighlightedLinks(),
      ];

      const editingPaperCell = getPaperCellBeingEdited();
      if (editingPaperCell) {
        // Não substitui uma célula enquanto o usuário está digitando. O blur
        // da própria célula salva o valor e uma nova revisão atualiza a tabela.
        editingPaperCell.addEventListener(
          "blur",
          () => scheduleDashboardRefresh("paper_cell_blur", 60),
          { once: true }
        );
      } else {
        renderTasks.push(renderPapersTable());
      }

      await Promise.allSettled(renderTasks);
      console.debug("iCipo: dashboard sincronizado.", reason);
    } catch (error) {
      if (previousState?.project?.id) state = previousState;
      console.warn("Não foi possível atualizar automaticamente o dashboard.", error);
    }
  })();

  try {
    await dashboardRefreshInFlight;
  } finally {
    dashboardRefreshInFlight = null;
    if (dashboardRefreshQueued) {
      dashboardRefreshQueued = false;
      scheduleDashboardRefresh("queued_change", 40);
    }
  }
}

function scheduleDashboardRefresh(reason = "external_change", delay = LIVE_REFRESH_DEBOUNCE_MS) {
  clearTimeout(dashboardRefreshTimer);
  dashboardRefreshTimer = setTimeout(() => {
    dashboardRefreshTimer = null;
    refreshDashboardFromStorage(reason);
  }, Math.max(0, delay));
}

function bindLiveDataSync() {
  if (liveSyncBound) return;
  liveSyncBound = true;

  if (typeof chrome !== "undefined" && chrome.storage?.local && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      const revision = changes[ICIPO_DATA_REVISION_KEY]?.newValue;
      if (revision) {
        const revisionId = String(revision.id || revision.at || "");
        if (!revisionId || revisionId !== lastDataRevisionId) {
          lastDataRevisionId = revisionId;
          scheduleDashboardRefresh(revision.reason || "data_revision");
        }
      }

      if (changes.server_status?.newValue === "Conectado") {
        scheduleDashboardRefresh("server_reconnected", 80);
      }
    });

    // Registra o listener antes de ler a revisão atual. Assim, uma marcação
    // feita durante a abertura do dashboard não cai no intervalo entre a
    // primeira leitura dos artigos e a ativação da sincronização ao vivo.
    chrome.storage.local.get([ICIPO_DATA_REVISION_KEY], (data) => {
      const revision = data?.[ICIPO_DATA_REVISION_KEY];
      const revisionId = String(revision?.id || revision?.at || "");
      if (revisionId && revisionId !== lastDataRevisionId) {
        lastDataRevisionId = revisionId;
        scheduleDashboardRefresh(revision?.reason || "initial_revision_sync", 80);
      }
    });
  }

  // Salvaguardas para páginas que ficaram congeladas ou suspensas pelo
  // navegador enquanto o usuário trabalhava no Google Scholar.
  window.addEventListener("focus", () => scheduleDashboardRefresh("window_focus", 60));
  window.addEventListener("pageshow", () => scheduleDashboardRefresh("page_show", 60));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleDashboardRefresh("tab_visible", 60);
    }
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

function computeOverviewMetrics(papers = [], highlightedLinks = {}) {
  const metrics = {
    total: 0,
    included: 0,
    excluded: 0,
    duplicate: 0,
    pending: 0,
  };

  for (const paper of papers) {
    metrics.total += 1;
    const metricType = getPaperMetricType(paper, highlightedLinks);
    if (metricType === "included") metrics.included += 1;
    else if (metricType === "excluded") metrics.excluded += 1;
    else if (metricType === "duplicate") metrics.duplicate += 1;
    else metrics.pending += 1;
  }

  return metrics;
}

function formatMetricPercentage(value, total) {
  const percentage = total ? (value / total) * 100 : 0;
  return `${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`;
}

function renderPaperMetrics(papers, highlightedLinks = {}) {
  const metrics = computeOverviewMetrics(papers, highlightedLinks);
  const total = $("#paperMetricTotal");
  const included = $("#paperMetricIncluded");
  const excluded = $("#paperMetricExcluded");
  const pending = $("#paperMetricPending");
  const duplicate = $("#paperMetricDuplicate");
  const totalDetail = $("#paperMetricTotalDetail");
  const includedDetail = $("#paperMetricIncludedDetail");
  const excludedDetail = $("#paperMetricExcludedDetail");
  const pendingDetail = $("#paperMetricPendingDetail");
  const duplicateDetail = $("#paperMetricDuplicateDetail");

  if (total) total.textContent = String(metrics.total);
  if (included) included.textContent = String(metrics.included);
  if (excluded) excluded.textContent = String(metrics.excluded);
  if (pending) pending.textContent = String(metrics.pending);
  if (duplicate) duplicate.textContent = String(metrics.duplicate);

  if (totalDetail) {
    totalDetail.textContent = !metrics.total
      ? "Nenhum artigo registrado"
      : metrics.pending
        ? `${metrics.pending} pendente${metrics.pending === 1 ? "" : "s"} de classificação`
        : "Todos os artigos estão classificados";
  }
  if (includedDetail) includedDetail.textContent = formatMetricPercentage(metrics.included, metrics.total);
  if (excludedDetail) excludedDetail.textContent = formatMetricPercentage(metrics.excluded, metrics.total);
  if (pendingDetail) pendingDetail.textContent = formatMetricPercentage(metrics.pending, metrics.total);
  if (duplicateDetail) duplicateDetail.textContent = formatMetricPercentage(metrics.duplicate, metrics.total);
}

function ensureHistory(p) {
  if (!p.history || !Array.isArray(p.history)) p.history = [];
  return p.history;
}

function pushHistory(paper, action, details = {}) {
  if (!paper) return;
  const history = ensureHistory(paper);
  history.push({ ts: new Date().toISOString(), action, details });
  if (history.length > 200) paper.history = history.slice(history.length - 200);
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
  if (paper?.autoDuplicate && (paper?.id || paper?.id === 0)) {
    return `duplicate:${paper.id}`;
  }
  const normalizedUrl = normalizeUrl(paper?.url || "").trim().toLowerCase();
  if (normalizedUrl) return `url:${normalizedUrl}`;
  if (paper?.id || paper?.id === 0) return `id:${paper.id}`;
  return `paper:${fallbackIndex}:${String(paper?.title || "").trim().toLowerCase()}`;
}

function mergeOverviewPaper(base = {}, incoming = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    const current = merged[key];

    if (
      key === "classifications"
      && current && typeof current === "object" && !Array.isArray(current)
      && value && typeof value === "object" && !Array.isArray(value)
    ) {
      merged[key] = { ...current, ...value };
      continue;
    }

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
    console.warn("Não foi possível carregar as marcações da fase ativa.", error);
  }

  const highlightedLinks = {
    ...(projectScope.highlightedLinks || {}),
    ...(activeScope.highlightedLinks || {}),
  };

  const activePhaseLabel = state?.project?.activePhaseLabel
    || state?.project?.phases?.find?.(phase => !phase?.completed)?.label
    || null;
  const activeConsolidatedPapers = (Array.isArray(state?.papers) ? state.papers : [])
    .filter(paper => !activePhaseLabel || getPaperClassificationForPhase(paper, activePhaseLabel));
  const sources = [
    ...(Array.isArray(projectScope.svat_papers) ? projectScope.svat_papers : []),
    ...(Array.isArray(activeScope.svat_papers) ? activeScope.svat_papers : []),
    // O registro consolidado entra por último apenas quando pertence à fase
    // ativa. Isso impede que decisões de fases anteriores contaminem as métricas
    // e a distribuição visual da triagem corrente.
    ...activeConsolidatedPapers,
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
    papers: [...byKey.values()].filter(paper => paper?.visited !== false),
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

function getCategoryFilterLabel(categoryKey) {
  if (!categoryKey || categoryKey === "all") return "";
  if (categoryKey === "uncategorized") return "Sem categoria";
  const category = state?.project?.categories?.find(item => getPaperCategoryKey(item) === categoryKey);
  return category?.title || category?.label || categoryKey;
}

function updatePaperFilterBar() {
  const bar = $("#paperFilterBar");
  const text = $("#paperFilterText");
  if (!bar || !text) return;

  const descriptions = [];
  if (paperMetricFilter !== "all") descriptions.push(`situação: ${getPaperMetricLabel(paperMetricFilter).toLowerCase()}`);
  const categoryLabel = getCategoryFilterLabel(paperCategoryFilter);
  if (categoryLabel) descriptions.push(`categoria: ${categoryLabel}`);

  const hasFilter = descriptions.length > 0;
  bar.classList.toggle("hidden", !hasFilter);
  text.textContent = hasFilter ? `Filtro ativo — ${descriptions.join(" · ")}` : "";
}

function clearPaperFilters({ clearSearch = false, render = true } = {}) {
  paperMetricFilter = "all";
  paperCategoryFilter = "all";
  if (clearSearch) {
    const searchInput = $("#search");
    if (searchInput) searchInput.value = "";
  }
  updatePaperFilterBar();
  if (render) renderPapersTable();
}

function openPapersFromOverview(categoryKey = "all", year = "", metricType = "all") {
  paperCategoryFilter = categoryKey || "all";
  paperMetricFilter = metricType === "all" ? "all" : normalizeMetricType(metricType, "pending");
  setActiveView("papers");
  const searchInput = $("#search");
  if (searchInput) searchInput.value = year === "Sem ano" ? "" : String(year || "");
  updatePaperFilterBar();
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

  renderPaperMetrics(papers, highlightedLinks);
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
  const totalSet = new Set([...inherited, ...added, ...selected, ...removed].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  const processedSet = new Set([...selected, ...removed].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  let total = totalSet.size;
  let processed = processedSet.size;

  const dynamic = getDynamicPhaseStats(phase?.label);
  if (dynamic.total) {
    total = Math.max(total, dynamic.total);
    processed = Math.max(processed, dynamic.processed);
  }

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
  const paper = state?.papers?.find(item => String(item.id) === String(paperId))
    || renderedPapersById.get(String(paperId));
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
    metric: paperMetricFilter,
    category: paperCategoryFilter,
  };
}

function paperMatchesFilters(paper, filters, highlightedLinks = {}) {
  const category = getPaperCategory(paper, highlightedLinks);

  if (filters.metric && filters.metric !== "all") {
    if (getPaperMetricType(paper, highlightedLinks) !== filters.metric) return false;
  }

  if (filters.category && filters.category !== "all") {
    const categoryKey = getPaperCategoryKey(category) || "uncategorized";
    if (categoryKey !== filters.category) return false;
  }

  if (!filters.q) return true;
  const categoryText = category ? `${category.title || ""} ${category.label || ""}` : "sem categoria";
  const metricText = getPaperMetricLabel(getPaperMetricType(paper, highlightedLinks));
  const hay = normalizeStr(`${paper.title || ""} ${paper.authorsRaw || ""} ${(paper.tags || []).join(" ")} ${paper.year || ""} ${paper.url || ""} ${categoryText} ${metricText}`);
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

  // A aba Artigos é estritamente vinculada à fase ativa. Os registros
  // consolidados servem apenas para completar metadados dos itens que já estão
  // presentes no storage da fase; nunca introduzem artigos de outras fases.
  const globalPapers = Array.isArray(state?.papers) ? state.papers : [];
  const globalById = new Map(
    globalPapers
      .filter(paper => paper?.id || paper?.id === 0)
      .map(paper => [String(paper.id), paper])
  );
  const globalByUrl = new Map(
    globalPapers
      .filter(paper => paper?.url)
      .map(paper => [normalizeUrl(paper.url), paper])
  );
  const byKey = new Map();
  svat.forEach((scopedPaper, index) => {
    if (!scopedPaper || typeof scopedPaper !== "object") return;
    const consolidated = globalById.get(String(scopedPaper.id))
      || globalByUrl.get(normalizeUrl(scopedPaper.url))
      || {};
    const paper = mergeOverviewPaper(consolidated, scopedPaper);
    const key = getOverviewPaperKey(paper, index);
    byKey.set(key, mergeOverviewPaper(byKey.get(key), paper));
  });

  for (const [url, color] of Object.entries(hl || {})) {
    const key = getOverviewPaperKey({ url });
    const existing = byKey.get(key) || {};
    byKey.set(key, mergeOverviewPaper(existing, {
      id: existing.id || `marked:${normalizeStr(normalizeUrl(url))}`,
      url,
      title: existing.title || url,
      authorsRaw: existing.authorsRaw || "",
      createdAt: existing.createdAt || "",
      year: existing.year || "",
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      highlightedColor: color,
      visited: true,
    }));
  }

  const allRows = [...byKey.values()]
    .filter(paper => paper?.visited !== false);
  const duplicateCandidates = allRows
    .filter(paper => paper?.id || paper?.id === 0)
    .filter(paper => getPaperMetricType(paper, hl) !== "duplicate")
    .sort((a, b) => String(a.title || a.url || "").localeCompare(String(b.title || b.url || ""), "pt-BR"));
  const rows = allRows
    .filter(paper => paperMatchesFilters(paper, f, hl))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  renderedPapersById = new Map(rows.map(paper => [String(paper.id), paper]));

  // build HTML in memory
  let rowsHtml = "";
  for (const p of rows) {
    const tags = Array.isArray(p.tags) ? p.tags.join(";") : "";
    // Use a light tint from the selected category so the title stays readable.
    const category = getPaperCategory(p, hl);
    const metricType = getPaperMetricType(p, hl);
    const categoryDisplayLabel = p?.autoDuplicate
      ? "Duplicado automático"
      : (category?.title || category?.label || "Sem categoria");
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
        <td><input type="checkbox" class="rowCheck" data-id="${escapeHtml(p.id)}" /></td>
        <td>
          <div class="paperTitleWrap">
            <button class="linkBtn" data-show-history="${escapeHtml(p.id)}" title="Ver histórico">${escapeHtml(p.title || "(sem título)")}</button>
          </div>
          <div style="color:#666;font-size:11px;margin-top:4px">${escapeHtml(p.authorsRaw || "")} • ${escapeHtml(fmtDate(p.createdAt))}</div>
        </td>
        <td><input class="cellInput" data-field="year" data-id="${escapeHtml(p.id)}" value="${escapeHtml(p.year ?? "")}" placeholder="—" style="width:64px" /></td>
        <td>
          <span class="paperCategoryCell">
            <span class="categoryBadge">
              ${categoryMarker}
              <span>${escapeHtml(categoryDisplayLabel)}</span>
            </span>
            <span class="paperOutcomeBadge paperOutcomeBadge--${escapeHtml(metricType)}">${escapeHtml(getPaperMetricLabel(metricType))}</span>
            ${metricType === "duplicate" ? renderDuplicateOriginalSelect(p, duplicateCandidates) : ""}
          </span>
        </td>
        <td><input class="cellInput" data-field="tags" data-id="${escapeHtml(p.id)}" value="${escapeHtml(tags)}" placeholder="ex: vis;ml" /></td>
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
  tbody.querySelectorAll(".rowCheck").forEach(check => {
    check.addEventListener("change", updatePaperBulkActionState);
  });
  const checkAll = $("#checkAll");
  if (checkAll) {
    checkAll.checked = false;
    checkAll.indeterminate = false;
  }
  updatePaperBulkActionState();
}


async function onCellChange(e) {
  const el = e.target;
  const id = el.getAttribute("data-id");
  const field = el.getAttribute("data-field");
  const renderedPaper = renderedPapersById.get(String(id));
  const projectPaper = state?.papers?.find(p => String(p.id) === String(id)) || null;
  let scopedPapers = [];
  let scopedPaper = null;

  try {
    const scoped = await storage.get(["svat_papers"]);
    scopedPapers = Array.isArray(scoped?.svat_papers) ? scoped.svat_papers : [];
    scopedPaper = scopedPapers.find(p => String(p.id) === String(id))
      || scopedPapers.find(p => normalizeUrl(p?.url || "") === normalizeUrl(renderedPaper?.url || ""))
      || null;
  } catch (error) {
    console.warn("Não foi possível carregar o artigo da fase ativa para edição.", error);
  }

  const paper = projectPaper || scopedPaper;
  if (!paper) {
    // Marcações antigas sem registro de artigo continuam somente para leitura.
    renderPapersTable();
    return;
  }

  let val = el.value;
  const prev = paper[field];

  const targets = [...new Set([projectPaper, scopedPaper].filter(Boolean))];
  for (const target of targets) {
    if (field === "year") {
      const n = Number(val);
      target.year = Number.isFinite(n) ? n : null;
    } else if (field === "tags") {
      target.tags = val.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    } else {
      target[field] = val;
    }
    target.updatedAt = new Date().toISOString();
  }

  pushHistory(paper, "update_field", { field, from: prev, to: paper[field] });
  if (projectPaper) await storage.savePaper(projectPaper);
  if (scopedPaper) await storage.set({ svat_papers: scopedPapers });
  renderAll();
}

function selectedPaperIds() {
  return $$(".rowCheck:checked").map(ch => ch.getAttribute("data-id"));
}

function getActivePhaseForPaperBulkActions() {
  const phases = Array.isArray(state?.project?.phases) ? state.project.phases : [];
  return phases.find(phase => phase?.label === state?.project?.activePhaseLabel && !phase?.completed)
    || phases.find(phase => !phase?.completed)
    || null;
}

function isProtectedAutomaticDuplicate(paper, phaseLabel = getActivePhaseForPaperBulkActions()?.label) {
  if (!paper || typeof paper !== "object") return false;
  const classification = phaseLabel
    ? getPaperClassificationForPhase(paper, phaseLabel)
    : null;
  const outcome = normalizeMetricType(classification?.outcome ?? paper.status, "pending");
  return paper.autoDuplicate === true || Boolean(paper.duplicateOfId) || outcome === "duplicate";
}

function getActivePhaseCategoriesForOutcome(outcome) {
  const activePhase = getActivePhaseForPaperBulkActions();
  if (!activePhase) return [];

  const normalizedOutcome = normalizeCategoryMetricType(outcome, "pending");
  const allowedLabels = new Set(
    (Array.isArray(activePhase.categories) ? activePhase.categories : []).filter(Boolean)
  );

  return (Array.isArray(state?.project?.categories) ? state.project.categories : [])
    .filter(category => allowedLabels.has(category?.label))
    .filter(category => (
      normalizeCategoryMetricType(
        category?.metricType,
        inferMetricTypeFromCategory(category)
      ) === normalizedOutcome
    ));
}

function getSelectedRenderedPapers() {
  return selectedPaperIds()
    .map(id => renderedPapersById.get(String(id)))
    .filter(Boolean);
}

function setPaperBulkStatus(message = "", tone = "", autoClear = true) {
  clearTimeout(paperBulkStatusTimer);
  paperBulkStatusTimer = null;

  const status = document.getElementById("paperBulkStatus");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("paperBulkStatus--success", tone === "success");
  status.classList.toggle("paperBulkStatus--error", tone === "error");
  status.classList.toggle("paperBulkStatus--loading", tone === "loading");

  if (message && autoClear && tone !== "loading") {
    paperBulkStatusTimer = setTimeout(() => {
      status.textContent = "";
      status.classList.remove(
        "paperBulkStatus--success",
        "paperBulkStatus--error",
        "paperBulkStatus--loading"
      );
      paperBulkStatusTimer = null;
    }, tone === "error" ? 8000 : 6000);
  }
}

function updatePaperBulkActionState() {
  const rowChecks = $$("#papersTable .rowCheck");
  const selectedChecks = rowChecks.filter(check => check.checked);
  const selectedPapers = selectedChecks
    .map(check => renderedPapersById.get(String(check.getAttribute("data-id"))))
    .filter(Boolean);
  const classifiableCount = selectedPapers.filter(paper => !isProtectedAutomaticDuplicate(paper)).length;
  const automaticDuplicateCount = selectedPapers.length - classifiableCount;
  const activePhase = getActivePhaseForPaperBulkActions();
  const phaseLocked = !activePhase || isPhaseCompleted(activePhase);

  const selectionCount = document.getElementById("paperSelectionCount");
  if (selectionCount) {
    if (paperBulkBusy) {
      selectionCount.textContent = "Atualizando…";
    } else if (!selectedChecks.length) {
      selectionCount.textContent = "0 selecionados";
    } else {
      const duplicateSuffix = automaticDuplicateCount
        ? ` · ${automaticDuplicateCount} duplicata${automaticDuplicateCount === 1 ? "" : "s"} protegida${automaticDuplicateCount === 1 ? "" : "s"}`
        : "";
      selectionCount.textContent = `${selectedChecks.length} selecionado${selectedChecks.length === 1 ? "" : "s"}${duplicateSuffix}`;
    }
  }

  $$('[data-paper-bulk-outcome]').forEach(button => {
    const outcome = normalizeCategoryMetricType(button.dataset.paperBulkOutcome, "pending");
    const categories = getActivePhaseCategoriesForOutcome(outcome);
    const copy = PAPER_BULK_ACTION_COPY[outcome] || PAPER_BULK_ACTION_COPY.pending;
    const disabled = paperBulkBusy || phaseLocked || classifiableCount === 0;

    button.disabled = disabled;
    button.classList.toggle("paperBulkOutcomeBtn--unavailable", categories.length === 0);

    if (!activePhase) {
      button.title = "Crie uma fase antes de classificar artigos.";
    } else if (isPhaseCompleted(activePhase)) {
      button.title = "A fase ativa está concluída. Crie a próxima fase ou reabra a atual antes de alterar a triagem.";
    } else if (!selectedChecks.length) {
      button.title = "Selecione pelo menos um artigo.";
    } else if (!classifiableCount) {
      button.title = "Duplicatas automáticas não podem ser reclassificadas manualmente.";
    } else if (!categories.length) {
      button.title = `A fase ativa não possui uma categoria vinculada ao resultado ${copy.result}.`;
    } else if (categories.length === 1) {
      button.title = `${copy.button} usando a categoria “${categories[0].title || categories[0].label}”.`;
    } else {
      button.title = `${copy.button}: escolha uma das ${categories.length} categorias compatíveis da fase ativa.`;
    }
  });

  const unmarkButton = document.getElementById("btnBulkDeleteMarked");
  if (unmarkButton) {
    unmarkButton.disabled = paperBulkBusy || phaseLocked || selectedChecks.length === 0;
    if (!activePhase) {
      unmarkButton.title = "Crie uma fase antes de remover marcações.";
    } else if (isPhaseCompleted(activePhase)) {
      unmarkButton.title = "A fase ativa está concluída e não pode ser alterada.";
    } else if (!selectedChecks.length) {
      unmarkButton.title = "Selecione pelo menos um artigo.";
    } else {
      unmarkButton.title = "Retirar os artigos selecionados da fase ativa, sem classificá-los como removidos.";
    }
  }

  const checkAll = document.getElementById("checkAll");
  if (checkAll) {
    checkAll.checked = rowChecks.length > 0 && selectedChecks.length === rowChecks.length;
    checkAll.indeterminate = selectedChecks.length > 0 && selectedChecks.length < rowChecks.length;
    checkAll.disabled = paperBulkBusy || rowChecks.length === 0;
  }
}

function closePaperBulkCategoryModal() {
  const modal = document.getElementById("paperBulkCategoryModal");
  const options = document.getElementById("paperBulkCategoryOptions");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
  if (options) options.innerHTML = "";
  paperBulkPendingOutcome = null;
}

function openPaperBulkCategoryModal(outcome, categories, selectedCount) {
  const normalizedOutcome = normalizeCategoryMetricType(outcome, "pending");
  const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
  const modal = document.getElementById("paperBulkCategoryModal");
  const eyebrow = document.getElementById("paperBulkCategoryModalEyebrow");
  const title = document.getElementById("paperBulkCategoryModalTitle");
  const description = document.getElementById("paperBulkCategoryModalDescription");
  const options = document.getElementById("paperBulkCategoryOptions");
  if (!modal || !options) return;

  paperBulkPendingOutcome = normalizedOutcome;
  if (eyebrow) eyebrow.textContent = `Classificação em lote · ${copy.result}`;
  if (title) title.textContent = "Escolha a categoria que será aplicada";
  if (description) {
    description.textContent = `${selectedCount} artigo${selectedCount === 1 ? "" : "s"} será${selectedCount === 1 ? "" : "ão"} classificado${selectedCount === 1 ? "" : "s"} como ${copy.result.toLowerCase()}. A categoria escolhida será gravada na fase ativa e alimentará a respectiva contagem.`;
  }

  options.innerHTML = "";
  for (const category of categories) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "paperBulkCategoryOption";
    option.setAttribute("role", "listitem");
    option.dataset.categoryLabel = category.label;

    const marker = document.createElement("i");
    marker.className = "paperBulkCategoryOptionColor";
    marker.style.backgroundColor = normalizeHexColor(category.color, "#A5ADBA");

    const text = document.createElement("span");
    text.className = "paperBulkCategoryOptionText";

    const strong = document.createElement("strong");
    strong.textContent = category.title || category.label;
    text.appendChild(strong);

    if (category.description) {
      const small = document.createElement("small");
      small.textContent = category.description;
      text.appendChild(small);
    }

    const outcomeBadge = document.createElement("span");
    outcomeBadge.className = `paperBulkCategoryOptionOutcome paperBulkCategoryOptionOutcome--${normalizedOutcome}`;
    outcomeBadge.textContent = copy.result;

    option.append(marker, text, outcomeBadge);
    option.addEventListener("click", async () => {
      closePaperBulkCategoryModal();
      await applyPaperBulkCategory(category, normalizedOutcome);
    });
    options.appendChild(option);
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => options.querySelector("button")?.focus(), 50);
}

function mergePaperSourcesForBulk(...sources) {
  const validSources = sources.filter(source => source && typeof source === "object");
  const merged = Object.assign({}, ...validSources);
  merged.classifications = Object.assign(
    {},
    ...validSources.map(source => getPaperClassificationsMap(source))
  );

  const longestHistory = validSources
    .map(source => Array.isArray(source.history) ? source.history : [])
    .sort((first, second) => second.length - first.length)[0]
    || [];
  merged.history = [...longestHistory];
  return merged;
}

function findPaperIndexForBulk(collection, paper) {
  const list = Array.isArray(collection) ? collection : [];
  const id = paper?.id;
  if ((id || id === 0) && !String(id).startsWith("marked:")) {
    const byId = list.findIndex(item => String(item?.id) === String(id));
    if (byId >= 0) return byId;
  }

  const normalizedUrl = normalizeUrl(paper?.url || "");
  if (!normalizedUrl) return -1;
  return list.findIndex(item => (
    !isProtectedAutomaticDuplicate(item)
    && normalizeUrl(item?.url || "") === normalizedUrl
  ));
}

function createBulkClassifiedPaper(previousPaper, category, phaseLabel, classifiedAt) {
  const metricType = normalizeCategoryMetricType(
    category?.metricType,
    inferMetricTypeFromCategory(category)
  );
  const normalizedUrl = normalizeUrl(previousPaper?.url || "");
  const rawId = previousPaper?.id;
  const hasStableId = (rawId || rawId === 0) && !String(rawId).startsWith("marked:");
  const paperId = hasStableId
    ? rawId
    : hashId(normalizedUrl || previousPaper?.url || `${phaseLabel}:${previousPaper?.title || classifiedAt}`);
  const classifications = getPaperClassificationsMap(previousPaper);
  const previousPhaseClassification = classifications[phaseLabel]
    && typeof classifications[phaseLabel] === "object"
    ? classifications[phaseLabel]
    : {};
  const belongsToActivePhase = (
    previousPaper?.phaseLabel
    || previousPaper?.phaseId
    || previousPaper?.iterationId
  ) === phaseLabel;
  const inheritedFromPhaseLabel = previousPhaseClassification.inheritedFromPhaseLabel
    || (belongsToActivePhase ? previousPaper?.inheritedFromPhaseLabel : null)
    || null;
  const inheritedInCurrentPhase = previousPhaseClassification.inherited === true
    || String(previousPhaseClassification.entryType || "").toLowerCase() === "inherited"
    || Boolean(previousPhaseClassification.inheritedFromPhaseLabel)
    || (belongsToActivePhase && previousPaper?.inherited === true)
    || (belongsToActivePhase && String(previousPaper?.entryType || "").toLowerCase() === "inherited")
    || Boolean(inheritedFromPhaseLabel);
  const entryType = previousPhaseClassification.entryType
    || (belongsToActivePhase ? previousPaper?.entryType : null)
    || (inheritedInCurrentPhase ? "inherited" : "new");
  const categoryReferences = new Set(
    (Array.isArray(state?.project?.categories) ? state.project.categories : [])
      .flatMap(item => [item?.label, item?.title])
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const tags = [...new Set([
    ...(Array.isArray(previousPaper?.tags)
      ? previousPaper.tags.filter((tag) => {
          const normalizedTag = String(tag || "").trim().toLowerCase();
          return normalizedTag
            && !categoryReferences.has(normalizedTag)
            && normalizedTag !== "duplicado-automatico";
        })
      : []),
    category.label,
  ])];
  const inferred = inferFromCategory(category);
  const history = Array.isArray(previousPaper?.history) ? [...previousPaper.history] : [];
  history.push({
    ts: classifiedAt,
    action: "bulk_reclassify",
    details: {
      category: category.label,
      metricType,
      phaseLabel,
      previousCategory: previousPaper?.categoryLabel || null,
      previousStatus: normalizeMetricType(previousPaper?.status, "pending"),
      source: "articles_toolbar",
    },
  });

  return {
    ...previousPaper,
    id: paperId,
    origin: inferred.origin,
    status: metricType,
    categoryLabel: category.label,
    phaseLabel,
    iterationId: phaseLabel,
    classifications: {
      ...classifications,
      [phaseLabel]: {
        ...previousPhaseClassification,
        phaseLabel,
        categoryLabel: category.label,
        outcome: metricType,
        classifiedAt,
        inherited: inheritedInCurrentPhase,
        entryType,
        inheritedFromPhaseLabel,
        duplicateOfId: null,
        automatic: false,
      },
    },
    duplicateOfId: null,
    autoDuplicate: false,
    duplicateSequence: null,
    tags,
    highlightedColor: normalizeHexColor(category.color, category.color || ""),
    inherited: inheritedInCurrentPhase,
    entryType,
    inheritedFromPhaseLabel,
    visited: true,
    createdAt: previousPaper?.createdAt || classifiedAt,
    updatedAt: classifiedAt,
    history: history.length > 200 ? history.slice(history.length - 200) : history,
  };
}

async function requestPaperBulkOutcome(outcome) {
  const normalizedOutcome = normalizeCategoryMetricType(outcome, "pending");
  const selectedPapers = getSelectedRenderedPapers();
  if (!selectedPapers.length) {
    alert("Selecione pelo menos 1 artigo.");
    updatePaperBulkActionState();
    return;
  }

  const activePhase = getActivePhaseForPaperBulkActions();
  if (!activePhase) {
    alert("Crie uma fase antes de classificar artigos.");
    return;
  }
  if (isPhaseCompleted(activePhase)) {
    alert("A fase ativa está concluída. Crie a próxima fase ou reabra a atual antes de alterar a triagem.");
    return;
  }

  const classifiablePapers = selectedPapers.filter(paper => !isProtectedAutomaticDuplicate(paper));
  if (!classifiablePapers.length) {
    alert("Duplicatas automáticas não podem ser reclassificadas manualmente.");
    return;
  }

  const categories = getActivePhaseCategoriesForOutcome(normalizedOutcome);
  const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
  if (!categories.length) {
    alert(`A fase ativa não possui uma categoria relacionada a “${copy.result}”. Edite a fase e marque pelo menos uma categoria com esse impacto antes de usar esta ação.`);
    return;
  }

  if (categories.length === 1) {
    await applyPaperBulkCategory(categories[0], normalizedOutcome);
    return;
  }

  openPaperBulkCategoryModal(normalizedOutcome, categories, classifiablePapers.length);
}

async function applyPaperBulkCategory(category, requestedOutcome) {
  const activePhase = getActivePhaseForPaperBulkActions();
  if (!activePhase || isPhaseCompleted(activePhase)) {
    alert("A fase ativa não está disponível para classificação.");
    return;
  }

  const normalizedOutcome = normalizeCategoryMetricType(requestedOutcome, "pending");
  const categoryOutcome = normalizeCategoryMetricType(
    category?.metricType,
    inferMetricTypeFromCategory(category)
  );
  const allowedCategories = getActivePhaseCategoriesForOutcome(normalizedOutcome);
  if (
    categoryOutcome !== normalizedOutcome
    || !allowedCategories.some(item => item?.label === category?.label)
  ) {
    alert("A categoria selecionada não está ativa nesta fase ou não corresponde ao resultado escolhido.");
    return;
  }

  const selectedPapers = getSelectedRenderedPapers();
  if (!selectedPapers.length) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  paperBulkBusy = true;
  updatePaperBulkActionState();
  setPaperBulkStatus("Atualizando a classificação e as métricas da fase…", "loading", false);

  try {
    const data = await storage.get(["highlightedLinks", "svat_papers", "svat_project"]);
    const highlightedLinks = data?.highlightedLinks && typeof data.highlightedLinks === "object"
      ? { ...data.highlightedLinks }
      : {};
    const scopedPapers = Array.isArray(data?.svat_papers) ? [...data.svat_papers] : [];
    const consolidatedPapers = Array.isArray(state?.papers) ? state.papers : [];
    const classifiedAt = new Date().toISOString();
    const changedPapers = [];
    const processedIds = new Set();
    let skippedAutomaticDuplicates = 0;

    for (const renderedPaper of selectedPapers) {
      if (isProtectedAutomaticDuplicate(renderedPaper, activePhase.label)) {
        skippedAutomaticDuplicates += 1;
        continue;
      }

      const scopedIndex = findPaperIndexForBulk(scopedPapers, renderedPaper);
      const consolidatedIndex = findPaperIndexForBulk(consolidatedPapers, renderedPaper);
      const scopedPaper = scopedIndex >= 0 ? scopedPapers[scopedIndex] : null;
      const consolidatedPaper = consolidatedIndex >= 0 ? consolidatedPapers[consolidatedIndex] : null;
      const previousPaper = mergePaperSourcesForBulk(
        consolidatedPaper,
        scopedPaper,
        renderedPaper
      );

      if (isProtectedAutomaticDuplicate(previousPaper, activePhase.label)) {
        skippedAutomaticDuplicates += 1;
        continue;
      }

      const nextPaper = createBulkClassifiedPaper(
        previousPaper,
        category,
        activePhase.label,
        classifiedAt
      );
      const paperKey = String(nextPaper.id);
      if (processedIds.has(paperKey)) continue;
      processedIds.add(paperKey);
      changedPapers.push(nextPaper);

      if (scopedIndex >= 0) scopedPapers[scopedIndex] = nextPaper;
      else scopedPapers.push(nextPaper);

      const canonicalUrl = normalizeUrl(nextPaper.url || "");
      if (canonicalUrl) {
        for (const storedUrl of Object.keys(highlightedLinks)) {
          if (normalizeUrl(storedUrl) === canonicalUrl) delete highlightedLinks[storedUrl];
        }
        highlightedLinks[nextPaper.url] = normalizeHexColor(category.color, category.color || "");
      }
    }

    if (!changedPapers.length) {
      throw new Error("Nenhum dos artigos selecionados pode ser reclassificado.");
    }

    const saveResults = await Promise.all(
      changedPapers.map(paper => storage.savePaper(paper))
    );
    const failedSave = saveResults.find(result => result?.status === "error");
    if (failedSave) {
      throw new Error(failedSave.message || "Não foi possível salvar um dos artigos.");
    }

    const scopedProject = data?.svat_project && typeof data.svat_project === "object"
      ? { ...data.svat_project }
      : {
          id: state?.project?.id,
          title: state?.project?.name || state?.project?.title || "Projeto",
          createdAt: state?.project?.createdAt || classifiedAt,
        };
    scopedProject.activePhaseLabel = activePhase.label;
    scopedProject.currentIterationId = activePhase.label;

    const storageResult = await storage.set({
      highlightedLinks,
      svat_papers: scopedPapers,
      svat_project: scopedProject,
    });
    if (storageResult?.status === "error") {
      throw new Error(storageResult.message || "Não foi possível atualizar a fase ativa.");
    }

    if (Array.isArray(state?.papers)) {
      for (const nextPaper of changedPapers) {
        const stateIndex = findPaperIndexForBulk(state.papers, nextPaper);
        if (stateIndex >= 0) Object.assign(state.papers[stateIndex], nextPaper);
        else state.papers.push(nextPaper);
      }
    }

    await refreshDashboardFromStorage("paper_bulk_classification");

    const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
    const quantity = changedPapers.length;
    const resultText = quantity === 1 ? copy.singular : copy.plural;
    const duplicateText = skippedAutomaticDuplicates
      ? ` ${skippedAutomaticDuplicates} duplicata${skippedAutomaticDuplicates === 1 ? " automática foi mantida" : "s automáticas foram mantidas"} sem alteração.`
      : "";
    setPaperBulkStatus(
      `${quantity} artigo${quantity === 1 ? "" : "s"} ${resultText} com a categoria “${category.title || category.label}”.${duplicateText}`,
      "success"
    );
  } catch (error) {
    console.warn("paper bulk classification failed", error);
    const message = error?.message || "Não foi possível classificar os artigos selecionados.";
    setPaperBulkStatus(message, "error");
    alert(message);
    scheduleDashboardRefresh("paper_bulk_classification_error", 80);
  } finally {
    paperBulkBusy = false;
    paperBulkPendingOutcome = null;
    updatePaperBulkActionState();
  }
}

async function bulkDeleteMarkedSelected() {
  const ids = selectedPaperIds();
  if (!ids.length) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  if (!confirm(`Retirar ${ids.length} artigo(s) selecionado(s) da fase ativa? Essa ação remove a marcação; para classificar como excluído, use o botão “Remover”.`)) return;

  const selectedUrls = [];
  for (const id of ids) {
    const renderedPaper = renderedPapersById.get(String(id));
    if (renderedPaper?.url) {
      selectedUrls.push(renderedPaper.url);
      continue;
    }
    if (id?.startsWith("marked:")) selectedUrls.push(id.slice(7));
  }

  paperBulkBusy = true;
  updatePaperBulkActionState();
  setPaperBulkStatus("Retirando as marcações da fase ativa…", "loading", false);

  try {
    await removeUrlsFromActivePhase(selectedUrls);
    await refreshDashboardFromStorage("paper_bulk_unmark");
    setPaperBulkStatus(
      `${ids.length} artigo${ids.length === 1 ? " foi retirado" : "s foram retirados"} da fase ativa.`,
      "success"
    );
  } catch (error) {
    console.warn("bulkDeleteMarkedSelected failed", error);
    const message = error?.message || "Não foi possível remover os artigos da fase ativa.";
    setPaperBulkStatus(message, "error");
    alert(message);
  } finally {
    paperBulkBusy = false;
    updatePaperBulkActionState();
  }
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
  updatePaperFilterBar();
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

  $$('[data-paper-metric]').forEach((button) => {
    button.addEventListener('click', () => {
      openPapersFromOverview('all', '', button.dataset.paperMetric || 'all');
    });
  });

  $('#btnClearPaperFilters')?.addEventListener('click', () => {
    clearPaperFilters({ clearSearch: false, render: true });
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
  $("#search")?.addEventListener("input", renderPapersTable);
  $("#checkAll")?.addEventListener("change", (e) => {
    const checked = e.target.checked;
    $$("#papersTable .rowCheck").forEach(ch => { ch.checked = checked; });
    updatePaperBulkActionState();
  });

  $$('[data-paper-bulk-outcome]').forEach(button => {
    button.addEventListener("click", () => requestPaperBulkOutcome(button.dataset.paperBulkOutcome));
  });
  $("#btnBulkDeleteMarked")?.addEventListener("click", () => bulkDeleteMarkedSelected());

  $("#btnClosePaperBulkCategory")?.addEventListener("click", closePaperBulkCategoryModal);
  const paperBulkCategoryModal = $("#paperBulkCategoryModal");
  paperBulkCategoryModal?.addEventListener("click", event => {
    if (event.target === paperBulkCategoryModal) closePaperBulkCategoryModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !paperBulkCategoryModal?.classList.contains("hidden")) {
      closePaperBulkCategoryModal();
    }
  });

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
  const categoryMetricTypeInput = document.getElementById("categoryMetricType");
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
    if (categoryMetricTypeInput) {
      categoryMetricTypeInput.value = normalizeCategoryMetricType(
        category?.metricType,
        inferMetricTypeFromCategory(category || {})
      );
    }
    categoryTitleError.classList.remove("visible");
    categoryTitleError.textContent = "";

    categoryDraftCriteria = Array.isArray(category?.criteria) ? [...category.criteria] : [];
    renderCategoryCriteria();
    if (categoryCriterionNewInput) categoryCriterionNewInput.value = "";

    const deletionBlockReason = category
      ? getCategoryDeletionBlockReason(state?.project, category.label)
      : "";
    btnDeleteCategory.style.display = category ? "" : "none";
    btnDeleteCategory.disabled = Boolean(deletionBlockReason);
    btnDeleteCategory.title = deletionBlockReason || "Excluir categoria";
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
      // O identificador interno permanece estável durante edições para que os
      // artigos já classificados não percam o vínculo com a categoria.
      label: editingCategoryLabel || makeLabel(title),
      description: categoryDescriptionInput.value.trim(),
      color: categoryColorInput.value,
      metricType: normalizeCategoryMetricType(categoryMetricTypeInput?.value, "pending"),
      criteria: [...categoryDraftCriteria],
    };

    try {
      const previousLabel = editingCategoryLabel;
      const savedCategory = editingCategoryLabel
        ? project.updateCategory(editingCategoryLabel, data)
        : project.addCategory(data);

      // project.json no servidor é a única fonte persistente das categorias.
      await storage.saveProject(project);
      await syncCategoryMetricAcrossActivePapers(savedCategory, previousLabel || savedCategory?.label);
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
    const deletionBlockReason = getCategoryDeletionBlockReason(project, editingCategoryLabel);
    if (deletionBlockReason) return alert(deletionBlockReason);
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
    removeLinks.addEventListener("click", async () => {
      if (!confirm("Tem certeza que deseja remover TODOS os links marcados?")) return;
      try {
        const scoped = await storage.get(["svat_papers", "highlightedLinks"]);
        const urls = [
          ...Object.keys(scoped?.highlightedLinks || {}),
          ...(Array.isArray(scoped?.svat_papers) ? scoped.svat_papers.map(paper => paper?.url) : []),
        ];
        await removeUrlsFromActivePhase(urls);
        await Promise.allSettled([
          loadHighlightedLinks(),
          renderPapersTable(),
          renderOverview(),
        ]);
      } catch (error) {
        console.warn("removeLinks failed", error);
        alert(error?.message || "Não foi possível remover os links da fase ativa.");
      }
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
  const phaseCategoriesError = document.getElementById('phaseCategoriesError');
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

  function getProjectPhases() {
    return Array.isArray(state?.project?.phases) ? state.project.phases : [];
  }

  function getLatestPhase() {
    return getProjectPhases().at(-1) || null;
  }

  function isLatestPhaseLabel(label) {
    return Boolean(label && getLatestPhase()?.label === label);
  }

  function canCreateNextPhase() {
    // O plano pode ser montado livremente; a conclusão controla apenas a
    // progressão/ativação e a herança de artigos.
    return true;
  }

  function updatePhaseCreationAvailability() {
    if (!btnShowAddPhase) return;
    const latest = getLatestPhase();
    btnShowAddPhase.disabled = false;
    btnShowAddPhase.title = latest
      ? 'Adicionar uma fase planejada ao plano de pesquisa'
      : 'Adicionar a primeira fase';
  }

  function updateToggleButtonUI(){
    if(!btnTogglePhaseStatus) return;
    const s = phaseLabelStatus === 'done' ? 'done' : 'pending';
    btnTogglePhaseStatus.dataset.status = s;
    btnTogglePhaseStatus.textContent = s === 'done' ? 'Concluído' : 'Em análise';
    btnTogglePhaseStatus.classList.toggle('ghost', s === 'pending');
  }

  if(btnTogglePhaseStatus){
    btnTogglePhaseStatus.addEventListener('click', (e) => {
      e.preventDefault();
      if (!phaseEditingLabel || state?.project?.activePhaseLabel !== phaseEditingLabel) {
        alert('Somente a fase ativa pode ser concluída. As fases futuras permanecem planejadas até chegar a vez delas.');
        return;
      }
      if (phaseLabelStatus !== 'done') {
        const currentPhase = getProjectPhases().find(phase => phase?.label === phaseEditingLabel);
        const currentStats = getPhaseStats(currentPhase || {});
        if (currentStats.pending > 0) {
          alert(`Ainda existem ${currentStats.pending} artigo(s) pendente(s). Classifique-os antes de concluir a fase.`);
          return;
        }
      }
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
          color: c.color || 'transparent',
          metricType: normalizeCategoryMetricType(
            c.metricType,
            inferMetricTypeFromCategory(c || {})
          ),
        }))
        .sort((a,b)=>(a.title || '').localeCompare(b.title || ''));

      if (!cats.length) {
        const empty = document.createElement('div');
        empty.className = 'muted categoryEmptyRequirements';
        empty.textContent = 'Crie a primeira categoria para disponibilizá-la nesta fase.';
        phaseCategoriesInput.appendChild(empty);
        return;
      }

      for (const cat of cats){
        const value = cat.label || cat.title;
        const id = `phase_cat_${cssSafeId(value)}`;
        const wrap = document.createElement('label');
        wrap.className = 'phaseCategoryItem';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = value;
        cb.id = id;
        cb.dataset.metricType = cat.metricType;
        if(Array.isArray(selected) && selected.includes(value)) cb.checked = true;
        cb.addEventListener('change', () => {
          if (phaseCategoriesError && phaseCategoriesInput.querySelector('input[type=checkbox]:checked')) {
            phaseCategoriesError.classList.remove('visible');
            phaseCategoriesError.textContent = '';
          }
        });
        const pill = document.createElement('span');
        pill.className = 'catPill';
        pill.style.width = '12px';
        pill.style.height = '12px';
        pill.style.borderRadius = '4px';
        pill.style.flex = '0 0 auto';
        pill.style.background = cat.color || 'transparent';
        pill.style.border = '1px solid rgba(0,0,0,0.12)';
        const textWrap = document.createElement('span');
        textWrap.className = 'phaseCategoryText';
        const txt = document.createElement('span');
        txt.className = 'phaseCategoryName';
        txt.textContent = cat.title || value;
        const metric = document.createElement('small');
        metric.className = `phaseCategoryMetric phaseCategoryMetric--${cat.metricType}`;
        metric.textContent = getPaperMetricLabel(cat.metricType);
        textWrap.append(txt, metric);
        wrap.appendChild(cb);
        wrap.appendChild(pill);
        wrap.appendChild(textWrap);
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
    const dynamic = getDynamicPhaseStats(phase.label);
    return {
      inherited: Math.max(
        Array.isArray(papers.inherited) ? papers.inherited.length : 0,
        dynamic.inherited
      ),
      pending: Math.max(Array.isArray(papers.new) ? papers.new.length : 0, dynamic.pending),
      selected: Math.max(Array.isArray(papers.selected) ? papers.selected.length : 0, dynamic.included),
      removed: Math.max(
        Array.isArray(papers.removed) ? papers.removed.length : 0,
        dynamic.excluded + dynamic.duplicate
      ),
      utilization: phase.completed
        ? 100
        : (dynamic.total ? Math.round((dynamic.processed / dynamic.total) * 100) : 0)
    };
  }

  function createPhaseCard(phaseData = {}, phaseIndex = 0, phaseCount = 1) {
    const title = phaseData.title || '';
    const desc = phaseData.desc ?? phaseData.description ?? '';
    const criteria = phaseCriteriaToText(phaseData.criteria);
    const categories = Array.isArray(phaseData.categories) ? phaseData.categories : [];
    const label = phaseData.label || cssSafeId(title).toLowerCase();
    const labelStatus = phaseData.labelStatus || (phaseData.completed ? 'done' : 'pending');
    const isCompleted = isPhaseCompleted({ ...phaseData, labelStatus });
    const stats = phaseData.stats || getPhaseStats(phaseData);
    const isFirstPhase = phaseIndex === 0;
    const isLatestPhase = phaseIndex === phaseCount - 1;
    const isActivePhase = state?.project?.activePhaseLabel === label;
    const isPlannedPhase = !isCompleted && !isActivePhase;
    const archivePanelId = getPhaseArchiveDomId(label);

    const el = document.createElement('div');
    el.className = 'phaseCard';
    if (isActivePhase) el.classList.add('active');
    if (isPlannedPhase) el.classList.add('phaseCard--locked');
    if (isCompleted) {
      el.classList.add('phaseCard--completed');
      el.setAttribute('aria-controls', archivePanelId);
      el.setAttribute('aria-expanded', String(expandedCompletedPhaseLabel === label));
      el.title = 'Clique para consultar os artigos trabalhados nesta fase.';
    }
    el.dataset.label = label;
    el.dataset.labelStatus = labelStatus;
    el.dataset.desc = desc;
    el.dataset.criteria = criteria;
    el.dataset.categories = JSON.stringify(categories);

    const safeTitle = escapeHtml(title || '(sem título)');
    const s = stats || { inherited:0, pending:0, selected:0, removed:0, utilization:0 };

    el.innerHTML = `
      <div class="phaseCardHeader">
        <div class="statusDot" title="Ativa"></div>
        <div class="phaseHeadText">
          <div class="phaseTitle">${safeTitle}</div>
        </div>
      </div>
      <div class="phaseCardBody">
        <div class="papersSection">
          <div class="papersTitle">📊 Triagem de artigos</div>
          <div class="papersGrid">
            ${isFirstPhase ? '' : `<div title="Artigos incluídos na fase anterior"><span class="muted">Herdados:</span> <strong>${s.inherited}</strong></div>`}
            <div title="Artigos ainda classificados como pendentes"><span class="muted">Pendentes:</span> <strong>${s.pending}</strong></div>
            <div title="Artigos classificados por categorias de inclusão"><span class="muted">Selecionados:</span> <strong>${s.selected}</strong></div>
            <div title="Artigos excluídos ou identificados como duplicados"><span class="muted">Removidos:</span> <strong>${s.removed}</strong></div>
          </div>
          <div class="papersUtil">Rótulo: <strong class="phaseLabelStatus ${isCompleted ? 'done' : 'pending'}">${isCompleted ? 'Concluído' : (isActivePhase ? 'Em análise' : 'Planejada')}</strong></div>
        </div>
      </div>
      <div class="phaseCardFooter">
        <span class="activeLabel pill" aria-hidden="true">Ativo</span>
        <div class="phaseCardActions">
          ${isCompleted ? `<button class="btn small phaseArchiveToggle" type="button" data-action="archive" aria-controls="${archivePanelId}" aria-expanded="${expandedCompletedPhaseLabel === label ? 'true' : 'false'}"><span>${expandedCompletedPhaseLabel === label ? 'Ocultar artigos' : 'Ver artigos'}</span><span class="phaseArchiveChevron" aria-hidden="true">⌄</span></button>` : ''}
          <button class="btn small" data-action="edit">Editar</button>
        </div>
      </div>
    `;

    const btnArchive = el.querySelector('button[data-action="archive"]');
    if (btnArchive) btnArchive.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleCompletedPhaseArchive(label);
    });

    const btnEdit = el.querySelector('button[data-action="edit"]');
    if(btnEdit) btnEdit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if(phaseTitleInput) phaseTitleInput.value = title || '';
      if(phaseDescInput) phaseDescInput.value = desc || '';
      if(phaseCriteriaInput) phaseCriteriaInput.value = criteria || '';
      if(phaseCategoriesInput) renderPhaseCategories(categories || []);
      phaseLabelStatus = el.dataset.labelStatus || labelStatus || 'pending';
      phaseEditingLabel = el.dataset.label || label;
      if (btnTogglePhaseStatus) {
        btnTogglePhaseStatus.disabled = !isActivePhase;
        btnTogglePhaseStatus.title = isActivePhase
          ? 'Concluir a fase ativa e avançar para a próxima planejada'
          : (isCompleted
            ? 'Esta fase já foi concluída.'
            : 'Esta fase está planejada e será liberada após a conclusão da fase ativa.');
      }
      updateToggleButtonUI();
      phaseEditingCard = el;
      updateSaveState();
      openPhasePanel(true);
    });

    el.addEventListener('click', async (ev) => {
      if(ev.target.closest('button')) return;

      if (isCompleted) {
        toggleCompletedPhaseArchive(label);
        return;
      }

      if(!state?.project?.id){
        alert('Abra um projeto antes de ativar uma fase.');
        return;
      }

      if (!isActivePhase) {
        const active = getProjectPhases().find(phase => phase?.label === state?.project?.activePhaseLabel);
        alert(`Conclua a fase ativa "${active?.title || active?.label || 'atual'}" para liberar esta fase.`);
        return;
      }

      try {
        console.log('🟢 Enviando set_active_phase para WS', { projectID: state.project.id, phaseLabel: label });
        await storage.setActivePhase(state.project.id, label);
        await reloadActiveProjectAfterPhaseChange();
        await Promise.allSettled([
          loadHighlightedLinks(),
          renderPapersTable(),
          renderOverview(),
        ]);

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
    const completedLabels = new Set(
      phases.filter(phase => isPhaseCompleted(phase)).map(phase => phase?.label).filter(Boolean)
    );
    if (expandedCompletedPhaseLabel && !completedLabels.has(expandedCompletedPhaseLabel)) {
      expandedCompletedPhaseLabel = null;
    }
    phases.forEach((phase, index) => {
      phasesList.appendChild(createPhaseCard(phase, index, phases.length));
      if (isPhaseCompleted(phase)) {
        phasesList.appendChild(createCompletedPhaseArchivePanel(phase));
      }
    });
    applyCompletedPhaseArchiveState();
    updatePhaseCreationAvailability();
  }

  refreshPhaseCards = renderPhasesFromProject;
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
    if(phaseCategoriesError){ phaseCategoriesError.classList.remove('visible'); phaseCategoriesError.textContent = ''; }
    phaseLabelStatus = 'pending';
    if (btnTogglePhaseStatus) {
      btnTogglePhaseStatus.disabled = true;
      btnTogglePhaseStatus.title = 'Salve a fase em análise e conclua-a depois pela edição.';
    }
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
    if (phasePanelTitle) {
      phasePanelTitle.textContent = isEditing
        ? 'Editar fase'
        : (phaseCreationRequired ? 'Crie a primeira fase' : 'Nova fase');
    }
    if(btnDeletePhase){
      const canDelete = isEditing
        && getProjectPhases().length > 1
        && isLatestPhaseLabel(phaseEditingLabel);
      btnDeletePhase.style.display = isEditing ? '' : 'none';
      btnDeletePhase.disabled = !canDelete;
      btnDeletePhase.title = canDelete
        ? 'Excluir a fase atual e retornar à anterior'
        : 'O projeto deve manter a primeira fase; fases anteriores só podem ser acessadas removendo a atual.';
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
    if(phaseCategoriesError){ phaseCategoriesError.classList.remove('visible'); phaseCategoriesError.textContent=''; }
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
      if (!canCreateNextPhase()) {
        const latest = getLatestPhase();
        alert(`Conclua a fase "${latest?.title || latest?.label || 'atual'}" antes de criar uma nova fase.`);
        return;
      }
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
    const ok = (phaseTitleInput?.value || '').trim() && (phaseDescInput?.value || '').trim();
    if(btnSavePhase) {
      if(ok) btnSavePhase.classList.add('ready'); else btnSavePhase.classList.remove('ready');
    }
  }
  // Init
  // keep button enabled so user can attempt save and see validation messages
  updateSaveState();
  [phaseTitleInput, phaseDescInput].forEach(inp => {
    if(!inp) return;
    inp.addEventListener('input', (e) => {
      updateSaveState();
      // clear inline error for this field when user types
      if(!e?.target) return;
      const id = e.target.id;
      if(id === 'phaseTitle' && phaseTitleError){ phaseTitleError.classList.remove('visible'); phaseTitleError.textContent=''; }
      if(id === 'phaseDesc' && phaseDescError){ phaseDescError.classList.remove('visible'); phaseDescError.textContent=''; }
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
    if(phaseTitleError){ phaseTitleError.classList.remove('visible'); phaseTitleError.textContent=''; }
    if(phaseDescError){ phaseDescError.classList.remove('visible'); phaseDescError.textContent=''; }
    if(phaseCategoriesError){ phaseCategoriesError.classList.remove('visible'); phaseCategoriesError.textContent=''; }

    const emptyFields = [];
    if(!title) emptyFields.push('title');
    if(!desc) emptyFields.push('desc');
    if(emptyFields.length){
      if(emptyFields.includes('title') && phaseTitleError){ phaseTitleError.textContent = 'Preencha o título da fase.'; phaseTitleError.classList.add('visible'); }
      if(emptyFields.includes('desc') && phaseDescError){ phaseDescError.textContent = 'Preencha a descrição da fase.'; phaseDescError.classList.add('visible'); }
      if(emptyFields[0] === 'title') phaseTitleInput?.focus();
      else if(emptyFields[0] === 'desc') phaseDescInput?.focus();
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

    if (projectHasCategories() && !categories.length) {
      if (phaseCategoriesError) {
        phaseCategoriesError.textContent = 'Selecione pelo menos uma categoria para esta fase.';
        phaseCategoriesError.classList.add('visible');
      }
      phaseCategoriesInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const selectedCategoryObjects = (Array.isArray(state?.project?.categories) ? state.project.categories : [])
      .filter(category => categories.includes(category?.label));
    const inheritanceCategory = selectedCategoryObjects.find(category => (
      normalizeCategoryMetricType(category?.metricType, 'pending') === 'pending'
    ));

    if (phaseEditingLabel && phaseLabelStatus === 'done') {
      const editedPhase = getProjectPhases().find(phase => phase?.label === phaseEditingLabel);
      const editedStats = getPhaseStats(editedPhase || {});
      if (editedStats.pending > 0) {
        alert(`Classifique os ${editedStats.pending} artigo(s) pendente(s) antes de concluir esta fase.`);
        return;
      }
    }

    if (phaseEditingLabel && phaseLabelStatus === 'done' && state?.project?.activePhaseLabel !== phaseEditingLabel) {
      alert('Somente a fase ativa pode ser concluída. As fases futuras permanecem planejadas.');
      return;
    }

    const phasePayload = {
      title,
      description: desc,
      completed: phaseLabelStatus === 'done',
      categories,
      inheritanceCategoryLabel: inheritanceCategory?.label || null,
      criteria: phaseEditingLabel
        ? (getProjectPhases().find(phase => phase?.label === phaseEditingLabel)?.criteria || [])
        : []
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
      await Promise.allSettled([
        renderOverview(),
        loadHighlightedLinks(),
        renderPapersTable(),
        updateScholarCategoryMenu(),
      ]);
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
    const phases = getProjectPhases();
    if (phases.length <= 1) {
      alert('O projeto deve manter pelo menos uma fase. A primeira fase não pode ser excluída.');
      return;
    }
    if (!isLatestPhaseLabel(phaseEditingLabel)) {
      alert('Somente a fase atual mais recente pode ser removida. Remova as fases posteriores primeiro.');
      return;
    }
    if(!confirm('Excluir a fase atual e retornar à fase anterior? Os artigos marcados exclusivamente nesta fase serão removidos do seu escopo.')) return;
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
      await Promise.allSettled([
        renderOverview(),
        loadHighlightedLinks(),
        renderPapersTable(),
        updateScholarCategoryMenu(),
      ]);
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
  syncRequirementViews = () => {
    const requiresPhase = !projectHasPhases();
    const stage = getTutorialStage();
    const requiresCategory = !requiresPhase
      && !projectHasCategories()
      && ['category-pending', 'category-required'].includes(stage);
    applyPhaseRequirementUI(requiresPhase);
    applyCategoryRequirementUI(requiresCategory);
  };
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
  bindLiveDataSync();
  renderAll();
  // Load moved features
  loadCategories();
  loadHighlightedLinks();
  setActiveView(dashboardIntroRequired ? 'overview' : (phaseCreationRequired ? 'phases' : (categoryCreationRequired ? 'categories' : 'overview')));
}

init();
