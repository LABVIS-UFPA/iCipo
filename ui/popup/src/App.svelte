<script>
  import { onMount } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';
  import '../../tokens.css';

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
  <header class="popup-header">
    <div class="header-top">
      <div class="brand-row">
        <picture class="brandPicture">
          <source srcset="/img/icipo_logo[dark].png" media="(prefers-color-scheme: dark)">
          <img class="brandLogo" src="/img/icipo_logo[dark].png" alt="iCipó" />
        </picture>
        <span class="brandFallback">iCipó</span>
      </div>
      <span class="badge">v1.0</span>
    </div>

    <div class="project-info-card">
      <div class="proj-title-row">
        <span class="status-pulse" aria-hidden="true"></span>
        <span class="proj-title" title={projectName}>{projectName}</span>
      </div>
      {#if activePhase}
        <div class="proj-phase">Fase ativa: <span>{activePhase}</span></div>
      {/if}
    </div>

    <div class="kpis" aria-label="Métricas de triagem">
      <div class="kpi kpi-total">
        <div class="n">{kpis.total}</div>
        <div class="l">Total</div>
      </div>
      <div class="kpi kpi-inc">
        <div class="n inc">{kpis.included}</div>
        <div class="l">Incluídos</div>
      </div>
      <div class="kpi kpi-exc">
        <div class="n exc">{kpis.excluded}</div>
        <div class="l">Excluídos</div>
      </div>
      <div class="kpi kpi-pen">
        <div class="n pen">{kpis.pending}</div>
        <div class="l">Pendentes</div>
      </div>
    </div>
  </header>

  <main class="popup-body">
    <button class="action-btn primary" on:click={openDashboard}>
      <span class="btn-icon">📊</span>
      <span>Abrir Dashboard</span>
      <span class="btn-arrow">→</span>
    </button>

    <div class="action-row">
      <button class="action-btn secondary" on:click={openProjects}>
        <span class="btn-icon">📁</span>
        <span>Projetos</span>
      </button>
      <button class="action-btn secondary" on:click={openOptions}>
        <span class="btn-icon">⚙️</span>
        <span>Configurações</span>
      </button>
    </div>

    <div class="tip-card">
      <span class="tip-icon">💡</span>
      <span class="tip-text">No Google Scholar, clique com o botão direito para marcar links e acelerar seu snowballing.</span>
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif);
    background: #071827;
    color: #172033;
    overflow-x: hidden;
  }

  .popup-container {
    width: 350px;
    max-width: 100vw;
    margin: 0 auto;
    background: #ffffff;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
  }

  .popup-header {
    background: linear-gradient(180deg, #071827 0%, #0b2032 60%, #0c2438 100%);
    padding: 16px 16px 14px;
    color: #ffffff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brandPicture {
    display: block;
    width: 86px;
    height: 28px;
  }

  .brandLogo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: left center;
  }

  .brandFallback {
    display: none;
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.02em;
  }

  .badge {
    font-size: 9.5px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.10);
    color: rgba(235, 244, 255, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 2px 7px;
    border-radius: 999px;
    letter-spacing: 0.04em;
  }

  .project-info-card {
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 9px 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .proj-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .status-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #31c878;
    box-shadow: 0 0 0 3px rgba(49, 200, 120, 0.22);
    flex-shrink: 0;
  }

  .proj-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .proj-phase {
    font-size: 11px;
    color: rgba(225, 235, 245, 0.70);
    margin: 0;
  }

  .proj-phase span {
    font-weight: 600;
    color: #5eead4;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
  }

  .kpi {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9px;
    padding: 8px 4px;
    background: rgba(255, 255, 255, 0.04);
    text-align: center;
    transition: background 0.15s ease;
  }
  .kpi:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .kpi .n {
    font-weight: 800;
    font-size: 15px;
    color: #ffffff;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .kpi .n.inc { color: #4ade80; }
  .kpi .n.exc { color: #f87171; }
  .kpi .n.pen { color: #fbbf24; }

  .kpi .l {
    font-size: 9.5px;
    font-weight: 600;
    color: rgba(225, 235, 245, 0.65);
    margin-top: 3px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .popup-body {
    padding: 14px 14px 16px;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .action-btn {
    appearance: none;
    border: 1px solid #d5dce6;
    border-radius: 9px;
    background: #ffffff;
    padding: 10px 14px;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 650;
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    color: #172033;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
  }

  .action-btn:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(16, 24, 40, 0.08);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn.primary {
    background: #2eae6c;
    color: #ffffff;
    border-color: #2eae6c;
    box-shadow: 0 2px 6px rgba(46, 174, 108, 0.32);
    font-size: 13px;
    font-weight: 700;
  }

  .action-btn.primary:hover {
    background: #238d57;
    border-color: #238d57;
    box-shadow: 0 4px 12px rgba(46, 174, 108, 0.42);
  }

  .action-btn.primary .btn-arrow {
    margin-left: auto;
    font-size: 15px;
    transition: transform 0.15s ease;
  }

  .action-btn.primary:hover .btn-arrow {
    transform: translateX(3px);
  }

  .action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .action-btn.secondary {
    justify-content: center;
    padding: 9px 10px;
    font-size: 12px;
  }

  .btn-icon {
    font-size: 15px;
    line-height: 1;
  }

  .tip-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px dashed #d5dce6;
    margin-top: 2px;
  }

  .tip-icon {
    font-size: 14px;
    line-height: 1.2;
    flex-shrink: 0;
  }

  .tip-text {
    font-size: 10.5px;
    color: #64748b;
    line-height: 1.45;
  }

  @media (max-width: 340px) {
    .popup-container {
      width: 100vw;
    }
    .kpis {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
