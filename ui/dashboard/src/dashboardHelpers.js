import {
  fmtDate,
  normalizeStr,
  normalizeMetricType,
  normalizeCategoryMetricType,
  normalizeArticleUrl,
  inferMetricTypeFromCategory,
  inferFromCategory,
  hashId,
} from '../../../core/utils.mjs';

export {
  fmtDate,
  normalizeStr,
  normalizeMetricType,
  normalizeCategoryMetricType,
  normalizeArticleUrl,
  inferMetricTypeFromCategory,
  inferFromCategory,
  hashId,
};


export const PAPER_METRIC_LABELS = Object.freeze({
  included: "Incluídos",
  excluded: "Excluídos",
  pending: "Pendentes",
});

export const PAPER_BULK_ACTION_COPY = Object.freeze({
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
    singular: "pendente",
    plural: "pendentes",
  },
});

export function normalizeUrl(url) {
  return normalizeArticleUrl(url);
}

export function getLuminanceFromHex(hex) {
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

export function getContrastRatio(firstLuminance, secondLuminance) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableCategoryTextColor(backgroundColor) {
  const backgroundLuminance = getLuminanceFromHex(backgroundColor);
  const darkText = "#101828";
  const lightText = "#FFFFFF";
  const darkContrast = getContrastRatio(backgroundLuminance, getLuminanceFromHex(darkText));
  const lightContrast = getContrastRatio(backgroundLuminance, getLuminanceFromHex(lightText));

  return darkContrast >= lightContrast ? darkText : lightText;
}

export function normalizeHexColor(value, fallback = "") {
  const unwrapped = typeof value === 'object' && value ? (value.color || "") : value;
  const color = String(unwrapped || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map(ch => ch + ch).join("")}`.toUpperCase();
  }
  return fallback;
}

export function hexToRgba(hex, alpha = 0.12) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "transparent";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function formatResearchers(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean).join(', ');
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean).join(', ');
  }
  return '';
}

export function isInheritedPhaseClassification(classification = {}) {
  const entryType = String(classification?.entryType || "").toLowerCase();
  return classification?.inherited === true
    || entryType === "inherited"
    || Boolean(classification?.inheritedFromPhaseLabel);
}

export function isPhaseCompleted(phase = {}) {
  return phase?.completed === true || String(phase?.labelStatus || "").toLowerCase() === "done";
}

export function getPaperClassification(paper, activePhaseLabel = null) {
  const classifications = paper?.classifications;
  if (!classifications || typeof classifications !== "object" || Array.isArray(classifications)) return null;

  const preferredKeys = [
    activePhaseLabel,
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

export function getPaperClassificationForPhase(paper, phaseLabel) {
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

export function getDynamicPhaseStats(phaseLabel, papers = []) {
  const stats = {
    total: 0,
    inherited: 0,
    included: 0,
    excluded: 0,
    pending: 0,
    processed: 0,
  };

  for (const paper of papers) {
    if (paper?.visited === false) continue;
    const classification = getPaperClassificationForPhase(paper, phaseLabel);
    if (!classification) continue;

    stats.total += 1;
    const legacyInherited = isInheritedPhaseClassification(classification);
    const outcome = normalizeMetricType(classification.outcome ?? paper.status, "pending");

    if (legacyInherited) stats.inherited += 1;
    else if (outcome === "included") stats.included += 1;
    else if (outcome === "excluded") stats.excluded += 1;
    else stats.pending += 1;
  }

  stats.processed = stats.inherited + stats.included + stats.excluded;
  return stats;
}

export function getPaperCategory(paper, projectCategories = [], highlightedLinks = {}, activePhaseLabel = null) {
  const categories = Array.isArray(projectCategories) ? projectCategories : [];
  const classification = getPaperClassification(paper, activePhaseLabel);
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

  if (resolvedColor) {
    const matchedByColor = categories.find(cat => normalizeHexColor(cat?.color) === resolvedColor);
    if (matchedByColor) return matchedByColor;
  }

  // Fallback seguro: vincula à categoria padrão correspondente ao status (nunca fica sem categoria)
  if (categories.length > 0) {
    const metricType = normalizeMetricType(classification?.outcome ?? paper?.status, "pending");
    return categories.find(cat => normalizeCategoryMetricType(cat?.metricType, inferMetricTypeFromCategory(cat)) === metricType)
      || categories.find(cat => isDefaultCategory(cat?.label))
      || categories[0];
  }

  return null;
}

export function getPaperCategoryKey(category) {
  return String(category?.label || category?.title || "").trim();
}

export function getPaperCategoryColor(paper, projectCategories = [], highlightedLinks = {}) {
  const category = getPaperCategory(paper, projectCategories, highlightedLinks);
  if (category) return normalizeHexColor(category.color);

  const normalizedPaperUrl = normalizeUrl(paper?.url || "");
  for (const [url, color] of Object.entries(highlightedLinks || {})) {
    if (normalizeUrl(url) === normalizedPaperUrl) {
      return normalizeHexColor(color);
    }
  }
  return "";
}

export function getPaperMetricType(paper, projectCategories = [], highlightedLinks = {}, activePhaseLabel = null) {
  const category = getPaperCategory(paper, projectCategories, highlightedLinks, activePhaseLabel);
  if (category) {
    return normalizeMetricType(category.metricType, inferMetricTypeFromCategory(category));
  }

  const classification = getPaperClassification(paper, activePhaseLabel);
  const fallbackCategory = classification?.categoryLabel
    || paper?.categoryLabel
    || (Array.isArray(paper?.tags) ? paper.tags.join(" ") : "");
  return normalizeMetricType(
    classification?.outcome ?? paper?.status,
    inferMetricTypeFromCategory(fallbackCategory)
  );
}

export function getLatestPaperClassification(paper) {
  const classifications = paper?.classifications;
  if (!classifications || typeof classifications !== "object" || Array.isArray(classifications)) return null;
  return Object.values(classifications)
    .filter(item => item && typeof item === "object")
    .sort((a, b) => String(b.classifiedAt || "").localeCompare(String(a.classifiedAt || "")))[0]
    || null;
}

export function resolveOverviewPhaseLabel(scope = "all", activePhaseLabel = "") {
  if (!scope || scope === "all") return "all";
  if (scope === "active") return activePhaseLabel || "all";
  return scope;
}

export function getOverviewPaperCategory(paper, scope = "all", projectCategories = [], highlightedLinks = {}, activePhaseLabel = "") {
  const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
  return getPaperCategoryForPhase(paper, phaseLabel, projectCategories, highlightedLinks);
}

export function getPaperCategoryForPhase(paper, phaseLabel, projectCategories = [], highlightedLinks = {}) {
  if (!phaseLabel || phaseLabel === "all") return getPaperCategory(paper, projectCategories, highlightedLinks);

  const classification = getPaperClassificationForPhase(paper, phaseLabel);
  if (!classification || isInheritedPhaseClassification(classification)) return null;

  const categories = Array.isArray(projectCategories) ? projectCategories : [];
  const candidates = [
    classification.categoryLabel,
    classification.categoryId,
  ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);

  const matched = categories.find((category) => {
    const refs = [category?.label, category?.title, category?.id]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return refs.some(ref => candidates.includes(ref));
  });
  if (matched) return matched;

  const paperPhase = paper?.phaseLabel || paper?.phaseId || paper?.iterationId;
  if (paperPhase === phaseLabel) {
    const fallbackCandidates = [paper?.categoryLabel, paper?.categoryId]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return categories.find((category) => {
      const refs = [category?.label, category?.title, category?.id]
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      return refs.some(ref => fallbackCandidates.includes(ref));
    }) || null;
  }

  // Fallback seguro: vincula à categoria padrão correspondente ao outcome da fase
  if (categories.length > 0) {
    const metricType = normalizeMetricType(classification.outcome ?? paper?.status, "pending");
    return categories.find(cat => normalizeCategoryMetricType(cat?.metricType, inferMetricTypeFromCategory(cat)) === metricType)
      || categories.find(cat => isDefaultCategory(cat?.label))
      || categories[0];
  }

  return null;
}

export function getOverviewMetricType(paper, scope = "all", activePhaseLabel = "", projectCategories = [], highlightedLinks = {}) {
  let metricType;
  const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
  if (phaseLabel && phaseLabel !== "all") {
    const classification = getPaperClassificationForPhase(paper, phaseLabel);
    if (!classification || isInheritedPhaseClassification(classification)) return null;
    if (classification.outcome) {
      metricType = normalizeMetricType(classification.outcome, "pending");
    } else {
      const category = getPaperCategoryForPhase(paper, phaseLabel, projectCategories, highlightedLinks);
      metricType = category
        ? normalizeCategoryMetricType(category.metricType, inferMetricTypeFromCategory(category))
        : normalizeMetricType(paper?.status, "pending");
    }
  } else {
    const latestClassification = getLatestPaperClassification(paper);
    if (latestClassification?.outcome) {
      metricType = normalizeMetricType(latestClassification.outcome, "pending");
    } else {
      metricType = getPaperMetricType(paper, projectCategories, highlightedLinks, activePhaseLabel);
    }
  }

  return metricType === "duplicate" ? "excluded" : metricType;
}

export function getOverviewScopedPapers(papers = [], scope = "all", activePhaseLabel = "") {
  const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
  if (!phaseLabel || phaseLabel === "all") return [...papers];

  return papers.filter((paper) => {
    const classification = getPaperClassificationForPhase(paper, phaseLabel);
    return Boolean(classification) && !isInheritedPhaseClassification(classification);
  });
}

export function computeOverviewMetrics(papers = [], highlightedLinks = {}, scope = "all", activePhaseLabel = "", projectCategories = []) {
  const metrics = {
    total: 0,
    included: 0,
    excluded: 0,
    pending: 0,
  };

  for (const paper of papers) {
    if (paper?.visited === false) continue;
    const metricType = getOverviewMetricType(paper, scope, activePhaseLabel, projectCategories, highlightedLinks);
    if (!metricType) continue;
    metrics.total += 1;
    if (metricType === "included") metrics.included += 1;
    else if (metricType === "excluded") metrics.excluded += 1;
    else metrics.pending += 1;
  }

  return metrics;
}

export function formatMetricPercentage(value, total) {
  const percentage = total ? (value / total) * 100 : 0;
  return `${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`;
}

export function buildCategoryDistribution(papers = [], projectCategories = [], highlightedLinks = {}, scope = "all", activePhaseLabel = "") {
  const categories = Array.isArray(projectCategories) ? projectCategories : [];

  // As métricas da visão geral exibem exclusivamente as 3 categorias padrão (Incluir, Excluir e Pendente).
  // Categorias personalizadas somam automaticamente no desfecho da categoria padrão à qual foram atreladas.
  const defaultDefinitions = [
    {
      metricType: "included",
      defaultKey: "incluir",
      defaultTitle: "Incluir",
      fallbackColor: "#22C55E",
    },
    {
      metricType: "excluded",
      defaultKey: "excluir",
      defaultTitle: "Excluir",
      fallbackColor: "#EF4444",
    },
    {
      metricType: "pending",
      defaultKey: "pendente",
      defaultTitle: "Pendente",
      fallbackColor: "#F59E0B",
    },
  ];

  const entries = defaultDefinitions.map(def => {
    const matched = categories.find(c => 
      isDefaultCategory(c.label) && normalizeCategoryMetricType(c.metricType, inferMetricTypeFromCategory(c)) === def.metricType
    ) || categories.find(c => 
      String(c?.label || "").toLowerCase() === def.defaultKey
    );

    return {
      key: matched?.label || def.defaultKey,
      label: matched?.title || def.defaultTitle,
      color: normalizeHexColor(matched?.color, def.fallbackColor),
      metricType: def.metricType,
      count: 0,
    };
  });

  for (const paper of papers) {
    if (paper?.visited === false) continue;
    const metricType = getOverviewMetricType(paper, scope, activePhaseLabel, projectCategories, highlightedLinks);
    if (!metricType) continue;

    const norm = normalizeCategoryMetricType(metricType, "pending");
    const target = entries.find(e => e.metricType === norm) || entries.find(e => e.metricType === "pending");
    if (target) {
      target.count += 1;
    }
  }

  return entries;
}

export function getPhaseOverviewStats(phase, paperCount, papers = [], activePhaseLabel = "") {
  const phasePapers = phase?.papers || {};
  const inherited = Array.isArray(phasePapers.inherited) ? phasePapers.inherited : [];
  const added = Array.isArray(phasePapers.new) ? phasePapers.new : [];
  const selected = Array.isArray(phasePapers.selected) ? phasePapers.selected : [];
  const removed = Array.isArray(phasePapers.removed) ? phasePapers.removed : [];
  const totalSet = new Set([...inherited, ...added, ...selected, ...removed].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  const processedSet = new Set([...selected, ...removed].map(item => typeof item === "object" ? item.id || item.url : item).filter(Boolean));
  let total = totalSet.size;
  let processed = processedSet.size;

  const dynamic = getDynamicPhaseStats(phase?.label, papers);
  if (dynamic.total) {
    total = Math.max(total, dynamic.total);
    processed = Math.max(processed, dynamic.processed);
  }

  if (!total && phase?.label === activePhaseLabel && paperCount) total = paperCount;
  if (phase?.completed && total) processed = total;
  const percentage = total ? Math.min(100, Math.round((processed / total) * 100)) : (phase?.completed ? 100 : 0);
  return { total, processed, percentage };
}

export function getPaperAuthorsText(paper) {
  if (Array.isArray(paper?.authors) && paper.authors.length) {
    return paper.authors.map(author => typeof author === "string" ? author : author?.name).filter(Boolean).join(", ");
  }
  const raw = String(paper?.authorsRaw || "").trim();
  if (!raw) return "—";
  return raw.split(/\s+-\s+/)[0].trim() || raw;
}

export function getOverviewPaperKey(paper, fallbackIndex = 0) {
  const normalizedUrl = normalizeUrl(paper?.url || "").trim().toLowerCase();
  if (normalizedUrl) return `url:${normalizedUrl}`;
  if (paper?.id || paper?.id === 0) return `id:${paper.id}`;
  return `paper:${fallbackIndex}:${String(paper?.title || "").trim().toLowerCase()}`;
}

export function mergeOverviewPaper(base = {}, incoming = {}) {
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

export function extractPaperYear(paper) {
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

export function formatOverviewDate(value, includeTime = false) {
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

export function getPaperPhaseTitle(paper, phases = [], activePhaseLabel = "") {
  const phaseList = Array.isArray(phases) ? phases : [];
  const requested = paper?.phaseLabel || paper?.phase || paper?.phaseId || paper?.iterationId;
  const phase = phaseList.find(item => [item?.label, item?.id, item?.title].filter(Boolean).includes(requested));
  if (phase) return phase.title || phase.label;
  const active = phaseList.find(item => item?.label === activePhaseLabel);
  return active?.title || active?.label || "—";
}

export function getPhaseStats(phase = {}, papers = []) {
  const phasePapers = phase.papers || {};
  const dynamic = getDynamicPhaseStats(phase.label, papers);
  const inheritedRefs = new Set(Array.isArray(phasePapers.inherited) ? phasePapers.inherited.map(String) : []);
  const legacyNewCount = Array.isArray(phasePapers.new)
    ? phasePapers.new.filter(reference => !inheritedRefs.has(String(reference))).length
    : 0;
  return {
    inherited: Math.max(inheritedRefs.size, dynamic.inherited),
    pending: Math.max(legacyNewCount, dynamic.pending),
    selected: Math.max(
      Array.isArray(phasePapers.selected)
        ? phasePapers.selected.filter(reference => !inheritedRefs.has(String(reference))).length
        : 0,
      dynamic.included
    ),
    removed: Math.max(
      Array.isArray(phasePapers.removed) ? phasePapers.removed.length : 0,
      dynamic.excluded
    ),
    utilization: phase.completed
      ? 100
      : (dynamic.total ? Math.round((dynamic.processed / dynamic.total) * 100) : 0)
  };
}

export function canDeletePhaseLabel(label, phases = [], activePhaseLabel = "") {
  const phaseList = Array.isArray(phases) ? phases : [];
  const phaseIndex = phaseList.findIndex(phase => phase?.label === label);
  const activeIndex = phaseList.findIndex(phase => phase?.label === activePhaseLabel);
  if (phaseIndex < 0 || phaseList.length <= 1) return false;
  return activeIndex >= 0 && phaseIndex >= activeIndex;
}

export function isReorderablePlannedPhase(label, phases = [], activePhaseLabel = "") {
  return canDeletePhaseLabel(label, phases, activePhaseLabel);
}

export function getPhaseArchiveRecords(phase = {}, projectPapers = []) {
  const phaseLabel = phase?.label;
  if (!phaseLabel) return [];

  const papers = Array.isArray(projectPapers) ? projectPapers : [];
  const paperById = new Map();
  const paperByUrl = new Map();
  papers.forEach((paper) => {
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
    if (inherited && outcome === "pending") outcome = "included";
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

  for (const paper of papers) {
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

  addBucket(phasePapers.selected, { outcome: "included" });
  addBucket(phasePapers.removed, { outcome: "excluded" });
  addBucket(phasePapers.new, { outcome: "pending" });
  addBucket(phasePapers.inherited, { inherited: true, outcome: "included" });

  return [...records.values()].sort((first, second) => {
    const dateOrder = String(second.classifiedAt || "").localeCompare(String(first.classifiedAt || ""));
    if (dateOrder) return dateOrder;
    const firstTitle = String(first.paper?.title || first.paper?.url || first.paper?.id || "");
    const secondTitle = String(second.paper?.title || second.paper?.url || second.paper?.id || "");
    return firstTitle.localeCompare(secondTitle, "pt-BR");
  });
}

export const DEFAULT_TUTORIAL_CATEGORIES = Object.freeze([
  {
    title: "Incluir",
    label: "incluir",
    description: "Artigos que atendem aos critérios da fase e devem seguir para a próxima etapa da pesquisa.",
    color: "#22C55E",
    metricType: "included",
    criteria: [],
  },
  {
    title: "Excluir",
    label: "excluir",
    description: "Artigos que não atendem aos critérios da fase e não devem seguir na progressão.",
    color: "#EF4444",
    metricType: "excluded",
    criteria: [],
  },
  {
    title: "Pendente",
    label: "pendente",
    description: "Artigos que ainda precisam ser analisados antes de uma decisão de inclusão ou exclusão.",
    color: "#F59E0B",
    metricType: "pending",
    criteria: [],
  },
]);

export const DEFAULT_PROJECT_CATEGORIES = DEFAULT_TUTORIAL_CATEGORIES;

export function isDefaultCategory(categoryLabel) {
  const norm = String(categoryLabel || "").trim().toLowerCase();
  return DEFAULT_TUTORIAL_CATEGORIES.some(c => c.label === norm);
}

export function isCategoryLinkedToInheritedOrPriorPhasePapers(categoryLabel, papers = [], phases = []) {
  if (!categoryLabel || !Array.isArray(papers) || !papers.length) return false;
  const normTarget = String(categoryLabel).trim().toLowerCase();

  const phaseIndexMap = new Map();
  (Array.isArray(phases) ? phases : []).forEach((p, idx) => {
    if (p?.label) phaseIndexMap.set(p.label, idx);
    if (p?.id) phaseIndexMap.set(p.id, idx);
  });

  for (const paper of papers) {
    if (!paper) continue;

    const isPaperInherited = paper.inherited === true
      || String(paper.entryType || "").toLowerCase() === "inherited"
      || Boolean(paper.inheritedFromPhaseLabel);

    const classifications = paper.classifications;
    if (classifications && typeof classifications === "object" && !Array.isArray(classifications)) {
      for (const [phaseKey, classif] of Object.entries(classifications)) {
        if (!classif) continue;
        const cat = String(classif.categoryLabel || "").trim().toLowerCase();
        if (cat === normTarget) {
          if (
            classif.inherited === true
            || String(classif.entryType || "").toLowerCase() === "inherited"
            || Boolean(classif.inheritedFromPhaseLabel)
          ) {
            return true;
          }
          if (isPaperInherited) {
            return true;
          }
          if (phases.length > 1 && phaseIndexMap.has(phaseKey)) {
            const idx = phaseIndexMap.get(phaseKey);
            if (idx < phases.length - 1) {
              return true;
            }
          }
        }
      }
    }

    const topCat = String(paper.categoryLabel || "").trim().toLowerCase();
    const paperPhase = paper.phaseLabel || paper.phaseId || paper.iterationId;
    if (topCat === normTarget) {
      if (isPaperInherited) return true;
      if (phases.length > 1 && paperPhase && phaseIndexMap.has(paperPhase)) {
        const idx = phaseIndexMap.get(paperPhase);
        if (idx < phases.length - 1) {
          return true;
        }
      }
    }

    if (isPaperInherited && Array.isArray(paper.history)) {
      const hadCatInHistory = paper.history.some(h => 
        String(h?.details?.category || h?.details?.previousCategory || "").trim().toLowerCase() === normTarget
      );
      if (hadCatInHistory) return true;
    }
  }

  return false;
}

export function getCategoryDeletionBlockReason(project, categoryLabel, papers = []) {
  const categories = Array.isArray(project?.categories) ? project.categories : [];
  if (categories.length <= 1) {
    return "O projeto deve manter pelo menos uma categoria.";
  }

  if (isCategoryLinkedToInheritedOrPriorPhasePapers(categoryLabel, papers, project?.phases)) {
    return "Esta categoria está vinculada a artigos validados e herdados de fases anteriores. Ela não pode ser excluída para preservar o histórico metodológico, podendo apenas ser desativada na marcação das fases.";
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

export function getPapersForCategory(papers = [], categoryLabel) {
  if (!categoryLabel) return [];
  const normTarget = String(categoryLabel).trim().toLowerCase();
  return (Array.isArray(papers) ? papers : []).filter(paper => {
    if (!paper) return false;
    const topLevelCat = String(paper.categoryLabel || "").trim().toLowerCase();
    if (topLevelCat === normTarget) return true;

    if (Array.isArray(paper.tags) && paper.tags.some(t => String(t).trim().toLowerCase() === normTarget)) {
      return true;
    }

    const classifications = paper.classifications;
    if (classifications && typeof classifications === "object" && !Array.isArray(classifications)) {
      return Object.values(classifications).some(c => 
        String(c?.categoryLabel || "").trim().toLowerCase() === normTarget
      );
    }

    return false;
  });
}

export function getPaperPhaseLabels(paper) {
  const labels = new Set();
  const classifications = paper?.classifications;
  if (classifications && typeof classifications === "object" && !Array.isArray(classifications)) {
    Object.keys(classifications).filter(Boolean).forEach(label => labels.add(label));
  }
  [paper?.phaseLabel, paper?.phaseId, paper?.iterationId].filter(Boolean).forEach(label => labels.add(label));
  return [...labels];
}

export function getPaperPhaseDisplay(paper, phases = []) {
  const labels = getPaperPhaseLabels(paper);
  const phaseList = Array.isArray(phases) ? phases : [];
  if (!labels.length) return getPaperPhaseTitle(paper, phaseList);
  return labels.map(label => {
    const phase = phaseList.find(item => item?.label === label || item?.id === label || item?.title === label);
    return phase?.title || phase?.label || label || "—";
  }).join(" • ");
}

export function paperBelongsToPhase(paper, phaseLabel) {
  if (!phaseLabel || phaseLabel === "all") return true;
  return Boolean(getPaperClassificationForPhase(paper, phaseLabel));
}

export function getPaperMetricTypeForPhase(paper, phaseLabel, projectCategories = [], highlightedLinks = {}) {
  if (!phaseLabel || phaseLabel === "all") return getPaperMetricType(paper, projectCategories, highlightedLinks);
  const classification = getPaperClassificationForPhase(paper, phaseLabel);
  if (!classification) return "pending";
  if (classification.outcome) return normalizeMetricType(classification.outcome, "pending");
  const category = getPaperCategoryForPhase(paper, phaseLabel, projectCategories, highlightedLinks);
  if (category) {
    return normalizeCategoryMetricType(category.metricType, inferMetricTypeFromCategory(category));
  }
  return normalizeMetricType(paper?.status, "pending");
}

export function getPaperMetricLabel(metricType) {
  return PAPER_METRIC_LABELS[normalizeMetricType(metricType, "pending")] || "Pendentes";
}

export function paperMatchesFilters(paper, filters = {}, projectCategories = [], highlightedLinks = {}) {
  if (filters.phase && filters.phase !== "all" && !paperBelongsToPhase(paper, filters.phase)) return false;

  if (filters.q) {
    const query = String(filters.q).trim();
    if (query.startsWith("id:")) {
      const targetId = query.replace("id:", "").trim();
      return String(paper.id) === targetId;
    }
    if (query.startsWith("parent:")) {
      const targetId = query.replace("parent:", "").trim();
      return String(paper.parentPaperId) === targetId;
    }
  }

  const category = getPaperCategoryForPhase(paper, filters.phase, projectCategories, highlightedLinks);

  if (filters.metric && filters.metric !== "all") {
    if (getPaperMetricTypeForPhase(paper, filters.phase, projectCategories, highlightedLinks) !== filters.metric) return false;
  }

  if (filters.category && filters.category !== "all") {
    const categoryKey = getPaperCategoryKey(category);
    if (categoryKey !== filters.category) return false;
  }

  if (!filters.q) return true;

  const normalizedQuery = normalizeStr(filters.q);
  const categoryText = category ? `${category.title || ""} ${category.label || ""}` : "";
  const metricText = getPaperMetricLabel(getPaperMetricTypeForPhase(paper, filters.phase, projectCategories, highlightedLinks));
  const phaseText = getPaperPhaseDisplay(paper, filters.phases || []);
  const hay = normalizeStr(`${paper.title || ""} ${paper.authorsRaw || ""} ${(paper.tags || []).join(" ")} ${paper.year || ""} ${paper.url || ""} ${categoryText} ${metricText} ${phaseText}`);
  return hay.includes(normalizedQuery);
}

export function getMergedPapers(consolidatedPapers = [], scopedPapers = [], highlightedLinks = {}) {
  const globalPapers = Array.isArray(consolidatedPapers) ? consolidatedPapers : [];
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
  globalPapers.forEach((paper, index) => {
    if (!paper || typeof paper !== "object") return;
    const key = getOverviewPaperKey(paper, index);
    byKey.set(key, mergeOverviewPaper(byKey.get(key), paper));
  });

  (Array.isArray(scopedPapers) ? scopedPapers : []).forEach((scopedPaper, index) => {
    if (!scopedPaper || typeof scopedPaper !== "object") return;
    const consolidated = globalById.get(String(scopedPaper.id))
      || globalByUrl.get(normalizeUrl(scopedPaper.url))
      || {};
    const paper = mergeOverviewPaper(consolidated, scopedPaper);
    const key = getOverviewPaperKey(paper, index);
    byKey.set(key, mergeOverviewPaper(byKey.get(key), paper));
  });

  for (const [url, color] of Object.entries(highlightedLinks || {})) {
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

  return [...byKey.values()].filter(paper => paper?.visited !== false);
}

export function getPaperClassificationsMap(paper) {
  return paper?.classifications
    && typeof paper.classifications === "object"
    && !Array.isArray(paper.classifications)
    ? { ...paper.classifications }
    : {};
}

export function getLatestRemainingClassification(classifications, phases = []) {
  const phaseList = Array.isArray(phases) ? phases : [];
  for (let index = phaseList.length - 1; index >= 0; index -= 1) {
    const phaseLabel = phaseList[index]?.label;
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

export function removePaperClassificationFromActivePhase(paper, activePhaseLabel, projectCategories = [], phases = []) {
  if (!paper || !activePhaseLabel) return null;
  if (isPaperLockedInActivePhase(paper, activePhaseLabel)) {
    return paper;
  }

  const classifications = getPaperClassificationsMap(paper);
  delete classifications[activePhaseLabel];

  const updatedAt = new Date().toISOString();
  const history = Array.isArray(paper.history) ? [...paper.history] : [];
  history.push({
    ts: updatedAt,
    action: "unmark",
    details: { phaseLabel: activePhaseLabel, visited: false },
  });

  const latest = getLatestRemainingClassification(classifications, phases);
  if (!latest) {
    return {
      ...paper,
      classifications: {},
      phaseLabel: null,
      iterationId: null,
      categoryLabel: null,
      status: "pending",
      visited: false,
      updatedAt,
      history,
    };
  }

  const [latestPhaseLabel, latestClassification] = latest;
  const categoryLabels = new Set(
    (Array.isArray(projectCategories) ? projectCategories : [])
      .map(category => category?.label)
      .filter(Boolean)
  );
  const categoryLabel = latestClassification?.categoryLabel || null;
  const baseTags = (Array.isArray(paper.tags) ? paper.tags : [])
    .filter(tag => !categoryLabels.has(tag));
  const tags = [...new Set([...baseTags, ...(categoryLabel ? [categoryLabel] : [])])];

  return {
    ...paper,
    classifications,
    phaseLabel: latestClassification?.phaseLabel || latestPhaseLabel,
    iterationId: latestClassification?.phaseLabel || latestPhaseLabel,
    categoryLabel,
    status: normalizeMetricType(latestClassification?.outcome, "pending"),
    tags,
    visited: true,
    updatedAt,
    history,
  };
}

export function mergePaperSourcesForBulk(...sources) {
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

export function findPaperIndexForBulk(collection, paper) {
  const list = Array.isArray(collection) ? collection : [];
  const id = paper?.id;
  if ((id || id === 0) && !String(id).startsWith("marked:")) {
    const byId = list.findIndex(item => String(item?.id) === String(id));
    if (byId >= 0) return byId;
  }

  const normalizedUrl = normalizeUrl(paper?.url || "");
  if (!normalizedUrl) return -1;
  return list.findIndex(item => (
    normalizeUrl(item?.url || "") === normalizedUrl
  ));
}

export function createBulkClassifiedPaper(previousPaper, category, phaseLabel, classifiedAt, projectCategories = []) {
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
    (Array.isArray(projectCategories) ? projectCategories : [])
      .flatMap(item => [item?.label, item?.title])
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const tags = [...new Set([
    ...(Array.isArray(previousPaper?.tags)
      ? previousPaper.tags.filter((tag) => {
          const normalizedTag = String(tag || "").trim().toLowerCase();
          return normalizedTag && !categoryReferences.has(normalizedTag);
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
        automatic: false,
      },
    },
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

export function isPaperLockedInActivePhase(paper, activePhaseLabel) {
  if (!paper) return false;

  if (activePhaseLabel) {
    const classification = getPaperClassificationForPhase(paper, activePhaseLabel);
    if (classification) {
      return classification.inherited === true
        || String(classification.entryType || "").toLowerCase() === "inherited"
        || Boolean(classification.inheritedFromPhaseLabel);
    }
    if (paper.phaseLabel === activePhaseLabel || paper.iterationId === activePhaseLabel) {
      return paper.inherited === true
        || String(paper.entryType || "").toLowerCase() === "inherited"
        || Boolean(paper.inheritedFromPhaseLabel);
    }
  }

  return paper.inherited === true
    || String(paper.entryType || "").toLowerCase() === "inherited"
    || Boolean(paper.inheritedFromPhaseLabel);
}




