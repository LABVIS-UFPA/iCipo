import {hashId, inferFromCategory} from './core/utils.mjs';
import {storage} from './infrastructure/storage.mjs';
import { wsManager } from './infrastructure/socketManager.mjs';

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
  chrome.contextMenus.removeAll(async () => {
    const safeCreate = (opts) => {
      try {
        chrome.contextMenus.create(opts, () => {
          if (chrome.runtime.lastError) {
            const msg = String(chrome.runtime.lastError.message || "").toLowerCase();
            if (msg.includes('duplicate id') || msg.includes('cannot create item with duplicate id')) {
              // ignore duplicate menu creation race
              return;
            }
            console.error('contextMenus.create error', chrome.runtime.lastError);
          }
        });
      } catch (e) {
        console.warn('safeCreate failed', e);
      }
    };

    safeCreate({ id: "highlightLink", title: "Marcar link", contexts: ["link"] });

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
          const title = cat.title || cat.label || 'Categoria';
          safeCreate({ parentId: "highlightLink", id: `highlight_${title}`, title: title, contexts: ["link"] });
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar categorias para o menu:', e);
    }

    safeCreate({ id: "removeHighlight", title: "Remover marcação", contexts: ["link"] });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await createContextMenu();
});

// Try connect on startup once if configured
chrome.runtime.onStartup.addListener(() => {
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

// Nota: chrome.storage.onChanged listener removido pois storage.mjs não oferece listener nativo.
// Para sincronizar mudanças de categorias, use storage.set() e atualize o menu manualmente.

function nowIso() {
  return new Date().toISOString();
}





chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId.startsWith("highlight_")) {
    const category = info.menuItemId.replace("highlight_", "");
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
        const cat = project.categories.find(c => c.title === category);
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

    // Save SVAT paper (best-effort metadata extraction)
    const project = data.svat_project || { id: "tcc-001", title: "Meu TCC", researcher: "", createdAt: nowIso(), currentIterationId: "I1" };
    const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
    const id = hashId(url);
    const { origin, status } = inferFromCategory(category);

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
      tags: [category],
      visited: true,
      updatedAt: nowIso(),
    };
    if (idx >= 0) {
      const history = Array.isArray(papers[idx].history) ? papers[idx].history : [];
      history.push({ ts: nowIso(), action: "mark", details: { category, origin, status, prevStatus: prev } });
      papers[idx] = { ...papers[idx], ...base, history };
    } else {
      papers.push({ ...base, createdAt: nowIso(), history: [{ ts: nowIso(), action: "mark", details: { category, origin, status, prevStatus: prev } }] });
    }
    await storage.set({ svat_project: project, svat_papers: papers });
  }

  if (info.menuItemId === "removeHighlight") {
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