// Os highlights são obtidos exclusivamente pelo background, que consulta o servidor via WebSocket.
// Não há persistência nem leitura de artigos/highlights em chrome.storage.local.
let currentHighlights = {};
let highlightsEnabled = true;
let refreshPromise = null;
let mutationTimer = null;

/**
 * Mantém a mesma regra de identidade usada pelo servidor para que uma URL
 * continue sendo reconhecida mesmo quando o Scholar/navegador altera a ordem
 * dos parâmetros ou acrescenta identificadores de rastreamento.
 */
function normalizeHighlightUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.href);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();

    const removableParams = new Set([
      'casa_token',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid'
    ]);

    for (const key of [...url.searchParams.keys()]) {
      if (removableParams.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    const sortedParams = [...url.searchParams.entries()]
      .sort(([keyA, valueA], [keyB, valueB]) => {
        const keyComparison = keyA.localeCompare(keyB);
        return keyComparison || valueA.localeCompare(valueB);
      });
    url.search = '';
    for (const [key, itemValue] of sortedParams) {
      url.searchParams.append(key, itemValue);
    }

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/g, '');
    }

    return url.toString();
  } catch {
    return raw
      .replace(/([?&])casa_token=[^&#]*/gi, '$1')
      .replace(/[?&]+$/g, '')
      .replace(/#.*$/g, '')
      .replace(/\/+$/g, '');
  }
}

function linkMatchesStoredUrl(anchorHref, storedUrl) {
  const href = String(anchorHref || '').trim();
  const target = String(storedUrl || '').trim();
  if (!href || !target) return false;

  const normalizedHref = normalizeHighlightUrl(href);
  const normalizedTarget = normalizeHighlightUrl(target);
  const prefixSuffix = href.startsWith(target) ? href.slice(target.length) : null;
  const safeLegacyPrefix = prefixSuffix !== null
    && (prefixSuffix === '' || /^[?&#]/.test(prefixSuffix));

  return (
    (normalizedHref && normalizedTarget && normalizedHref === normalizedTarget)
    || href === target
    || safeLegacyPrefix
  );
}

function paintHighlights() {
  document.querySelectorAll('a.ic-highlighted-link').forEach((link) => {
    link.style.backgroundColor = '';
    link.classList.remove('ic-highlighted-link');
  });

  if (!highlightsEnabled || !currentHighlights || Object.keys(currentHighlights).length === 0) {
    return;
  }

  for (const [linkUrl, color] of Object.entries(currentHighlights)) {
    // Evita seletor CSS com URL não escapada. A comparação por href também lida
    // melhor com URLs que contêm caracteres especiais.
    document.querySelectorAll('a[href]').forEach((link) => {
      if (linkMatchesStoredUrl(link.href, linkUrl)) {
        link.classList.add('ic-highlighted-link');
        link.style.backgroundColor = color;
      }
    });
  }
}

async function refreshHighlightsFromWs() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getHighlightsFromWs' }, (response) => {
      try {
        if (chrome.runtime.lastError) {
          console.warn('iCipo: não foi possível consultar highlights via WS:', chrome.runtime.lastError.message);
          resolve();
          return;
        }

        currentHighlights = response?.highlightedLinks && typeof response.highlightedLinks === 'object'
          ? response.highlightedLinks
          : {};
        highlightsEnabled = response?.active !== false;
        paintHighlights();
      } finally {
        refreshPromise = null;
        resolve();
      }
    });
  });

  return refreshPromise;
}

function watchForChanges() {
  if (typeof MutationObserver === 'undefined') return;

  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(paintHighlights, 80);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshHighlightsFromWs();
  watchForChanges();
});

window.addEventListener('load', refreshHighlightsFromWs);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === 'refreshHighlights') {
    refreshHighlightsFromWs();
  }
});

// Extract best-effort metadata for a given linkUrl on the current page.
// This focuses on Google Scholar's common DOM structure, but degrades gracefully.
function extractMetadataForLink(linkUrl) {
  const anchors = Array.from(document.querySelectorAll('a'))
    .filter(a => linkMatchesStoredUrl(a.href, linkUrl));
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
