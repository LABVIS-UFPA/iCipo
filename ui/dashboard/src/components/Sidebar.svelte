<script>
  import {
    projectStore,
    activeViewStore,
    dashboardIntroRequiredStore,
    phaseCreationRequiredStore,
    categoryCreationRequiredStore,
    setActiveView
  } from '../dashboardStore.js';
  import { formatResearchers } from '../dashboardHelpers.js';

  $: project = $projectStore || {};
  $: researchers = formatResearchers(project.researchers || project.researcher) || '—';
  $: objective = project.objective || project.description || '—';
  $: projectId = project.id || '—';

  $: requiredView = $dashboardIntroRequiredStore
    ? '__intro__'
    : ($phaseCreationRequiredStore ? 'phases' : ($categoryCreationRequiredStore ? 'categories' : null));

  function isLocked(view) {
    return Boolean(requiredView && (requiredView === '__intro__' || view !== requiredView));
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
    <span class="brandSub" id="brandSub">{project.id ? `ID: ${project.id}` : 'Sem projeto ativo'}</span>
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
      <span class="navIcon">⌂</span>
      <span>Visão Geral</span>
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
      <span class="navIcon">◇</span>
      <span>Fases</span>
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
      <span class="navIcon">□</span>
      <span>Categorias</span>
    </button>

    <button
      class="navBtn"
      class:active={$activeViewStore === 'papers'}
      class:tutorialLocked={isLocked('papers')}
      class:phaseLocked={isLocked('papers')}
      aria-disabled={isLocked('papers')}
      data-view="papers"
      on:click={() => handleNav('papers')}
    >
      <span class="navIcon">▤</span>
      <span>Artigos</span>
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
      <button id="btnProjects" class="ghost" on:click={goToProjects}>Projetos</button>
      <button id="btnOptions" class="ghost" on:click={goToOptions}>Configurações</button>
    </div>
  </div>
</aside>
