import {hashId, inferFromCategory} from './core/utils.mjs';
import {storage} from './infrastructure/storage.mjs';
import { wsManager } from './infrastructure/socketManager.mjs';

// Adiciona um listener para sincronizar os dados sempre que a conexão com o servidor for (re)estabelecida.
// Isso garante que, ao iniciar o navegador ou reconectar, os links marcados sejam atualizados.
wsManager.addOnOpenListener(async () => {
  console.log('iCipo: Conexão estabelecida, sincronizando dados com o chrome.storage...');
  try {
    await storage.syncActiveScopeToChrome(); 
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

// Allow options page to trigger menu rebuild.
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg && msg.action === "updateContextMenu") {
    createContextMenu();
    return;
  }
  if (msg && msg.action === "seedDefaultCategories") {
    (async () => {
      await createContextMenu();
    })();
    return;
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
      _sendResponse && _sendResponse({ ok: true, url, port, status, messages });
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
    _sendResponse && _sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_disconnect") {
    wsManager.disconnect();
    _sendResponse && _sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_send") {
    try {
      const ok = wsManager.send(msg.data);
      if (ok) {
        _sendResponse && _sendResponse({ ok: true });
      } else {
        _sendResponse && _sendResponse({ ok: false, error: 'socket_not_connected' });
      }
    } catch (e) {
      _sendResponse && _sendResponse({ ok: false, error: e?.message || e });
    }
    return true;
  }
});


function nowIso() {
  return new Date().toISOString();
}





chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId.startsWith("highlight_")) {
    const category_label = info.menuItemId.replace("highlight_", "");
    const data = await storage.get(["highlightedLinks", "svat_project", "svat_papers"]);
    
    // Busca a cor da categoria no projeto ativo
    let color = "yellow";
    try {
      const projectResult = await storage.getActiveProject();
      let project = null;
      if (projectResult && projectResult.data) {
        project = projectResult.data;
      } else if (projectResult && projectResult.id) {
        project = projectResult;
      }
      
      if (project && Array.isArray(project.categories)) {
        const cat = project.categories.find(c => c.label === category_label);
        if (cat && cat.color) {
          color = cat.color;
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar cor da categoria:', e);
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
    const project = data.svat_project || { id: "tcc-001", title: "Meu TCC", researcher: "", createdAt: nowIso(), currentIterationId: "I1" };
    const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
    const id = hashId(url);
    const { origin, status } = inferFromCategory(category_label);

    let meta = { title: url, authorsRaw: "", year: null };
    try {
      if (tab?.id) {
        meta = await chrome.tabs.sendMessage(tab.id, { type: "SVAT_EXTRACT_METADATA", linkUrl: url }).then(r => (r && r.ok ? r.meta : meta)).catch(() => meta);
      }
    } catch {}

    const idx = papers.findIndex(p => p.id === id);
    const prev = idx >= 0 ? (papers[idx].status || "pending") : "new";
    const base = {
      id,
      url,
      title: meta.title || url,
      authors: [],
      authorsRaw: meta.authorsRaw || "",
      year: meta.year || null,
      origin,
      status,
      iterationId: project.currentIterationId || "I1",
      criteriaId: null,
      tags: [category_label],
      visited: true,
      updatedAt: nowIso(),
    };
    if (idx >= 0) {
      const history = Array.isArray(papers[idx].history) ? papers[idx].history : [];
      history.push({ ts: nowIso(), action: "mark", details: { category: category_label, origin, status, prevStatus: prev } });
      papers[idx] = { ...papers[idx], ...base, history };
    } else {
      papers.push({ ...base, createdAt: nowIso(), history: [{ ts: nowIso(), action: "mark", details: { category: category_label, origin, status, prevStatus: prev } }] });
    }
    await storage.set({ svat_project: project, svat_papers: papers });
  
  
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
