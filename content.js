function applyHighlights() {
  const run = async () => {
    try {
      const stored = await chrome.storage.local.get(["highlightedLinks", "active"]);
      const storageActive = stored.active !== false;

      let configHighlights = {};
      let configActive = true;

      try {
        const response = await chrome.runtime.sendMessage({ action: "getConfigHighlights" });
        if (response?.ok) {
          configHighlights = response.highlightedLinks || {};
          configActive = response.active !== false;
        }
      } catch (error) {
        console.warn("iCipo: não foi possível carregar os highlights do background", error);
      }

      const mergedHighlights = {
        ...(configHighlights || {}),
        ...((stored.highlightedLinks && typeof stored.highlightedLinks === "object") ? stored.highlightedLinks : {})
      };

      const isActive = storageActive && configActive;
      if (!isActive || !mergedHighlights || Object.keys(mergedHighlights).length === 0) {
        return;
      }

      for (const linkUrl of Object.keys(mergedHighlights)) {
        document.querySelectorAll(`a[href^="${linkUrl}"]`).forEach((link) => {
          link.style.backgroundColor = mergedHighlights[linkUrl];
        });
      }

      if (Object.keys(configHighlights).length > 0) {
        chrome.storage.local.set({ highlightedLinks: mergedHighlights, active: configActive }).catch(() => {});
      }
    } catch (error) {
      console.warn("iCipo: erro ao aplicar highlights", error);
    }
  };

  run();
}

let highlightObserver = null;
function watchForChanges() {
  if (highlightObserver || typeof MutationObserver === "undefined") return;

  highlightObserver = new MutationObserver(() => {
    applyHighlights();
  });

  highlightObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });
}

  document.addEventListener("DOMContentLoaded", () => {
    applyHighlights();
    watchForChanges();
  });
  window.addEventListener("load", () => {
    applyHighlights();
    watchForChanges();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.highlightedLinks || changes.active)) {
      applyHighlights();
    }
  });

// Extract best-effort metadata for a given linkUrl on the current page.
// This focuses on Google Scholar's common DOM structure, but degrades gracefully.
function extractMetadataForLink(linkUrl) {
  const anchors = Array.from(document.querySelectorAll('a'))
    .filter(a => a.href && a.href.startsWith(linkUrl));
  const a = anchors[0];
  if (!a) {
    return { title: linkUrl, authorsRaw: "", year: null };
  }

  // Try Scholar result container
  const container = a.closest('.gs_r') || a.closest('.gs_ri') || a.closest('div');
  let title = "";
  let authorsRaw = "";
  let year = null;

  // Scholar title is often within .gs_rt
  const tEl = container?.querySelector?.('.gs_rt') || a;
  title = (tEl?.innerText || a.textContent || linkUrl).trim();

  const aEl = container?.querySelector?.('.gs_a');
  if (aEl) authorsRaw = (aEl.innerText || "").trim();

  // crude year parse: first 4-digit year
  const m = (authorsRaw || container?.innerText || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (m) year = Number(m[1]);

  return { title, authorsRaw, year };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SVAT_EXTRACT_METADATA' && msg.linkUrl) {
    try {
      const meta = extractMetadataForLink(msg.linkUrl);
      sendResponse({ ok: true, meta });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
});
  