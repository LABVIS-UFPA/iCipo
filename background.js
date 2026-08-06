import {hashId, inferFromCategory, normalizeMetricType} from './core/utils.mjs';
import {storage} from './infrastructure/storage.mjs';
import { wsManager } from './infrastructure/socketManager.mjs';

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
      for (const cat of project.categories) {
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
  await createContextMenu();
});

// Try connect on startup once if configured
chrome.runtime.onStartup.addListener(async () => {
  wsManager.tryAutoConnect();
});

// Abre o dashboard diretamente ao clicar no ícone da extensão.
// O popup foi removido do manifest para que o evento onClicked seja disparado.
chrome.action.onClicked.addListener(() => {
  const dashboardUrl = chrome.runtime.getURL("ui/dashboard/dashboard.html");
  chrome.tabs.create({ url: dashboardUrl });
});

// Allow options page to trigger menu rebuild.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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


async function getHighlightsSnapshotFromWs() {
  try {
    const data = await storage.getAllHighlightedLinksForActiveProject();
    return {
      highlightedLinks: data?.highlightedLinks || {},
      active: true
    };
  } catch (error) {
    console.warn('iCipo: falha ao buscar highlights via WebSocket.', error);
    return { highlightedLinks: {}, active: false, error: error?.message || String(error) };
  }
}

async function broadcastHighlightsRefresh() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((targetTab) => {
    if (!targetTab?.id) return Promise.resolve();
    return chrome.tabs.sendMessage(targetTab.id, { action: 'refreshHighlights' }).catch(() => undefined);
  }));
}





chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId.startsWith("highlight_")) {
    const category_label = info.menuItemId.replace("highlight_", "");
    const data = await storage.get(["highlightedLinks", "svat_project", "svat_papers"]);
    
    // Busca a categoria completa no projeto ativo. A cor continua sendo usada
    // apenas para o destaque visual; o metricType define a métrica do artigo.
    let color = "yellow";
    let activeProject = null;
    let selectedCategory = null;
    try {
      const projectResult = await storage.getActiveProject();
      if (projectResult && projectResult.data) {
        activeProject = projectResult.data;
      } else if (projectResult && projectResult.id) {
        activeProject = projectResult;
      }
      
      if (activeProject && Array.isArray(activeProject.categories)) {
        selectedCategory = activeProject.categories.find(c => c.label === category_label) || null;
        if (selectedCategory?.color) {
          color = selectedCategory.color;
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar os dados da categoria:', e);
    }
    let highlightedLinks = data.highlightedLinks || {};
    let url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");
    highlightedLinks[url] = color;
    await storage.set({ highlightedLinks });

    // Highlight visually
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: highlightLink,
      args: [url, color]
    });

    //TODO: Refatorar toda essa lógica depois. Pois foi feito com IA temos que validar todo o código abaixo.
    // Save SVAT paper (best-effort metadata extraction)
    const project = data.svat_project || {
      id: activeProject?.id || "tcc-001",
      title: activeProject?.name || activeProject?.title || "Meu TCC",
      researcher: "",
      createdAt: nowIso(),
      currentIterationId: activeProject?.activePhaseLabel || "I1"
    };
    const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
    const id = hashId(url);
    const inferred = inferFromCategory(selectedCategory || category_label);
    const status = normalizeMetricType(selectedCategory?.metricType, inferred.status);
    const origin = inferred.origin;
    const phaseLabel = activeProject?.activePhaseLabel
      || project.activePhaseLabel
      || project.currentIterationId
      || "_sem_fase";

    let meta = { title: url, authorsRaw: "", year: null };
    try {
      if (tab?.id) {
        meta = await chrome.tabs.sendMessage(tab.id, { type: "SVAT_EXTRACT_METADATA", linkUrl: url }).then(r => (r && r.ok ? r.meta : meta)).catch(() => meta);
      }
    } catch {}

    const idx = papers.findIndex(p => p.id === id);
    const scopedPaper = idx >= 0 ? papers[idx] : {};
    let persistedPaper = {};
    try {
      const loadedPaper = await storage.loadPaper(id);
      persistedPaper = loadedPaper && typeof loadedPaper.toJSON === "function"
        ? loadedPaper.toJSON()
        : (loadedPaper || {});
    } catch (error) {
      // O registro individual pode ainda não existir em projetos antigos.
      persistedPaper = {};
    }

    const persistedClassifications = persistedPaper.classifications
      && typeof persistedPaper.classifications === "object"
      && !Array.isArray(persistedPaper.classifications)
      ? persistedPaper.classifications
      : {};
    const scopedClassifications = scopedPaper.classifications
      && typeof scopedPaper.classifications === "object"
      && !Array.isArray(scopedPaper.classifications)
      ? scopedPaper.classifications
      : {};
    const previousPaper = {
      ...persistedPaper,
      ...scopedPaper,
      classifications: {
        ...persistedClassifications,
        ...scopedClassifications,
      },
    };
    const prev = previousPaper.status || "new";
    const previousClassifications = previousPaper.classifications;
    const classifiedAt = nowIso();
    const classifications = {
      ...previousClassifications,
      [phaseLabel]: {
        ...(previousClassifications[phaseLabel] || {}),
        phaseLabel,
        categoryLabel: category_label,
        outcome: status,
        classifiedAt,
      },
    };
    const projectCategoryLabels = new Set(
      Array.isArray(activeProject?.categories)
        ? activeProject.categories.map(category => category?.label).filter(Boolean)
        : []
    );
    const tags = [
      ...new Set([
        ...((Array.isArray(previousPaper.tags) ? previousPaper.tags : [])
          .filter(tag => !projectCategoryLabels.has(tag))),
        category_label,
      ])
    ];
    const base = {
      id,
      url,
      title: meta.title && meta.title !== url ? meta.title : (previousPaper.title || url),
      authors: Array.isArray(previousPaper.authors) ? previousPaper.authors : [],
      authorsRaw: meta.authorsRaw || previousPaper.authorsRaw || "",
      year: meta.year || previousPaper.year || null,
      origin,
      status,
      categoryLabel: category_label,
      phaseLabel,
      classifications,
      duplicateOfId: status === "duplicate" ? (previousPaper.duplicateOfId || null) : null,
      iterationId: phaseLabel,
      criteriaId: previousPaper.criteriaId || null,
      tags,
      visited: true,
      updatedAt: classifiedAt,
    };
    const history = Array.isArray(previousPaper.history) ? [...previousPaper.history] : [];
    history.push({
      ts: classifiedAt,
      action: "mark",
      details: {
        category: category_label,
        metricType: status,
        phaseLabel,
        origin,
        status,
        prevStatus: prev,
      }
    });

    const nextPaper = {
      ...previousPaper,
      ...base,
      createdAt: previousPaper.createdAt || classifiedAt,
      history,
    };

    if (idx >= 0) papers[idx] = nextPaper;
    else papers.push(nextPaper);

    await storage.set({ svat_project: project, svat_papers: papers });
    try {
      // Mantém um registro consolidado do artigo para preservar classificações
      // de fases anteriores e alimentar corretamente a Visão Geral do projeto.
      await storage.savePaper(nextPaper);
    } catch (error) {
      console.warn('iCipo: não foi possível salvar o registro consolidado do artigo.', error);
    }
    await broadcastHighlightsRefresh();
  
  
  } else if (info.menuItemId === "removeHighlight") {
    const data = await storage.get(["highlightedLinks", "svat_papers"]);
    let highlightedLinks = data.highlightedLinks || {};
    const url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");
    delete highlightedLinks[info.linkUrl];
    delete highlightedLinks[url];
    await storage.set({ highlightedLinks });

    // Keep the paper in SVAT (audit trail), but set visited=false
    const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
    const id = hashId(url);
    const idx = papers.findIndex(p => p.id === id);
    if (idx >= 0) {
      const history = Array.isArray(papers[idx].history) ? papers[idx].history : [];
      history.push({ ts: nowIso(), action: "unmark", details: { visited: false } });
      papers[idx] = { ...papers[idx], visited: false, updatedAt: nowIso(), history };
      await storage.set({ svat_papers: papers });
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: removeHighlight,
      args: [url]
    });
  
  
  } else if (info.menuItemId === "activateProjectFromMenu") {
    // Abre a página ui/projects.html para ativar um projeto, já que não foi possível carregar projetos ativos para o menu
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/projects.html") });
  }
});

function highlightLink(linkUrl, color) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = color;
  });
}

function removeHighlight(linkUrl) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = "";
  });
}
