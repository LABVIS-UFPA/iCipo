import { writable, derived, get } from 'svelte/store';
import { storage, ICIPO_DATA_REVISION_KEY } from '../../../infrastructure/storage.mjs';
import { Project } from '../../../core/entities.mjs';
import {
  normalizeUrl,
  normalizeHexColor,
  getOverviewPaperKey,
  mergeOverviewPaper,
  computeOverviewMetrics,
  buildCategoryDistribution,
  getPhaseOverviewStats,
  getOverviewScopedPapers,
  DEFAULT_TUTORIAL_CATEGORIES,
  PAPER_BULK_ACTION_COPY,
  normalizeCategoryMetricType,
  inferMetricTypeFromCategory,
  paperMatchesFilters,
  getMergedPapers,
  isPaperLockedInActivePhase,
  findPaperIndexForBulk,
  mergePaperSourcesForBulk,
  createBulkClassifiedPaper,
  removePaperClassificationFromActivePhase,
  isPhaseCompleted
} from './dashboardHelpers.js';


// Tutorial & Intro storage helpers
function tutorialStorageKey(projectID) {
  return projectID ? `icipo:tutorial:${projectID}` : '';
}

export function getTutorialStage(projectID) {
  const key = tutorialStorageKey(projectID);
  if (!key) return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function setTutorialStage(stage, projectID) {
  const key = tutorialStorageKey(projectID);
  if (!key) return;
  try {
    if (stage) window.localStorage.setItem(key, stage);
    else window.localStorage.removeItem(key);
  } catch {}
}

function dashboardIntroStorageKey(projectID) {
  return projectID ? `icipo:dashboard-intro:${projectID}` : '';
}

export function hasSeenDashboardIntro(projectID) {
  const key = dashboardIntroStorageKey(projectID);
  if (!key) return false;
  try { return window.localStorage.getItem(key) === 'seen'; } catch { return false; }
}

export function markDashboardIntroSeen(projectID) {
  const key = dashboardIntroStorageKey(projectID);
  if (!key) return;
  try { window.localStorage.setItem(key, 'seen'); } catch {}
}

// Stores
export const projectStore = writable({});
export const papersStore = writable([]);
export const highlightedLinksStore = writable({});
export const accessStateStore = writable('loading'); // 'loading' | 'ready' | 'project-required' | 'offline'
export const activeViewStore = writable('overview'); // 'overview' | 'phases' | 'categories' | 'papers'
export const phaseCreationRequiredStore = writable(false);
export const dashboardIntroRequiredStore = writable(false);
export const categoryCreationRequiredStore = writable(false);
export const overviewMetricScopeStore = writable('all');
export const paperSearchQueryStore = writable('');
export const paperMetricFilterStore = writable('all');
export const paperCategoryFilterStore = writable('all');
export const paperPhaseFilterStore = writable('active');
export const paperCurrentPhaseToggleStore = writable(true);
export const selectedPaperIdsStore = writable(new Set());
export const paperBulkStatusStore = writable({ message: '', tone: '' });
export const currentSnowballParentIdStore = writable(null);
export const currentSnowballTitleStore = writable(null);
export const historyModalPaperStore = writable(null);
export const isHistoryModalOpenStore = writable(false);
export const bulkCategoryModalStore = writable(null); // { outcome, categories, selectedCount }
export const isBulkCategoryModalOpenStore = writable(false);
export const articleTutorialOpenStore = writable(false);
export const serverStatusStore = writable('Conectado');

export const activePhaseLabelStore = derived(projectStore, ($project) => {
  return $project.activePhaseLabel
    || $project.phases?.find(phase => !phase?.completed)?.label
    || null;
});

export const overviewMetricsStore = derived(
  [papersStore, highlightedLinksStore, overviewMetricScopeStore, activePhaseLabelStore, projectStore],
  ([$papers, $links, $scope, $activePhase, $project]) => {
    return computeOverviewMetrics($papers, $links, $scope, $activePhase, $project.categories || []);
  }
);

export const categoryDistributionStore = derived(
  [papersStore, projectStore, highlightedLinksStore, overviewMetricScopeStore, activePhaseLabelStore],
  ([$papers, $project, $links, $scope, $activePhase]) => {
    const consolidated = $papers.filter(p => p?.visited !== false);
    const overviewPapers = getOverviewScopedPapers(consolidated, $scope, $activePhase);
    return buildCategoryDistribution(overviewPapers, $project.categories || [], $links, $scope, $activePhase);
  }
);

export const phaseProgressStore = derived(
  [projectStore, papersStore, activePhaseLabelStore],
  ([$project, $papers, $activePhase]) => {
    const phases = Array.isArray($project.phases) ? $project.phases : [];
    const consolidated = $papers.filter(p => p?.visited !== false);
    return phases.map((phase) => {
      const stats = getPhaseOverviewStats(phase, consolidated.length, consolidated, $activePhase);
      return {
        phase,
        ...stats
      };
    });
  }
);

export const recentArticlesStore = derived(
  [papersStore, overviewMetricScopeStore, activePhaseLabelStore],
  ([$papers, $scope, $activePhase]) => {
    const consolidated = $papers.filter(p => p?.visited !== false);
    const scoped = getOverviewScopedPapers(consolidated, $scope, $activePhase);
    return [...scoped]
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || "";
        const dateB = b.updatedAt || b.createdAt || "";
        return String(dateB).localeCompare(String(dateA));
      })
      .slice(0, 10);
  }
);

export const filteredPapersStore = derived(
  [
    papersStore,
    projectStore,
    paperSearchQueryStore,
    paperPhaseFilterStore,
    paperMetricFilterStore,
    paperCategoryFilterStore,
    highlightedLinksStore,
    activePhaseLabelStore
  ],
  ([
    $papers,
    $project,
    $search,
    $phase,
    $metric,
    $category,
    $highlighted,
    $activePhase
  ]) => {
    const categories = Array.isArray($project?.categories) ? $project.categories : [];
    const phases = Array.isArray($project?.phases) ? $project.phases : [];
    const effectivePhase = $phase === 'active' ? ($activePhase || 'all') : $phase;

    const filters = {
      q: $search,
      phase: effectivePhase,
      metric: $metric,
      category: $category,
      phases
    };

    return $papers
      .filter(paper => paperMatchesFilters(paper, filters, categories, $highlighted))
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || '';
        const dateB = b.updatedAt || b.createdAt || '';
        return String(dateB).localeCompare(String(dateA));
      });
  }
);

let liveSyncBound = false;
let lastDataRevisionId = '';
let refreshDebounceTimer = null;
let storageChangeListener = null;

function unwrapStoragePayload(response) {
  if (!response) return {};
  if (response.data && typeof response.data === "object") return response.data;
  return typeof response === "object" ? response : {};
}

async function fetchOverviewContext(project, consolidatedPapers) {
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

  return {
    highlightedLinks,
    scopedPapers: Array.isArray(activeScope.svat_papers) ? activeScope.svat_papers : []
  };
}

export async function loadDashboardState() {
  accessStateStore.set('loading');
  try {
    const res = await storage.getActiveProject();
    if (!res || !res.id) {
      accessStateStore.set('project-required');
      phaseCreationRequiredStore.set(false);
      dashboardIntroRequiredStore.set(false);
      categoryCreationRequiredStore.set(false);
      articleTutorialOpenStore.set(false);
      return;
    }

    const project = res;
    projectStore.set(project);

    let consolidatedPapers = [];
    try {
      const papersRes = await storage.listPapers(project.id);
      if (Array.isArray(papersRes)) consolidatedPapers = papersRes;
      else if (papersRes?.data && Array.isArray(papersRes.data)) consolidatedPapers = papersRes.data;
    } catch (e) {
      console.warn('Erro ao carregar lista de artigos:', e);
    }

    const { highlightedLinks, scopedPapers } = await fetchOverviewContext(project, consolidatedPapers);
    highlightedLinksStore.set(highlightedLinks);

    const mergedPapers = getMergedPapers(consolidatedPapers, scopedPapers, highlightedLinks);
    papersStore.set(mergedPapers);

    try {
      const snowballData = await storage.get(["svat_current_snowball_parent", "svat_current_snowball_title"]);
      currentSnowballParentIdStore.set(snowballData.svat_current_snowball_parent || null);
      currentSnowballTitleStore.set(snowballData.svat_current_snowball_title || null);
    } catch {}

    const hasPhases = Array.isArray(project.phases) && project.phases.length > 0;
    const hasCategories = Array.isArray(project.categories) && project.categories.length > 0;
    const phaseReq = !hasPhases;
    const introReq = phaseReq && !hasSeenDashboardIntro(project.id);
    const savedTutorialStage = getTutorialStage(project.id);
    const catReq = !phaseReq && !hasCategories && ['category-pending', 'category-required'].includes(savedTutorialStage);
    const artReq = !phaseReq && hasCategories && savedTutorialStage === 'articles-open';

    phaseCreationRequiredStore.set(phaseReq);
    dashboardIntroRequiredStore.set(introReq);
    categoryCreationRequiredStore.set(catReq);
    articleTutorialOpenStore.set(artReq);
    accessStateStore.set('ready');

    const defaultView = introReq ? 'overview' : (phaseReq ? 'phases' : (catReq ? 'categories' : (artReq ? 'papers' : 'overview')));
    activeViewStore.set(defaultView);
  } catch (err) {
    console.error('Falha ao carregar estado do dashboard:', err);
    if (err?.message === "No active project") {
      accessStateStore.set('project-required');
    } else if (err?.message === "WebSocket not connected") {
      accessStateStore.set('offline');
    } else {
      accessStateStore.set('offline');
    }
  }
}

export function scheduleDashboardRefresh(reason = "storage_change", delayMs = 220) {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    loadDashboardState();
  }, delayMs);
}

export function bindStorageSync() {
  if (liveSyncBound) return;
  liveSyncBound = true;

  if (typeof chrome !== "undefined" && chrome.storage?.local && chrome.storage?.onChanged) {
    storageChangeListener = (changes, areaName) => {
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
        serverStatusStore.set('Conectado');
        scheduleDashboardRefresh("server_reconnected", 80);
      } else if (changes.server_status?.newValue) {
        serverStatusStore.set(changes.server_status.newValue);
      }

      if (changes.svat_current_snowball_parent) {
        currentSnowballParentIdStore.set(changes.svat_current_snowball_parent.newValue || null);
      }
      if (changes.svat_current_snowball_title) {
        currentSnowballTitleStore.set(changes.svat_current_snowball_title.newValue || null);
      }
    };
    chrome.storage.onChanged.addListener(storageChangeListener);
  }

  window.addEventListener("focus", () => scheduleDashboardRefresh("window_focus", 60));
  window.addEventListener("pageshow", () => scheduleDashboardRefresh("page_show", 60));
}

export function unbindStorageSync() {
  if (storageChangeListener && typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(storageChangeListener);
    storageChangeListener = null;
  }
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = null;
  }
  liveSyncBound = false;
}

export function setActiveView(view) {
  const introReq = get(dashboardIntroRequiredStore);
  const phaseReq = get(phaseCreationRequiredStore);
  const catReq = get(categoryCreationRequiredStore);

  const allowedView = introReq
    ? 'overview'
    : (phaseReq
      ? 'phases'
      : (catReq ? 'categories' : view));

  activeViewStore.set(allowedView);
}

export function setOverviewMetricScope(scope) {
  overviewMetricScopeStore.set(scope);
}

export function openPapersWithFilter({ metric = 'all', category = 'all', phase = 'active' } = {}) {
  paperMetricFilterStore.set(metric);
  paperCategoryFilterStore.set(category);
  paperPhaseFilterStore.set(phase);
  paperCurrentPhaseToggleStore.set(phase === 'active');
  activeViewStore.set('papers');
}

export function resetPaperFilters() {
  paperPhaseFilterStore.set('all');
  paperMetricFilterStore.set('all');
  paperCategoryFilterStore.set('all');
  paperCurrentPhaseToggleStore.set(false);
  paperSearchQueryStore.set('');
}

export function setPaperFilterCurrentPhase(checked) {
  paperCurrentPhaseToggleStore.set(checked);
  paperPhaseFilterStore.set(checked ? 'active' : 'all');
}

export function togglePaperSelection(paperId, checked) {
  selectedPaperIdsStore.update((ids) => {
    const next = new Set(ids);
    if (checked) next.add(String(paperId));
    else next.delete(String(paperId));
    return next;
  });
}

export function selectAllPapers(checked, selectableIds = []) {
  selectedPaperIdsStore.update((ids) => {
    if (!checked) return new Set();
    const next = new Set(ids);
    for (const id of selectableIds) {
      next.add(String(id));
    }
    return next;
  });
}

let bulkStatusTimer = null;
export function setBulkStatus(message = '', tone = '', autoClear = true) {
  if (bulkStatusTimer) {
    clearTimeout(bulkStatusTimer);
    bulkStatusTimer = null;
  }
  paperBulkStatusStore.set({ message, tone });
  if (message && autoClear && tone !== 'loading') {
    bulkStatusTimer = setTimeout(() => {
      paperBulkStatusStore.set({ message: '', tone: '' });
      bulkStatusTimer = null;
    }, tone === 'error' ? 8000 : 6000);
  }
}

export async function updatePaperFieldAction(paperId, field, val) {
  const papers = get(papersStore);
  const target = papers.find(p => String(p.id) === String(paperId));
  if (!target) return;

  const prev = target[field];
  let finalVal = val;
  if (field === "year") {
    const n = Number(val);
    finalVal = Number.isFinite(n) ? n : null;
  } else if (field === "tags") {
    finalVal = typeof val === 'string'
      ? val.split(/[;,]/).map(s => s.trim()).filter(Boolean)
      : (Array.isArray(val) ? val : []);
  }

  target[field] = finalVal;
  target.updatedAt = new Date().toISOString();

  const history = Array.isArray(target.history) ? [...target.history] : [];
  history.push({
    ts: target.updatedAt,
    action: "update_field",
    details: { field, from: prev, to: finalVal }
  });
  target.history = history;

  await storage.savePaper(target);

  try {
    const scoped = await storage.get(["svat_papers"]);
    const scopedPapers = Array.isArray(scoped?.svat_papers) ? scoped.svat_papers : [];
    const scopedIndex = scopedPapers.findIndex(p => String(p.id) === String(paperId) || normalizeUrl(p?.url || '') === normalizeUrl(target?.url || ''));
    if (scopedIndex >= 0) {
      scopedPapers[scopedIndex] = { ...scopedPapers[scopedIndex], [field]: finalVal, updatedAt: target.updatedAt, history };
      await storage.set({ svat_papers: scopedPapers });
    }
  } catch (e) {
    console.warn("Não foi possível sincronizar svat_papers:", e);
  }

  await loadDashboardState();
}

export async function toggleSnowballParentAction(paperId, paperTitle) {
  const currentId = get(currentSnowballParentIdStore);
  if (currentId === String(paperId)) {
    currentSnowballParentIdStore.set(null);
    currentSnowballTitleStore.set(null);
    await storage.set({ svat_current_snowball_parent: null, svat_current_snowball_title: null });
  } else {
    currentSnowballParentIdStore.set(String(paperId));
    currentSnowballTitleStore.set(paperTitle);
    await storage.set({ svat_current_snowball_parent: String(paperId), svat_current_snowball_title: paperTitle });
  }
}

export function openHistoryModal(paper) {
  historyModalPaperStore.set(paper);
  isHistoryModalOpenStore.set(true);
}

export function closeHistoryModal() {
  isHistoryModalOpenStore.set(false);
  historyModalPaperStore.set(null);
}

export function openArticleTutorial() {
  articleTutorialOpenStore.set(true);
}

export function closeArticleTutorial() {
  articleTutorialOpenStore.set(false);
  const project = get(projectStore);
  if (project?.id) {
    setTutorialStage('complete', project.id);
  }
}

export function closePaperBulkCategoryModal() {
  isBulkCategoryModalOpenStore.set(false);
  bulkCategoryModalStore.set(null);
}

export function requestPaperBulkOutcomeAction(outcome) {
  const normalizedOutcome = normalizeCategoryMetricType(outcome, "pending");
  const selectedIds = get(selectedPaperIdsStore);
  if (!selectedIds.size) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  const project = get(projectStore);
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const activePhase = phases.find(p => p.label === project.activePhaseLabel && !p.completed)
    || phases.find(p => !p.completed)
    || null;

  if (!activePhase) {
    alert("Crie uma fase antes de classificar artigos.");
    return;
  }
  if (isPhaseCompleted(activePhase)) {
    alert("A fase ativa está concluída. Crie a próxima fase ou reabra a atual antes de alterar a triagem.");
    return;
  }

  const allowedLabels = new Set(Array.isArray(activePhase.categories) ? activePhase.categories : []);
  const matchingCategories = (Array.isArray(project.categories) ? project.categories : [])
    .filter(cat => allowedLabels.has(cat.label))
    .filter(cat => normalizeCategoryMetricType(cat.metricType, inferMetricTypeFromCategory(cat)) === normalizedOutcome);

  const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
  if (!matchingCategories.length) {
    alert(`A fase ativa não possui uma categoria relacionada a “${copy.result}”. Edite a fase e marque pelo menos uma categoria com esse impacto antes de usar esta ação.`);
    return;
  }

  if (matchingCategories.length === 1) {
    applyPaperBulkCategoryAction(matchingCategories[0], normalizedOutcome);
    return;
  }

  bulkCategoryModalStore.set({
    outcome: normalizedOutcome,
    categories: matchingCategories,
    selectedCount: selectedIds.size
  });
  isBulkCategoryModalOpenStore.set(true);
}

export async function applyPaperBulkCategoryAction(category, requestedOutcome) {
  const project = get(projectStore);
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const activePhase = phases.find(p => p.label === project.activePhaseLabel && !p.completed)
    || phases.find(p => !p.completed)
    || null;

  if (!activePhase || isPhaseCompleted(activePhase)) {
    alert("A fase ativa não está disponível para classificação.");
    return;
  }

  const selectedIds = get(selectedPaperIdsStore);
  const papers = get(papersStore);
  const selectedPapers = papers.filter(p => selectedIds.has(String(p.id)));

  if (!selectedPapers.length) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  if (selectedPapers.some(p => isPaperLockedInActivePhase(p, activePhase.label))) {
    alert("Artigos herdados da fase anterior ficam travados nesta fase e não podem mudar de categoria.");
    return;
  }

  setBulkStatus("Atualizando a classificação e as métricas da fase…", "loading", false);

  try {
    const data = await storage.get(["highlightedLinks", "svat_papers", "svat_project"]);
    const highlightedLinks = data?.highlightedLinks && typeof data.highlightedLinks === "object"
      ? { ...data.highlightedLinks }
      : {};
    const scopedPapers = Array.isArray(data?.svat_papers) ? [...data.svat_papers] : [];
    const classifiedAt = new Date().toISOString();
    const changedPapers = [];
    const processedIds = new Set();

    for (const renderedPaper of selectedPapers) {
      const scopedIndex = findPaperIndexForBulk(scopedPapers, renderedPaper);
      const scopedPaper = scopedIndex >= 0 ? scopedPapers[scopedIndex] : null;
      const previousPaper = mergePaperSourcesForBulk(scopedPaper, renderedPaper);

      const nextPaper = createBulkClassifiedPaper(
        previousPaper,
        category,
        activePhase.label,
        classifiedAt,
        project.categories
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
          id: project.id,
          title: project.name || project.title || "Projeto",
          createdAt: project.createdAt || classifiedAt,
        };
    scopedProject.activePhaseLabel = activePhase.label;
    scopedProject.currentIterationId = activePhase.label;

    await storage.set({
      highlightedLinks,
      svat_papers: scopedPapers,
      svat_project: scopedProject,
    });

    await updateScholarContextMenu();
    await loadDashboardState();

    selectedPaperIdsStore.set(new Set());
    const normalizedOutcome = normalizeCategoryMetricType(requestedOutcome, "pending");
    const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
    const quantity = changedPapers.length;
    const resultText = quantity === 1 ? copy.singular : copy.plural;
    setBulkStatus(
      `${quantity} artigo${quantity === 1 ? "" : "s"} ${resultText} com a categoria “${category.title || category.label}”.`,
      "success"
    );
  } catch (error) {
    console.warn("paper bulk classification failed", error);
    const message = error?.message || "Não foi possível classificar os artigos selecionados.";
    setBulkStatus(message, "error");
    alert(message);
  } finally {
    closePaperBulkCategoryModal();
  }
}

export async function bulkDeleteMarkedSelectedAction() {
  const selectedIds = get(selectedPaperIdsStore);
  if (!selectedIds.size) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  if (!confirm(`Retirar ${selectedIds.size} artigo(s) selecionado(s) da fase ativa? Essa ação remove a marcação; para classificar como excluído, use o botão “Remover”.`)) return;

  const project = get(projectStore);
  const activePhaseLabel = project?.activePhaseLabel;
  if (!activePhaseLabel) {
    alert("Nenhuma fase ativa disponível.");
    return;
  }

  const papers = get(papersStore);
  const selectedPapers = papers.filter(p => selectedIds.has(String(p.id)));
  const selectedUrls = new Set(
    selectedPapers.map(p => p.url).filter(Boolean).map(normalizeUrl)
  );

  setBulkStatus("Retirando as marcações da fase ativa…", "loading", false);

  try {
    const data = await storage.get(["highlightedLinks", "svat_papers"]);
    const highlightedLinks = data?.highlightedLinks && typeof data.highlightedLinks === "object"
      ? { ...data.highlightedLinks }
      : {};
    for (const storedUrl of Object.keys(highlightedLinks)) {
      if (selectedUrls.has(normalizeUrl(storedUrl))) delete highlightedLinks[storedUrl];
    }

    const scopedPapers = Array.isArray(data?.svat_papers) ? data.svat_papers : [];
    const remainingScopedPapers = scopedPapers.filter(p => !selectedUrls.has(normalizeUrl(p?.url)));

    await storage.set({ highlightedLinks, svat_papers: remainingScopedPapers });

    for (const paper of selectedPapers) {
      const nextPaper = removePaperClassificationFromActivePhase(
        paper,
        activePhaseLabel,
        project.categories,
        project.phases
      );
      if (nextPaper) {
        await storage.savePaper(nextPaper);
      }
    }

    await loadDashboardState();
    selectedPaperIdsStore.set(new Set());
    setBulkStatus(
      `${selectedPapers.length} artigo${selectedPapers.length === 1 ? " foi retirado" : "s foram retirados"} da fase ativa.`,
      "success"
    );
  } catch (error) {
    console.warn("bulkDeleteMarkedSelectedAction failed", error);
    const message = error?.message || "Não foi possível remover os artigos da fase ativa.";
    setBulkStatus(message, "error");
    alert(message);
  }
}

export function dismissIntroModal() {
  const project = get(projectStore);
  if (project?.id) {
    markDashboardIntroSeen(project.id);
  }
  dashboardIntroRequiredStore.set(false);
  const phaseReq = get(phaseCreationRequiredStore);
  if (phaseReq) {
    activeViewStore.set('phases');
  }
}

export async function clearSnowballParent() {
  currentSnowballParentIdStore.set(null);
  currentSnowballTitleStore.set(null);
  try {
    await storage.set({ svat_current_snowball_parent: null, svat_current_snowball_title: null });
  } catch (e) {
    console.warn('Erro ao limpar contexto de snowballing:', e);
  }
}

export const expandedCompletedPhaseStore = writable(null);
export const editingPhaseStore = writable(null);
export const isPhasePanelOpenStore = writable(false);

export function openPhasePanel(phase = null) {
  editingPhaseStore.set(phase);
  isPhasePanelOpenStore.set(true);
}

export function closePhasePanel() {
  const phaseReq = get(phaseCreationRequiredStore);
  if (phaseReq) {
    // If phase creation is required, user cannot simply close without creating
    return false;
  }
  isPhasePanelOpenStore.set(false);
  editingPhaseStore.set(null);
  return true;
}

export async function savePhaseAction(phasePayload, phaseEditingLabel = null) {
  const project = get(projectStore);
  if (!project?.id) throw new Error('Abra um projeto antes de salvar fases.');

  if (phaseEditingLabel) {
    await storage.updatePhase(project.id, phaseEditingLabel, phasePayload);
  } else {
    await storage.savePhase(project.id, phasePayload);
  }

  await loadDashboardState();
}

export async function deletePhaseAction(phaseLabel) {
  const project = get(projectStore);
  if (!project?.id) throw new Error('Abra um projeto antes de excluir fases.');

  await storage.deletePhase(project.id, phaseLabel);
  await loadDashboardState();
}

export async function setActivePhaseAction(phaseLabel) {
  const project = get(projectStore);
  if (!project?.id) throw new Error('Abra um projeto antes de ativar uma fase.');

  await storage.setActivePhase(project.id, phaseLabel);
  await loadDashboardState();
}

export async function reorderPhasesAction(orderedLabels) {
  const project = get(projectStore);
  if (!project?.id) throw new Error('Abra um projeto antes de reorganizar fases.');

  await storage.reorderPhases(project.id, orderedLabels);
  await loadDashboardState();
}

export const editingCategoryStore = writable(null);
export const isCategoryPanelOpenStore = writable(false);

export function openCategoryPanel(category = null) {
  editingCategoryStore.set(category);
  isCategoryPanelOpenStore.set(true);
}

export function closeCategoryPanel() {
  const catReq = get(categoryCreationRequiredStore);
  if (catReq) return false;
  isCategoryPanelOpenStore.set(false);
  editingCategoryStore.set(null);
  return true;
}

export async function updateScholarContextMenu() {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "updateContextMenu" }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export async function saveCategoryAction(categoryData, editingCategoryLabel = null) {
  const rawProject = get(projectStore);
  if (!rawProject?.id) throw new Error("Nenhum projeto ativo.");

  const projectInstance = rawProject instanceof Project ? rawProject : Project.fromJSON(rawProject);
  if (editingCategoryLabel) {
    projectInstance.updateCategory(editingCategoryLabel, categoryData);
  } else {
    projectInstance.addCategory(categoryData);
  }

  await storage.saveProject(projectInstance);
  await updateScholarContextMenu();
  await loadDashboardState();
}

export async function deleteCategoryAction(categoryLabel) {
  const rawProject = get(projectStore);
  if (!rawProject?.id) throw new Error("Nenhum projeto ativo.");

  const projectInstance = rawProject instanceof Project ? rawProject : Project.fromJSON(rawProject);
  projectInstance.removeCategory(categoryLabel);

  await storage.saveProject(projectInstance);
  await updateScholarContextMenu();
  await loadDashboardState();
}

export async function createDefaultCategoriesAction() {
  const rawProject = get(projectStore);
  if (!rawProject?.id) throw new Error("Nenhum projeto ativo.");

  const projectInstance = rawProject instanceof Project ? rawProject : Project.fromJSON(rawProject);
  const existingMetricTypes = new Set(
    (projectInstance.categories || []).map(category => normalizeCategoryMetricType(
      category?.metricType,
      inferMetricTypeFromCategory(category || {})
    ))
  );

  for (const categoryData of DEFAULT_TUTORIAL_CATEGORIES) {
    if (existingMetricTypes.has(categoryData.metricType)) continue;
    projectInstance.addCategory({ ...categoryData, criteria: [...categoryData.criteria] });
    existingMetricTypes.add(categoryData.metricType);
  }

  const activePhase = projectInstance.getActivePhase?.()
    || projectInstance.phases?.find(phase => phase.label === projectInstance.activePhaseLabel)
    || null;
  if (activePhase) {
    const essentialLabels = (projectInstance.categories || [])
      .filter(category => DEFAULT_TUTORIAL_CATEGORIES.some(item => (
        normalizeCategoryMetricType(category?.metricType, inferMetricTypeFromCategory(category || {})) === item.metricType
      )))
      .map(category => category.label)
      .filter(Boolean);
    activePhase.categories = [...new Set([...(activePhase.categories || []), ...essentialLabels])];
  }

  await storage.saveProject(projectInstance);
  await updateScholarContextMenu();
  await loadDashboardState();
}


