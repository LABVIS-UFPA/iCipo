import {
  hashId,
  inferFromCategory,
  normalizeArticleUrl,
  normalizeCategoryMetricType,
  normalizeMetricType,
} from './core/utils.mjs';
import {storage} from './infrastructure/storage.mjs';
import { wsManager } from './infrastructure/socketManager.mjs';

const EXTENSION_ACTIVE_KEY = 'active';

function getChromeLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('iCipo: falha ao ler o estado da extensão.', chrome.runtime.lastError.message);
        resolve({});
        return;
      }
      resolve(result || {});
    });
  });
}

function setChromeLocal(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function getExtensionActive() {
  const data = await getChromeLocal([EXTENSION_ACTIVE_KEY]);
  // Compatibilidade com instalações anteriores: ausência do campo significa
  // extensão ligada. Somente o valor booleano false a desativa.
  return data[EXTENSION_ACTIVE_KEY] !== false;
}

async function ensureExtensionActiveSetting() {
  const data = await getChromeLocal([EXTENSION_ACTIVE_KEY]);
  if (typeof data[EXTENSION_ACTIVE_KEY] === 'boolean') {
    return data[EXTENSION_ACTIVE_KEY];
  }

  await setChromeLocal({ [EXTENSION_ACTIVE_KEY]: true });
  return true;
}

async function applyExtensionActiveState(active) {
  const nextActive = active !== false;
  await setChromeLocal({ [EXTENSION_ACTIVE_KEY]: nextActive });
  await createContextMenu();
  await broadcastHighlightsRefresh();
  return nextActive;
}

// Adiciona um listener para sincronizar os dados sempre que a conexão com o servidor for (re)estabelecida.
// Isso garante que, ao iniciar o navegador ou reconectar, os links marcados sejam atualizados.
wsManager.addOnOpenListener(async () => {
  console.log('iCipo: Conexão estabelecida, atualizando highlights via WebSocket...');
  try {
    await broadcastHighlightsRefresh(); 
    console.log('iCipo: Sincronização de links concluída.');
  } catch (error) {
    console.warn('iCipo: Falha ao sincronizar links após a conexão.', error);
  }
});

// const DEFAULT_SNOWBALLING_CATEGORIES = {
//   "Seed": "#4CAF50",
//   "Backward": "#2196F3",
//   "Forward": "#9C27B0",
//   "Included": "#2E7D32",
//   "Excluded": "#D32F2F",
//   "Duplicate": "#757575",
//   "Pending": "#FBC02D",
// };

async function createContextMenu() {
  // Remove existing menus and recreate safely (ignore duplicate-id race warnings)
  await new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        console.warn('contextMenus.removeAll error', chrome.runtime.lastError);
      }
      resolve();
    });
  });

  // Ao desligar a extensão, todos os comandos de marcação são removidos.
  // O dashboard e as configurações continuam acessíveis para permitir a
  // reativação sem depender da página chrome://extensions.
  if (!(await getExtensionActive())) return;

  const safeCreate = (opts) => {
    return new Promise((resolve) => {
      try {
        chrome.contextMenus.create(opts, () => {
          if (chrome.runtime.lastError) {
            const msg = String(chrome.runtime.lastError.message || "").toLowerCase();
            if (msg.includes('duplicate id') || msg.includes('cannot create item with duplicate id')) {
              // ignore duplicate menu creation race
              resolve();
              return;
            }
            console.error('contextMenus.create error', chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (e) {
        console.warn('safeCreate failed', e);
        resolve();
      }
    });
  };

  await safeCreate({ id: "highlightLink", title: "Marcar link", contexts: ["link"] });

  try {
    const projectResult = await storage.getActiveProject();
    let project = null;
    if (projectResult && projectResult.data) {
      project = projectResult.data;
    } else if (projectResult && projectResult.id) {
      project = projectResult;
    }
    
    if (project && Array.isArray(project.categories)) {
      const phases = Array.isArray(project.phases) ? project.phases : [];
      const activePhase = phases.find(phase => phase?.label === project.activePhaseLabel && !phase?.completed)
        || phases.find(phase => !phase?.completed)
        || null;
      const activeCategoryLabels = new Set(
        Array.isArray(activePhase?.categories) ? activePhase.categories : []
      );
      const activeCategories = project.categories.filter(category => activeCategoryLabels.has(category?.label));

      if (!activePhase) {
        await safeCreate({
          parentId: "highlightLink",
          id: "noActivePhase",
          title: "Crie uma fase antes de marcar artigos",
          contexts: ["link"],
          enabled: false,
        });
      } else if (activePhase.completed) {
        await safeCreate({
          parentId: "highlightLink",
          id: "completedActivePhase",
          title: "Fase concluída — crie a próxima fase",
          contexts: ["link"],
          enabled: false,
        });
      } else if (!activeCategories.length) {
        await safeCreate({
          parentId: "highlightLink",
          id: "noActiveCategory",
          title: "Selecione ao menos uma categoria na fase ativa",
          contexts: ["link"],
          enabled: false,
        });
      }

      for (const cat of activeCategories) {
        const title = cat.title ||'Categoria';
        await safeCreate({ parentId: "highlightLink", id: `highlight_${cat.label}`, title: title, contexts: ["link"] });
      }
    }else{
      // fallback default categories if project or categories not found
      await safeCreate({
        parentId: "highlightLink",
        id: "activateProjectFromMenu",
        title: "Nenhum projeto ativo - Ativar projeto",
        contexts: ["link"]
      });
    }
  } catch (e) {
    console.warn('Erro ao carregar categorias para o menu:', e);
  }

  await safeCreate({ id: "removeHighlight", title: "Remover marcação", contexts: ["link"] });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureExtensionActiveSetting();
  await createContextMenu();
});

// Try connect on startup once if configured
chrome.runtime.onStartup.addListener(async () => {
  const active = await ensureExtensionActiveSetting();
  await createContextMenu();
  if (active) wsManager.tryAutoConnect();
  await broadcastHighlightsRefresh();
});

// Abre o dashboard diretamente ao clicar no ícone da extensão.
// O popup foi removido do manifest para que o evento onClicked seja disparado.
chrome.action.onClicked.addListener(() => {
  const dashboardUrl = chrome.runtime.getURL("ui/dashboard/dashboard.html");
  chrome.tabs.create({ url: dashboardUrl });
});

// Allow options page to trigger menu rebuild.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.action === 'getExtensionState') {
    getExtensionActive()
      .then((active) => sendResponse({ ok: true, active }))
      .catch((error) => sendResponse({ ok: false, active: true, message: error?.message || String(error) }));
    return true;
  }
  if (msg && msg.action === 'setExtensionActive') {
    applyExtensionActiveState(msg.active)
      .then((active) => sendResponse({ ok: true, active }))
      .catch((error) => {
        console.warn('iCipo: falha ao alterar o estado da extensão.', error);
        sendResponse({ ok: false, message: error?.message || String(error) });
      });
    return true;
  }
  if (msg && msg.action === 'getHighlightsFromWs') {
    getHighlightsSnapshotFromWs().then(sendResponse);
    return true;
  }
  if (msg && msg.action === 'refreshScholarHighlights') {
    broadcastHighlightsRefresh().then(() => sendResponse({ status: 'ok' }));
    return true;
  }
  if (msg && msg.action === "updateContextMenu") {
    (async () => {
      try {
        await createContextMenu();
        sendResponse({ status: "ok" });
      } catch (error) {
        console.warn("Falha ao atualizar menu de contexto:", error);
        sendResponse({ status: "error", message: error?.message || String(error) });
      }
    })();
    return true;
  }
  if (msg && msg.action === "seedDefaultCategories") {
    (async () => {
      try {
        await createContextMenu();
        sendResponse({ status: "ok" });
      } catch (error) {
        sendResponse({ status: "error", message: error?.message || String(error) });
      }
    })();
    return true;
  }
  // Socket control messages from options page
  if (msg && msg.action === "socket_get_state") {
    // Reply with the real socket state and stored server info/messages
    chrome.storage.local.get(["server_url", "server_port", "server_messages"], (res) => {
      let status = "Desconectado";
      try {
        const s = wsManager.socket;
        if (s) {
          switch (s.readyState) {
            case WebSocket.CONNECTING: status = "Conectando..."; break;
            case WebSocket.OPEN: status = "Conectado"; break;
            case WebSocket.CLOSING: status = "Fechando"; break;
            case WebSocket.CLOSED: status = "Desconectado"; break;
            default: status = "Desconectado";
          }
        }
      } catch (e) {
        status = "Desconectado";
      }

      const messages = Array.isArray(res.server_messages) ? res.server_messages : [];
      const url = res.server_url || '';
      const port = res.server_port || '';
      sendResponse && sendResponse({ ok: true, url, port, status, messages });
    });
    return true; // async response
  }

  if (msg && msg.action === "socket_connect") {
    const url = msg.url;
    const port = msg.port;
    if (url) {
      chrome.storage.local.set({ server_url: url, server_port: port });
    }
    wsManager.connect(url || undefined, port || undefined);
    sendResponse && sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_disconnect") {
    wsManager.disconnect();
    sendResponse && sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_send") {
    try {
      const ok = wsManager.send(msg.data);
      if (ok) {
        sendResponse && sendResponse({ ok: true });
      } else {
        sendResponse && sendResponse({ ok: false, error: 'socket_not_connected' });
      }
    } catch (e) {
      sendResponse && sendResponse({ ok: false, error: e?.message || e });
    }
    return true;
  }
});


function nowIso() {
  return new Date().toISOString();
}

function getPaperClassifications(paper) {
  return paper?.classifications
    && typeof paper.classifications === 'object'
    && !Array.isArray(paper.classifications)
    ? { ...paper.classifications }
    : {};
}

function getLatestPaperClassification(classifications, project = null) {
  const entries = Object.entries(classifications || {})
    .filter(([, classification]) => classification && typeof classification === 'object');
  if (!entries.length) return null;

  const phaseLabels = Array.isArray(project?.phases)
    ? project.phases.map(phase => phase?.label).filter(Boolean)
    : [];
  for (let index = phaseLabels.length - 1; index >= 0; index -= 1) {
    const phaseLabel = phaseLabels[index];
    if (classifications[phaseLabel]) {
      return [phaseLabel, classifications[phaseLabel]];
    }
  }

  return entries.sort(([, first], [, second]) => (
    String(second?.classifiedAt || '').localeCompare(String(first?.classifiedAt || ''))
  ))[0];
}

function removePaperFromPhase(paper, phaseLabel, project = null) {
  if (!paper || !phaseLabel) return null;

  const classifications = getPaperClassifications(paper);
  delete classifications[phaseLabel];

  const updatedAt = nowIso();
  const history = Array.isArray(paper.history) ? [...paper.history] : [];
  history.push({
    ts: updatedAt,
    action: 'unmark',
    details: { phaseLabel, visited: false },
  });

  const latestEntry = getLatestPaperClassification(classifications, project);
  if (!latestEntry) {
    return {
      ...paper,
      classifications: {},
      phaseLabel: null,
      iterationId: null,
      categoryLabel: null,
      status: paper.autoDuplicate ? 'duplicate' : 'pending',
      duplicateOfId: paper.autoDuplicate ? (paper.duplicateOfId || null) : null,
      inherited: false,
      entryType: 'new',
      inheritedFromPhaseLabel: null,
      visited: false,
      updatedAt,
      history,
    };
  }

  const [latestPhaseLabel, latestClassification] = latestEntry;
  const projectCategoryLabels = new Set(
    Array.isArray(project?.categories)
      ? project.categories.map(category => category?.label).filter(Boolean)
      : []
  );
  const categoryLabel = paper.autoDuplicate
    ? null
    : (latestClassification?.categoryLabel || null);
  const baseTags = Array.isArray(paper.tags)
    ? paper.tags.filter(tag => !projectCategoryLabels.has(tag) && tag !== 'duplicado-automatico')
    : [];
  const tags = paper.autoDuplicate
    ? [...new Set([...baseTags, 'duplicado-automatico'])]
    : [...new Set([...baseTags, ...(categoryLabel ? [categoryLabel] : [])])];

  const status = paper.autoDuplicate
    ? 'duplicate'
    : normalizeMetricType(latestClassification?.outcome, 'pending');

  return {
    ...paper,
    classifications,
    phaseLabel: latestClassification?.phaseLabel || latestPhaseLabel,
    iterationId: latestClassification?.phaseLabel || latestPhaseLabel,
    categoryLabel,
    status,
    duplicateOfId: paper.autoDuplicate ? (paper.duplicateOfId || null) : null,
    inherited: latestClassification?.inherited === true
      || String(latestClassification?.entryType || '').toLowerCase() === 'inherited',
    entryType: latestClassification?.entryType
      || (latestClassification?.inherited ? 'inherited' : 'new'),
    inheritedFromPhaseLabel: latestClassification?.inheritedFromPhaseLabel || null,
    tags,
    visited: true,
    updatedAt,
    history,
  };
}


async function getHighlightsSnapshotFromWs() {
  const active = await getExtensionActive();
  if (!active) {
    return { highlightedLinks: {}, active: false };
  }

  try {
    const data = await storage.getAllHighlightedLinksForActiveProject();
    return {
      highlightedLinks: data?.highlightedLinks || {},
      active: true
    };
  } catch (error) {
    console.warn('iCipo: falha ao buscar highlights via WebSocket.', error);
    // Falha de conexão não equivale a desligar a extensão.
    return { highlightedLinks: {}, active: true, error: error?.message || String(error) };
  }
}

async function broadcastHighlightsRefresh() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((targetTab) => {
      if (!targetTab?.id) return Promise.resolve();
      return chrome.tabs.sendMessage(targetTab.id, { action: 'refreshHighlights' }).catch(() => undefined);
    }));
  } catch (error) {
    // Páginas internas do navegador ou uma aba sendo fechada não devem fazer
    // a troca de estado da extensão falhar para o usuário.
    console.warn('iCipo: não foi possível atualizar todas as abas abertas.', error);
  }
}





chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!(await getExtensionActive())) return;

  if (info.menuItemId.startsWith("highlight_")) {
    const categoryLabel = info.menuItemId.replace("highlight_", "");

    let activeProject = null;
    try {
      const projectResult = await storage.getActiveProject();
      activeProject = projectResult?.data || projectResult || null;
    } catch (error) {
      console.warn('Erro ao buscar o projeto ativo:', error);
    }

    const phases = Array.isArray(activeProject?.phases) ? activeProject.phases : [];
    const activePhase = phases.find(phase => phase?.label === activeProject?.activePhaseLabel && !phase?.completed)
      || phases.find(phase => !phase?.completed)
      || null;
    const selectedCategory = Array.isArray(activeProject?.categories)
      ? activeProject.categories.find(category => category?.label === categoryLabel) || null
      : null;
    const allowedCategoryLabels = new Set(
      Array.isArray(activePhase?.categories) ? activePhase.categories : []
    );

    if (!activeProject?.id || !activePhase) {
      console.warn('iCipo: não há uma fase ativa para receber o artigo.');
      return;
    }
    if (activePhase.completed) {
      console.warn('iCipo: a fase ativa está concluída. Crie uma nova fase antes de marcar artigos.');
      return;
    }
    if (!selectedCategory || !allowedCategoryLabels.has(categoryLabel)) {
      console.warn('iCipo: a categoria selecionada não está ativa nesta fase.');
      await createContextMenu();
      return;
    }

    const data = await storage.get(["highlightedLinks", "svat_project", "svat_papers"]);
    const color = selectedCategory.color || "yellow";
    const rawUrl = String(info.linkUrl || "").replace(/([?&])casa_token=[^&#]*/gi, "$1").replace(/[?&]+$/g, "");
    const canonicalUrl = normalizeArticleUrl(rawUrl);
    if (!canonicalUrl) return;

    const highlightedLinks = data.highlightedLinks && typeof data.highlightedLinks === 'object'
      ? { ...data.highlightedLinks }
      : {};
    let previousHighlightColor = "";
    for (const existingUrl of Object.keys(highlightedLinks)) {
      if (normalizeArticleUrl(existingUrl) !== canonicalUrl) continue;
      previousHighlightColor = highlightedLinks[existingUrl] || previousHighlightColor;
      if (existingUrl !== rawUrl) delete highlightedLinks[existingUrl];
    }
    highlightedLinks[rawUrl] = color;

    // Highlight visually before metadata extraction so the response is immediate.
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: highlightLink,
        args: [rawUrl, color]
      }).catch(() => undefined);
    }

    const project = data.svat_project || {
      id: activeProject.id,
      title: activeProject.name || activeProject.title || "Meu TCC",
      researcher: "",
      createdAt: nowIso(),
      currentIterationId: activePhase.label,
    };
    project.activePhaseLabel = activePhase.label;
    project.currentIterationId = activePhase.label;

    const papers = Array.isArray(data.svat_papers) ? [...data.svat_papers] : [];
    const originalIndex = papers.findIndex(paper => (
      !paper?.autoDuplicate
      && normalizeArticleUrl(paper?.url) === canonicalUrl
    ));
    const scopedOriginal = originalIndex >= 0 ? papers[originalIndex] : null;
    const categoryChanged = !!scopedOriginal && scopedOriginal.categoryLabel !== categoryLabel;
    const colorChanged = !!scopedOriginal
      && String(previousHighlightColor || "").toLowerCase() !== String(color || "").toLowerCase();
    const repeatedSameClassification = !!scopedOriginal && !categoryChanged && !colorChanged;
    const phaseLabel = activePhase.label;
    const classifiedAt = nowIso();

    let meta = { title: rawUrl, authorsRaw: "", year: null };
    try {
      if (tab?.id) {
        meta = await chrome.tabs.sendMessage(tab.id, {
          type: "SVAT_EXTRACT_METADATA",
          linkUrl: rawUrl,
        }).then(response => (response?.ok ? response.meta : meta)).catch(() => meta);
      }
    } catch (_) { /* metadados são opcionais */ }

    if (repeatedSameClassification) {
      const originalId = scopedOriginal.id || hashId(canonicalUrl);
      const duplicateSequence = papers
        .filter(paper => paper?.autoDuplicate && paper?.duplicateOfId === originalId)
        .reduce((max, paper) => Math.max(max, Number(paper?.duplicateSequence) || 0), 0) + 1;
      // O mesmo artigo pode aparecer novamente em fases diferentes. Inclui a
      // identidade da fase no ID para que uma duplicata da fase atual não
      // sobrescreva o arquivo de uma duplicata registrada em fase anterior.
      const phaseIdentity = hashId(phaseLabel).replace(/^p_/, '');
      const duplicateId = `${originalId}__dup_${phaseIdentity}_${duplicateSequence}`;
      const duplicatePaper = {
        id: duplicateId,
        url: rawUrl,
        title: meta.title && meta.title !== rawUrl ? meta.title : (scopedOriginal.title || rawUrl),
        authors: Array.isArray(scopedOriginal.authors) ? scopedOriginal.authors : [],
        authorsRaw: meta.authorsRaw || scopedOriginal.authorsRaw || "",
        year: meta.year || scopedOriginal.year || null,
        origin: scopedOriginal.origin || inferFromCategory(selectedCategory).origin,
        status: "duplicate",
        categoryLabel: null,
        phaseLabel,
        classifications: {
          [phaseLabel]: {
            phaseLabel,
            categoryLabel: null,
            outcome: "duplicate",
            classifiedAt,
            duplicateOfId: originalId,
            automatic: true,
            inherited: false,
            entryType: 'new',
            inheritedFromPhaseLabel: null,
          },
        },
        duplicateOfId: originalId,
        autoDuplicate: true,
        duplicateSequence,
        iterationId: phaseLabel,
        criteriaId: null,
        tags: ["duplicado-automatico"],
        inherited: false,
        entryType: 'new',
        inheritedFromPhaseLabel: null,
        visited: true,
        createdAt: classifiedAt,
        updatedAt: classifiedAt,
        history: [{
          ts: classifiedAt,
          action: "duplicate_detected",
          details: {
            duplicateOfId: originalId,
            phaseLabel,
            reason: "same_link_same_category",
            url: canonicalUrl,
          },
        }],
      };

      papers.push(duplicatePaper);
      await storage.set({ highlightedLinks, svat_project: project, svat_papers: papers });
      await storage.savePaper(duplicatePaper).catch((error) => {
        console.warn('iCipo: não foi possível salvar a duplicata automática.', error);
      });
      await broadcastHighlightsRefresh();
      return;
    }

    const originalId = scopedOriginal?.id || hashId(canonicalUrl);
    let persistedPaper = {};
    try {
      const loadedPaper = await storage.loadPaper(originalId);
      persistedPaper = loadedPaper && typeof loadedPaper.toJSON === "function"
        ? loadedPaper.toJSON()
        : (loadedPaper || {});
    } catch (_) {
      persistedPaper = {};
    }

    const scopedClassifications = scopedOriginal?.classifications
      && typeof scopedOriginal.classifications === "object"
      && !Array.isArray(scopedOriginal.classifications)
      ? scopedOriginal.classifications
      : {};
    const persistedClassifications = persistedPaper.classifications
      && typeof persistedPaper.classifications === "object"
      && !Array.isArray(persistedPaper.classifications)
      ? persistedPaper.classifications
      : {};
    const previousPaper = {
      ...persistedPaper,
      ...(scopedOriginal || {}),
      classifications: {
        ...persistedClassifications,
        ...scopedClassifications,
      },
    };
    const inferred = inferFromCategory(selectedCategory);
    const status = normalizeCategoryMetricType(selectedCategory.metricType, inferred.status);
    const previousPhaseClassification = previousPaper.classifications?.[phaseLabel]
      && typeof previousPaper.classifications[phaseLabel] === 'object'
      ? previousPaper.classifications[phaseLabel]
      : {};
    const inheritedInCurrentPhase = previousPhaseClassification.inherited === true
      || String(previousPhaseClassification.entryType || '').toLowerCase() === 'inherited'
      || Boolean(previousPhaseClassification.inheritedFromPhaseLabel);
    const entryType = previousPhaseClassification.entryType
      || (inheritedInCurrentPhase ? 'inherited' : 'new');
    const classifications = {
      ...previousPaper.classifications,
      [phaseLabel]: {
        ...previousPhaseClassification,
        phaseLabel,
        categoryLabel,
        outcome: status,
        classifiedAt,
        inherited: inheritedInCurrentPhase,
        entryType,
        inheritedFromPhaseLabel: previousPhaseClassification.inheritedFromPhaseLabel || null,
      },
    };
    const projectCategoryLabels = new Set(
      activeProject.categories.map(category => category?.label).filter(Boolean)
    );
    const tags = [...new Set([
      ...(Array.isArray(previousPaper.tags)
        ? previousPaper.tags.filter(tag => !projectCategoryLabels.has(tag) && tag !== "duplicado-automatico")
        : []),
      categoryLabel,
    ])];
    const history = Array.isArray(previousPaper.history) ? [...previousPaper.history] : [];
    history.push({
      ts: classifiedAt,
      action: scopedOriginal ? "reclassify" : "mark",
      details: {
        category: categoryLabel,
        metricType: status,
        phaseLabel,
        origin: inferred.origin,
        status,
        prevStatus: previousPaper.status || "new",
        categoryChanged,
        colorChanged,
      },
    });

    const nextPaper = {
      ...previousPaper,
      id: originalId,
      url: rawUrl,
      title: meta.title && meta.title !== rawUrl ? meta.title : (previousPaper.title || rawUrl),
      authors: Array.isArray(previousPaper.authors) ? previousPaper.authors : [],
      authorsRaw: meta.authorsRaw || previousPaper.authorsRaw || "",
      year: meta.year || previousPaper.year || null,
      origin: inferred.origin,
      status,
      categoryLabel,
      phaseLabel,
      classifications,
      duplicateOfId: null,
      autoDuplicate: false,
      duplicateSequence: null,
      iterationId: phaseLabel,
      criteriaId: previousPaper.criteriaId || null,
      tags,
      inherited: inheritedInCurrentPhase,
      entryType,
      inheritedFromPhaseLabel: previousPhaseClassification.inheritedFromPhaseLabel || null,
      visited: true,
      createdAt: previousPaper.createdAt || classifiedAt,
      updatedAt: classifiedAt,
      history,
    };

    if (originalIndex >= 0) papers[originalIndex] = nextPaper;
    else papers.push(nextPaper);

    await storage.set({ highlightedLinks, svat_project: project, svat_papers: papers });
    await storage.savePaper(nextPaper).catch((error) => {
      console.warn('iCipo: não foi possível salvar o registro consolidado do artigo.', error);
    });
    await broadcastHighlightsRefresh();

  } else if (info.menuItemId === "removeHighlight") {
    const rawUrl = String(info.linkUrl || "").trim();
    const canonicalUrl = normalizeArticleUrl(rawUrl);
    if (!canonicalUrl) return;

    const [data, activeProjectResult] = await Promise.all([
      storage.get(["highlightedLinks", "svat_papers"]),
      storage.getActiveProject().catch(() => null),
    ]);
    const activeProject = activeProjectResult?.data || activeProjectResult || null;
    const activePhaseLabel = activeProject?.activePhaseLabel
      || activeProject?.phases?.find?.(phase => !phase?.completed)?.label
      || null;
    if (!activePhaseLabel) return;

    const highlightedLinks = data?.highlightedLinks && typeof data.highlightedLinks === 'object'
      ? { ...data.highlightedLinks }
      : {};
    for (const storedUrl of Object.keys(highlightedLinks)) {
      if (normalizeArticleUrl(storedUrl) === canonicalUrl) delete highlightedLinks[storedUrl];
    }

    // A remoção é exclusiva da fase ativa. O artigo consolidado continua
    // existindo caso possua classificação em outra fase, preservando todo o
    // histórico do projeto.
    const scopedPapers = Array.isArray(data?.svat_papers) ? data.svat_papers : [];
    const removedScopedPapers = scopedPapers.filter(
      paper => normalizeArticleUrl(paper?.url) === canonicalUrl
    );
    const remainingScopedPapers = scopedPapers.filter(
      paper => normalizeArticleUrl(paper?.url) !== canonicalUrl
    );

    await storage.set({
      highlightedLinks,
      svat_papers: remainingScopedPapers,
    });

    for (const scopedPaper of removedScopedPapers) {
      const paperId = scopedPaper?.id;
      if (!paperId && paperId !== 0) continue;

      let persistedPaper = {};
      try {
        const loadedPaper = await storage.loadPaper(paperId);
        persistedPaper = loadedPaper && typeof loadedPaper.toJSON === "function"
          ? loadedPaper.toJSON()
          : (loadedPaper || {});
      } catch (_) {
        persistedPaper = {};
      }

      const previousPaper = {
        ...persistedPaper,
        ...scopedPaper,
        classifications: {
          ...getPaperClassifications(persistedPaper),
          ...getPaperClassifications(scopedPaper),
        },
      };
      const nextPaper = removePaperFromPhase(previousPaper, activePhaseLabel, activeProject);

      await storage.savePaper(nextPaper).catch((error) => {
        console.warn('iCipo: não foi possível atualizar o histórico do artigo removido.', error);
      });
    }

    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: removeHighlight,
        args: [rawUrl]
      }).catch(() => undefined);
    }
    await broadcastHighlightsRefresh();
  
  
  } else if (info.menuItemId === "activateProjectFromMenu") {
    // Abre a página ui/projects.html para ativar um projeto, já que não foi possível carregar projetos ativos para o menu
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/projects.html") });
  }
});

function highlightLink(linkUrl, color) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.classList.add('ic-highlighted-link');
    link.style.backgroundColor = color;
  });
}

function removeHighlight(linkUrl) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.classList.remove('ic-highlighted-link');
    link.style.backgroundColor = "";
  });
}
