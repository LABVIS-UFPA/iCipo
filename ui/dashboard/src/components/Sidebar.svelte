<script>
  import {
    projectStore,
    activeViewStore,
    tutorialStageStore,
    isTutorialOpenStore,
    setActiveView
  } from '../dashboardStore.js';
  import { formatResearchers } from '../dashboardHelpers.js';

  $: project = $projectStore || {};
  $: researchers = formatResearchers(project.researchers || project.researcher) || '—';
  $: objective = project.objective || project.description || '—';
  $: projectId = project.id || '—';

  function isLocked(view) {
    if ($isTutorialOpenStore && $tutorialStageStore !== 'complete') {
      if ($tutorialStageStore === 'overview') return view !== 'overview';
      if ($tutorialStageStore === 'categories') return view !== 'categories';
      if ($tutorialStageStore === 'phases') return view !== 'phases';
    }
    return false;
  }

  function handleNav(view) {
    if (isLocked(view)) return;
    setActiveView(view);
  }

  function goToProjects() {
    window.location.href = '../projects/projects.html';
  }

  function goToOptions() {
    window.location.href = '../options/options.html';
  }
</script>

<aside class="sidebar u-flex-fill-col">
  <div class="brand brandModern">
    <picture class="brandPicture">
      <source
        srcset="/img/icipo_logo[dark].png"
        media="(prefers-color-scheme: dark)"
      />
      <img class="brandLogo" src="/img/icipo_logo[dark].png" alt="iCipó" />
    </picture>
    <span class="brandFallback">iCipó</span>
  </div>

  <nav class="nav u-flex-fill-col u-scroll-y" aria-label="Navegação principal">
    <button
      class="navBtn"
      class:active={$activeViewStore === 'overview'}
      class:tutorialLocked={isLocked('overview')}
      class:phaseLocked={isLocked('overview')}
      aria-disabled={isLocked('overview')}
      data-view="overview"
      on:click={() => handleNav('overview')}
    >
      <span class="navIcon" aria-hidden="true">
        <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5"/>
          <rect x="14" y="3" width="7" height="5" rx="1.5"/>
          <rect x="14" y="12" width="7" height="9" rx="1.5"/>
          <rect x="3" y="16" width="7" height="5" rx="1.5"/>
        </svg>
      </span>
      <span>Visão Geral</span>
    </button>

    <button
      class="navBtn"
      class:active={$activeViewStore === 'categories'}
      class:tutorialLocked={isLocked('categories')}
      class:phaseLocked={isLocked('categories')}
      aria-disabled={isLocked('categories')}
      data-view="categories"
      on:click={() => handleNav('categories')}
    >
      <span class="navIcon" aria-hidden="true">
        <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </span>
      <span>Categorias</span>
    </button>

    <button
      class="navBtn"
      class:active={$activeViewStore === 'phases'}
      class:tutorialLocked={isLocked('phases')}
      class:phaseLocked={isLocked('phases')}
      aria-disabled={isLocked('phases')}
      data-view="phases"
      on:click={() => handleNav('phases')}
    >
      <span class="navIcon" aria-hidden="true">
        <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16M4 12h16M4 18h16"/>
          <circle cx="8" cy="6" r="2" fill="currentColor"/>
          <circle cx="16" cy="12" r="2" fill="currentColor"/>
          <circle cx="10" cy="18" r="2" fill="currentColor"/>
        </svg>
      </span>
      <span>Fases</span>
    </button>
  </nav>

  <div class="sideFooter sideFooterModern">
    <div class="sidebarProjectSummary" aria-label="Informações do projeto">
      <div class="sidebarSectionTitle">Sobre o projeto</div>
      <div class="sidebarInfoBlock">
        <span>Pesquisadores</span>
        <strong id="sidebarResearchers" title={researchers}>{researchers}</strong>
      </div>
      <div class="sidebarInfoBlock">
        <span>Objetivo</span>
        <strong id="sidebarObjective" title={objective}>{objective}</strong>
      </div>
      <div class="sidebarInfoBlock">
        <span>ID do projeto</span>
        <strong id="sidebarProjectId" title={projectId}>{projectId}</strong>
      </div>
    </div>
    <div class="sidebarFooterActions">
      <button id="btnProjects" class="ghost" on:click={goToProjects} title="Abrir painel de projetos">
        <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
          <path d="M6 6h10M6 10h10M6 14h6"/>
        </svg>
        <span>Projetos</span>
      </button>
      <button id="btnOptions" class="ghost" on:click={goToOptions} title="Configurações" aria-label="Configurações">
        <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>
</aside>
