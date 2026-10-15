<script>
  import { onMount } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';

  let projectName = 'Carregando...';
  let activePhase = '';
  let kpis = {
    total: 0,
    included: 0,
    excluded: 0,
    pending: 0
  };

  async function loadData() {
    try {
      const activeProjectResult = await storage.getActiveProject().catch(() => null);
      const activeProject = activeProjectResult?.data || activeProjectResult;

      if (!activeProject || !activeProject.id) {
        projectName = 'Nenhum projeto ativo';
        activePhase = '';
        kpis = { total: 0, included: 0, excluded: 0, pending: 0 };
        return;
      }

      projectName = activeProject.name || activeProject.title || activeProject.id;
      activePhase = activeProject.activePhaseLabel || '';

      const resp = await storage.getAllHighlightedLinksForActiveProject().catch(() => null);
      const data = resp?.data || resp || {};
      const papers = Array.isArray(data.papers)
        ? data.papers
        : Array.isArray(data.svat_papers)
        ? data.svat_papers
        : [];

      let total = papers.length;
      let included = 0;
      let excluded = 0;
      let pending = 0;

      for (const p of papers) {
        const status = p.status || (p.metricType || '').toLowerCase();
        if (status === 'included') included++;
        else if (status === 'excluded') excluded++;
        else pending++;
      }

      kpis = { total, included, excluded, pending };
    } catch (e) {
      console.warn('Erro ao carregar dados do popup:', e);
      projectName = 'iCipó';
    }
  }

  function openDashboard() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard/dashboard.html') });
    } else {
      window.open('../dashboard/dashboard.html', '_blank');
    }
  }

  function openProjects() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/projects/projects.html') });
    } else {
      window.open('../projects/projects.html', '_blank');
    }
  }

  function openOptions() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/options.html', '_blank');
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="popup-container">
  <header>
    <div class="header-top">
      <h1>iCipó</h1>
      <span class="badge">v1.0</span>
    </div>
    <p class="proj-title">Projeto: <strong>{projectName}</strong></p>
    {#if activePhase}
      <p class="proj-phase">Fase: <span>{activePhase}</span></p>
    {/if}
    <div class="kpis">
      <div class="kpi"><div class="n">{kpis.total}</div><div class="l">Total</div></div>
      <div class="kpi"><div class="n inc">{kpis.included}</div><div class="l">Incl.</div></div>
      <div class="kpi"><div class="n exc">{kpis.excluded}</div><div class="l">Excl.</div></div>
      <div class="kpi"><div class="n pen">{kpis.pending}</div><div class="l">Pend.</div></div>
    </div>
  </header>
  <div class="wrap">
    <button class="action-btn primary" on:click={openDashboard}>
      <span>📊</span> <span>Abrir Dashboard</span>
    </button>
    <button class="action-btn" on:click={openProjects}>
      <span>📁</span> <span>Meus projetos</span>
    </button>
    <div class="row">
      <button class="action-btn secondary" on:click={openOptions}>
        <span>⚙️</span> <span>Configurações</span>
      </button>
    </div>
    <div class="muted">
      💡 Dica: marque um artigo com botão direito → “Marcar link” → categoria.
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
    background: #ffffff;
    color: #111827;
  }
  .popup-container {
    width: 320px;
    box-sizing: border-box;
  }
  header {
    padding: 14px 14px 10px;
    border-bottom: 1px solid #f3f4f6;
    background: #fafafa;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header h1 {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .badge {
    font-size: 10px;
    font-weight: 600;
    background: #e2e8f0;
    color: #475569;
    padding: 2px 6px;
    border-radius: 999px;
  }
  .proj-title {
    font-size: 12px;
    margin: 6px 0 2px;
    color: #4b5563;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .proj-phase {
    font-size: 11px;
    margin: 0 0 6px;
    color: #6b7280;
  }
  .proj-phase span {
    font-weight: 600;
    color: #2563eb;
  }
  .wrap {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .action-btn {
    appearance: none;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: #1f2937;
    width: 100%;
    box-sizing: border-box;
  }
  .action-btn:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
  .action-btn.primary {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }
  .action-btn.primary:hover {
    background: #0369a1;
    border-color: #0369a1;
  }
  .action-btn.secondary {
    background: #f8fafc;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .muted {
    font-size: 11px;
    color: #6b7280;
    margin-top: 4px;
    line-height: 1.4;
    padding: 6px 8px;
    background: #f8fafc;
    border-radius: 6px;
    border: 1px dashed #e2e8f0;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 8px;
  }
  .kpi {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 6px 4px;
    background: #ffffff;
    text-align: center;
  }
  .kpi .n {
    font-weight: 700;
    font-size: 14px;
    color: #111827;
  }
  .kpi .n.inc { color: #16a34a; }
  .kpi .n.exc { color: #dc2626; }
  .kpi .n.pen { color: #ea580c; }
  .kpi .l {
    font-size: 10px;
    color: #6b7280;
    margin-top: 2px;
  }
</style>
