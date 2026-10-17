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
  isPhaseCompleted,
  isDefaultCategory,
  getPapersForCategory,
  getCategoryDeletionBlockReason
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

export const DASHBOARD_VIEWS = ['overview', 'phases', 'categories'];

export function getSavedDashboardView() {
  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash.replace('#', '').toLowerCase().trim();
    if (DASHBOARD_VIEWS.includes(hash)) return hash;
  }
  try {
    const saved = localStorage.getItem('icipo_dashboard_view');
    if (saved && DASHBOARD_VIEWS.includes(saved.toLowerCase().trim())) {
      return saved.toLowerCase().trim();
    }
  } catch {}
  return 'overview';
}

export function persistDashboardView(view) {
  if (!DASHBOARD_VIEWS.includes(view)) return;
  try {
    localStorage.setItem('icipo_dashboard_view', view);
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', `#${view}`);
      } else {
        window.location.hash = `#${view}`;
      }
    }
  } catch {}
}

export const activeViewStore = writable(getSavedDashboardView()); // 'overview' | 'phases' | 'categories'
export const phaseCreationRequiredStore = writable(false);
export const dashboardIntroRequiredStore = writable(false);
export const categoryCreationRequiredStore = writable(false);
export const overviewMetricScopeStore = writable('all');
export const paperSearchQueryStore = writable('');
export const paperMetricFilterStore = writable('all');
export const paperCategoryFilterStore = writable('all');
export const paperPhaseFilterStore = writable('active');
export const phaseArticlesViewModeStore = writable(getSavedPhaseViewMode());

export function getSavedPhaseViewMode() {
  try {
    const saved = localStorage.getItem('icipo_phase_articles_view_mode');
    if (saved === 'table' || saved === 'cards') return saved;
  } catch {}
  return 'cards';
}

export function persistPhaseViewMode(mode) {
  if (mode !== 'table' && mode !== 'cards') return;
  try {
    localStorage.setItem('icipo_phase_articles_view_mode', mode);
  } catch {}
}

export function setPhaseArticlesViewMode(mode) {
  if (mode !== 'table' && mode !== 'cards') return;
  phaseArticlesViewModeStore.set(mode);
  persistPhaseViewMode(mode);
}

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
export const articleTutorialRequiredStore = writable(false);
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
      articleTutorialRequiredStore.set(false);
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
    let hasCategories = Array.isArray(project.categories) && project.categories.length > 0;
    if (!hasCategories) {
      try {
        const projectInstance = project instanceof Project ? project : Project.fromJSON(project);
        if (projectInstance.categories?.length) {
          await storage.saveProject(projectInstance);
          project = projectInstance.toJSON ? projectInstance.toJSON() : projectInstance;
          projectStore.set(project);
          hasCategories = true;
        }
      } catch (err) {
        console.warn('Erro ao inicializar categorias padrão no dashboard:', err);
      }
    }

    // Assegura que todas as fases tenham as categorias padrão ativadas por padrão
    const defaultCategoryLabels = (project.categories || [])
      .filter(c => isDefaultCategory(c.label) || ['included', 'excluded', 'pending'].includes(normalizeCategoryMetricType(c.metricType, inferMetricTypeFromCategory(c))))
      .map(c => c.label);

    if (defaultCategoryLabels.length > 0 && Array.isArray(project.phases) && project.phases.length > 0) {
      let phaseCategoriesUpdated = false;
      for (const ph of project.phases) {
        if (!Array.isArray(ph.categories)) ph.categories = [];
        const missingDefaults = defaultCategoryLabels.filter(dl => !ph.categories.includes(dl));
        if (missingDefaults.length > 0) {
          ph.categories = [...ph.categories, ...missingDefaults];
          phaseCategoriesUpdated = true;
        }
      }
      if (phaseCategoriesUpdated) {
        try {
          const projectInstance = project instanceof Project ? project : Project.fromJSON(project);
          projectInstance.phases = project.phases;
          await storage.saveProject(projectInstance);
        } catch (err) {
          console.warn('Erro ao sincronizar categorias padrão nas fases:', err);
        }
      }
    }

    let savedTutorialStage = getTutorialStage(project.id);
    if (hasPhases && !savedTutorialStage) {
      setTutorialStage('complete', project.id);
      savedTutorialStage = 'complete';
    }

    const isComplete = savedTutorialStage === 'complete';
    const introSeen = hasSeenDashboardIntro(project.id);

    let phaseReq = false;
    let introReq = false;
    let catReq = false;
    let artReq = false;

    if (!isComplete) {
      if (!hasPhases) {
        if (!introSeen) {
          introReq = true;
          phaseReq = true;
        } else {
          phaseReq = true;
          openPhasePanel(null);
        }
      } else if (savedTutorialStage === 'category-required') {
        catReq = true;
        openCategoryPanel(null);
      } else if (savedTutorialStage === 'articles-open') {
        artReq = true;
      } else {
        if (!hasCategories) {
          catReq = true;
          openCategoryPanel(null);
        } else {
          artReq = true;
        }
      }
    } else {
      phaseReq = !hasPhases;
    }

    phaseCreationRequiredStore.set(phaseReq);
    dashboardIntroRequiredStore.set(introReq);
    categoryCreationRequiredStore.set(catReq);
    articleTutorialOpenStore.set(artReq);
    articleTutorialRequiredStore.set(artReq);
    accessStateStore.set('ready');

    // Determina a visualização ativa respeitando a página atual ou salva pelo usuário
    const currentView = get(activeViewStore);
    const savedView = getSavedDashboardView();
    const preferredView = currentView && DASHBOARD_VIEWS.includes(currentView)
      ? currentView
      : savedView;

    let targetView = preferredView;
    if (introReq) {
      targetView = 'overview';
    } else if (phaseReq) {
      targetView = 'phases';
    } else if (catReq) {
      targetView = 'categories';
    } else if (artReq) {
      targetView = 'phases';
    } else if (!DASHBOARD_VIEWS.includes(targetView)) {
      targetView = 'overview';
    }

    persistDashboardView(targetView);
    activeViewStore.set(targetView);
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

let runtimeMessageListener = null;

export function bindStorageSync() {
  if (liveSyncBound) return;
  liveSyncBound = true;

  if (typeof chrome !== "undefined" && chrome.storage?.local && chrome.storage?.onChanged) {
    storageChangeListener = (changes, areaName) => {
      if (areaName !== "local") return;

      // Atualização automática imediata ao marcar link ou alterar dados no storage
      if (
        changes.highlightedLinks ||
        changes.svat_papers ||
        changes.svat_project ||
        changes.papers ||
        changes.projects ||
        changes[ICIPO_DATA_REVISION_KEY]
      ) {
        scheduleDashboardRefresh("storage_data_change", 40);
      }

      const revision = changes[ICIPO_DATA_REVISION_KEY]?.newValue;
      if (revision) {
        const revisionId = String(revision.id || revision.at || "");
        if (!revisionId || revisionId !== lastDataRevisionId) {
          lastDataRevisionId = revisionId;
          scheduleDashboardRefresh(revision.reason || "data_revision", 40);
        }
      }

      if (changes.server_status?.newValue === "Conectado") {
        serverStatusStore.set('Conectado');
        scheduleDashboardRefresh("server_reconnected", 60);
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

  // Listener para mensagens de broadcast disparadas quando um artigo é marcado no Google Scholar
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    runtimeMessageListener = (message) => {
      if (
        message?.action === 'refreshHighlights' ||
        message?.type === 'ARTICLE_MARKED' ||
        message?.type === 'DATA_UPDATED' ||
        message?.action === 'paper_marked'
      ) {
        scheduleDashboardRefresh("runtime_broadcast", 40);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  }

  window.addEventListener("focus", () => scheduleDashboardRefresh("window_focus", 40));
  window.addEventListener("pageshow", () => scheduleDashboardRefresh("page_show", 40));
}

export function unbindStorageSync() {
  if (storageChangeListener && typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(storageChangeListener);
    storageChangeListener = null;
  }
  if (runtimeMessageListener && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.removeListener(runtimeMessageListener);
    runtimeMessageListener = null;
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
  const artReq = get(articleTutorialRequiredStore);

  const allowedView = introReq
    ? 'overview'
    : (phaseReq
      ? 'phases'
      : (catReq
        ? 'categories'
        : (artReq ? 'phases' : view)));

  persistDashboardView(allowedView);
  activeViewStore.set(allowedView);
}

export function setOverviewMetricScope(scope) {
  overviewMetricScopeStore.set(scope);
}

export function openPapersWithFilter({ metric = 'all', category = 'all', phase = 'active' } = {}) {
  const project = get(projectStore);
  const phases = Array.isArray(project?.phases) ? project.phases : [];
  const activePhase = get(activePhaseLabelStore);

  let targetPhase = phase;
  if (!targetPhase || targetPhase === 'active' || targetPhase === 'all') {
    targetPhase = activePhase || (phases[0]?.label || null);
  }

  paperMetricFilterStore.set(metric);
  paperCategoryFilterStore.set(category);
  paperPhaseFilterStore.set(targetPhase || 'all');
  paperCurrentPhaseToggleStore.set(targetPhase === activePhase);

  // Redireciona diretamente para a visão de fases e abre a gaveta de artigos da fase
  setActiveView('phases');
  if (targetPhase) {
    expandedCompletedPhaseStore.set(targetPhase);
  }
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

export function openArticleTutorial({ mandatory = false } = {}) {
  articleTutorialRequiredStore.set(Boolean(mandatory));
  articleTutorialOpenStore.set(true);
}

export async function closeArticleTutorial({ markComplete = false } = {}) {
  articleTutorialOpenStore.set(false);
  articleTutorialRequiredStore.set(false);
  const project = get(projectStore);
  if (markComplete && project?.id) {
    setTutorialStage('complete', project.id);
    await loadDashboardState();
  }
}

export function completeCategoryTutorialStep() {
  const project = get(projectStore);
  if (project?.id) {
    setTutorialStage('articles-open', project.id);
  }
  categoryCreationRequiredStore.set(false);
  isCategoryPanelOpenStore.set(false);
  editingCategoryStore.set(null);
  setActiveView('phases');
  openArticleTutorial({ mandatory: true });
}

export function closePaperBulkCategoryModal() {
  isBulkCategoryModalOpenStore.set(false);
  bulkCategoryModalStore.set(null);
}

export function requestPaperBulkOutcomeAction(outcome, targetPhaseLabel = null) {
  const normalizedOutcome = normalizeCategoryMetricType(outcome, "pending");
  const selectedIds = get(selectedPaperIdsStore);
  if (!selectedIds.size) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  const project = get(projectStore);
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const targetPhase = targetPhaseLabel
    ? (phases.find(p => p.label === targetPhaseLabel) || null)
    : (phases.find(p => p.label === project.activePhaseLabel && !p.completed) || phases.find(p => !p.completed) || null);

  if (!targetPhase) {
    alert("Crie uma fase antes de classificar artigos.");
    return;
  }
  if (isPhaseCompleted(targetPhase)) {
    alert("A fase está concluída. Reabra a fase em 'Editar' antes de alterar a triagem.");
    return;
  }

  const allowedLabels = new Set(Array.isArray(targetPhase.categories) ? targetPhase.categories : []);
  const matchingCategories = (Array.isArray(project.categories) ? project.categories : [])
    .filter(cat => allowedLabels.has(cat.label))
    .filter(cat => normalizeCategoryMetricType(cat.metricType, inferMetricTypeFromCategory(cat)) === normalizedOutcome);

  const copy = PAPER_BULK_ACTION_COPY[normalizedOutcome] || PAPER_BULK_ACTION_COPY.pending;
  if (!matchingCategories.length) {
    alert(`A fase “${targetPhase.title || targetPhase.label}” não possui uma categoria vinculada a “${copy.result}”. Edite a fase e adicione pelo menos uma categoria com esse impacto antes de classificar.`);
    return;
  }

  if (matchingCategories.length === 1) {
    applyPaperBulkCategoryAction(matchingCategories[0], normalizedOutcome, targetPhase.label);
    return;
  }

  bulkCategoryModalStore.set({
    outcome: normalizedOutcome,
    categories: matchingCategories,
    selectedCount: selectedIds.size,
    targetPhaseLabel: targetPhase.label
  });
  isBulkCategoryModalOpenStore.set(true);
}

export async function applyPaperBulkCategoryAction(category, requestedOutcome, targetPhaseLabel = null) {
  const project = get(projectStore);
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const targetPhase = targetPhaseLabel
    ? (phases.find(p => p.label === targetPhaseLabel) || null)
    : (phases.find(p => p.label === project.activePhaseLabel && !p.completed) || phases.find(p => !p.completed) || null);

  if (!targetPhase || isPhaseCompleted(targetPhase)) {
    alert("A fase não está disponível para classificação.");
    return;
  }

  const selectedIds = get(selectedPaperIdsStore);
  const papers = get(papersStore);
  const selectedPapers = papers.filter(p => selectedIds.has(String(p.id)));

  if (!selectedPapers.length) {
    alert("Selecione pelo menos 1 artigo.");
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
        targetPhase.label,
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
      if (canonicalUrl && targetPhase.label === project.activePhaseLabel) {
        for (const storedUrl of Object.keys(highlightedLinks)) {
          if (normalizeUrl(storedUrl) === canonicalUrl) delete highlightedLinks[storedUrl];
        }
        highlightedLinks[nextPaper.url] = normalizeHexColor(category.color, category.color || "");
      }
    }

    if (!changedPapers.length) {
      throw new Error("Nenhum dos artigos selecionados pôde ser reclassificado.");
    }

    const saveResults = await Promise.all(
      changedPapers.map(paper => storage.savePaper(paper))
    );
    const failedSave = saveResults.find(result => result?.status === "error");
    if (failedSave) {
      throw new Error(failedSave.message || "Não foi possível salvar um dos artigos.");
    }

    if (targetPhase.label === project.activePhaseLabel) {
      const scopedProject = data?.svat_project && typeof data.svat_project === "object"
        ? { ...data.svat_project }
        : {
            id: project.id,
            title: project.name || project.title || "Projeto",
            createdAt: project.createdAt || classifiedAt,
          };
      scopedProject.activePhaseLabel = targetPhase.label;
      scopedProject.currentIterationId = targetPhase.label;

      await storage.set({
        highlightedLinks,
        svat_papers: scopedPapers,
        svat_project: scopedProject,
      });

      await updateScholarContextMenu();
    }

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

export async function bulkDeleteMarkedSelectedAction(targetPhaseLabel = null) {
  const selectedIds = get(selectedPaperIdsStore);
  if (!selectedIds.size) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }

  const project = get(projectStore);
  const targetLabel = targetPhaseLabel || project?.activePhaseLabel;
  if (!targetLabel) {
    alert("Nenhuma fase disponível.");
    return;
  }
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const targetPhase = phases.find(p => p.label === targetLabel) || { label: targetLabel, title: targetLabel };

  if (!confirm(`Retirar ${selectedIds.size} artigo(s) selecionado(s) da fase “${targetPhase.title || targetPhase.label}”? Essa ação remove a marcação desta fase.`)) return;

  const papers = get(papersStore);
  const selectedPapers = papers.filter(p => selectedIds.has(String(p.id)));
  const selectedUrls = new Set(
    selectedPapers.map(p => p.url).filter(Boolean).map(normalizeUrl)
  );

  setBulkStatus(`Retirando marcações da fase “${targetPhase.title || targetPhase.label}”…`, "loading", false);

  try {
    if (targetLabel === project.activePhaseLabel) {
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
    }

    for (const paper of selectedPapers) {
      const nextPaper = removePaperClassificationFromActivePhase(
        paper,
        targetLabel,
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
      `${selectedPapers.length} artigo${selectedPapers.length === 1 ? " foi retirado" : "s foram retirados"} da fase “${targetPhase.title || targetPhase.label}”.`,
      "success"
    );
  } catch (error) {
    console.warn("bulkDeleteMarkedSelectedAction failed", error);
    const message = error?.message || "Não foi possível remover os artigos da fase.";
    setBulkStatus(message, "error");
    alert(message);
  }
}

export function classifySinglePaperAction(paper, outcome, targetPhaseLabel = null) {
  if (!paper || (!paper.id && paper.id !== 0)) return;
  selectedPaperIdsStore.set(new Set([String(paper.id)]));
  requestPaperBulkOutcomeAction(outcome, targetPhaseLabel);
}

export async function unmarkSinglePaperAction(paper, targetPhaseLabel = null) {
  if (!paper || (!paper.id && paper.id !== 0)) return;
  selectedPaperIdsStore.set(new Set([String(paper.id)]));
  await bulkDeleteMarkedSelectedAction(targetPhaseLabel);
}

export function dismissIntroModal() {
  const project = get(projectStore);
  if (project?.id) {
    markDashboardIntroSeen(project.id);
    setTutorialStage('phase-required', project.id);
  }
  dashboardIntroRequiredStore.set(false);
  const phaseReq = get(phaseCreationRequiredStore);
  if (phaseReq) {
    setActiveView('phases');
    openPhasePanel(null);
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

  // Assegura que as categorias padrão da pesquisa estejam sempre ativadas por padrão na fase
  const defaultLabels = (project.categories || [])
    .filter(c => isDefaultCategory(c.label) || ['included', 'excluded', 'pending'].includes(normalizeCategoryMetricType(c.metricType, inferMetricTypeFromCategory(c))))
    .map(c => c.label);

  const mergedCategories = [...new Set([...defaultLabels, ...(phasePayload.categories || [])])];
  const payloadWithDefaults = {
    ...phasePayload,
    categories: mergedCategories
  };

  if (phaseEditingLabel) {
    await storage.updatePhase(project.id, phaseEditingLabel, payloadWithDefaults);
  } else {
    await storage.savePhase(project.id, payloadWithDefaults);
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

export const categoryMigrationModalStore = writable({
  isOpen: false,
  categoryToDelete: null,
  linkedPapers: [],
  targetCategoryLabel: null
});

export function closeCategoryMigrationModal() {
  categoryMigrationModalStore.set({
    isOpen: false,
    categoryToDelete: null,
    linkedPapers: [],
    targetCategoryLabel: null
  });
}

export async function requestCategoryDeletionAction(category) {
  const rawProject = get(projectStore);
  if (!rawProject?.id) throw new Error("Nenhum projeto ativo.");
  if (!category || !category.label) return;

  const categoryLabel = category.label;
  if (isDefaultCategory(categoryLabel)) {
    alert("As categorias padrão (Incluir, Excluir, Pendente) não podem ser excluídas.");
    return;
  }

  const deletionBlockReason = getCategoryDeletionBlockReason(rawProject, categoryLabel);
  if (deletionBlockReason) {
    alert(deletionBlockReason);
    return;
  }

  const allPapers = get(papersStore);
  const linkedPapers = getPapersForCategory(allPapers, categoryLabel);

  if (linkedPapers.length > 0) {
    categoryMigrationModalStore.set({
      isOpen: true,
      categoryToDelete: category,
      linkedPapers,
      targetCategoryLabel: null
    });
    closeCategoryPanel();
    return;
  }

  if (!confirm(`Excluir a categoria "${category.title || category.label}"?`)) return;

  await deleteCategoryAction(categoryLabel);
  closeCategoryPanel();
}

export async function migrateAndFinalizeCategoryDeletionAction(sourceLabel, targetLabel) {
  const rawProject = get(projectStore);
  if (!rawProject?.id) throw new Error("Nenhum projeto ativo.");

  const targetCategory = (rawProject.categories || []).find(c => c.label === targetLabel);
  if (!targetCategory) throw new Error("Selecione uma categoria de destino válida para a migração.");

  const allPapers = get(papersStore);
  const affectedPapers = getPapersForCategory(allPapers, sourceLabel);
  const targetMetricType = normalizeCategoryMetricType(targetCategory.metricType, inferMetricTypeFromCategory(targetCategory));
  const targetColor = normalizeHexColor(targetCategory.color, targetCategory.color || "");

  let rawContext = {};
  try {
    rawContext = await storage.get(["highlightedLinks", "svat_papers"]);
  } catch {}
  const highlightedLinks = rawContext?.highlightedLinks && typeof rawContext.highlightedLinks === "object"
    ? { ...rawContext.highlightedLinks }
    : {};
  let scopedPapers = Array.isArray(rawContext?.svat_papers) ? [...rawContext.svat_papers] : [];

  for (const paper of affectedPapers) {
    const nextPaper = { ...paper };
    const prevClassifications = nextPaper.classifications && typeof nextPaper.classifications === "object" && !Array.isArray(nextPaper.classifications)
      ? { ...nextPaper.classifications }
      : {};

    let classificationChanged = false;
    for (const [phaseKey, classif] of Object.entries(prevClassifications)) {
      if (classif && String(classif.categoryLabel || "").trim().toLowerCase() === String(sourceLabel).trim().toLowerCase()) {
        prevClassifications[phaseKey] = {
          ...classif,
          categoryLabel: targetCategory.label,
          outcome: targetMetricType,
          classifiedAt: new Date().toISOString()
        };
        classificationChanged = true;
      }
    }
    if (classificationChanged) {
      nextPaper.classifications = prevClassifications;
    }

    if (String(nextPaper.categoryLabel || "").trim().toLowerCase() === String(sourceLabel).trim().toLowerCase()) {
      nextPaper.categoryLabel = targetCategory.label;
      nextPaper.status = targetMetricType;
      nextPaper.highlightedColor = targetColor;
    }

    if (Array.isArray(nextPaper.tags)) {
      nextPaper.tags = nextPaper.tags.map(t => (
        String(t).trim().toLowerCase() === String(sourceLabel).trim().toLowerCase() ? targetCategory.label : t
      ));
      nextPaper.tags = [...new Set(nextPaper.tags)];
    }

    const history = Array.isArray(nextPaper.history) ? [...nextPaper.history] : [];
    history.push({
      ts: new Date().toISOString(),
      action: "migrate_category",
      details: {
        fromCategory: sourceLabel,
        toCategory: targetCategory.label,
        metricType: targetMetricType,
        source: "category_deletion_migration"
      }
    });
    nextPaper.history = history;
    nextPaper.updatedAt = new Date().toISOString();

    await storage.savePaper(nextPaper);

    const scopedIdx = scopedPapers.findIndex(p => p.id === nextPaper.id || p.url === nextPaper.url);
    if (scopedIdx >= 0) scopedPapers[scopedIdx] = nextPaper;

    if (nextPaper.url) {
      highlightedLinks[nextPaper.url] = targetColor;
    }
  }

  try {
    await storage.set({ highlightedLinks, svat_papers: scopedPapers });
  } catch (err) {
    console.warn("Erro ao salvar highlightedLinks no storage:", err);
  }

  const projectInstance = rawProject instanceof Project ? rawProject : Project.fromJSON(rawProject);
  projectInstance.removeCategory(sourceLabel);

  await storage.saveProject(projectInstance);
  await updateScholarContextMenu();
  closeCategoryMigrationModal();
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


