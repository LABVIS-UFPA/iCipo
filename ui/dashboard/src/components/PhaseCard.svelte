<script>
  import { createEventDispatcher } from 'svelte';
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    expandedCompletedPhaseStore,
    openPhasePanel,
    openPapersWithFilter
  } from '../dashboardStore.js';
  import {
    getPhaseStats,
    isPhaseCompleted,
    isReorderablePlannedPhase
  } from '../dashboardHelpers.js';
  import PhaseArchivePanel from './PhaseArchivePanel.svelte';

  export let phase = {};
  export let index = 0;
  export let totalPhases = 1;

  const dispatch = createEventDispatcher();

  $: project = $projectStore || {};
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: allCategories = Array.isArray(project.categories) ? project.categories : [];
  $: activePhaseLabel = $activePhaseLabelStore;
  $: label = phase.label;
  $: isActivePhase = activePhaseLabel === label;
  $: isCompleted = isPhaseCompleted(phase);
  $: isPlannedPhase = !isCompleted && !isActivePhase;
  $: isDraggablePhase = isReorderablePlannedPhase(label, phases, activePhaseLabel);
  $: stats = getPhaseStats(phase, $papersStore);

  $: isExpanded = $expandedCompletedPhaseStore === label;

  // Resolve category objects for this phase
  $: phaseCategoryLabels = Array.isArray(phase.categories) ? phase.categories : [];
  $: phaseCategories = phaseCategoryLabels
    .map((clabel) => allCategories.find((c) => c.label === clabel))
    .filter(Boolean);

  function handleToggleArchive(ev) {
    ev.stopPropagation();
    if (isExpanded) {
      expandedCompletedPhaseStore.set(null);
    } else {
      expandedCompletedPhaseStore.set(label);
    }
  }

  function handleEdit(ev) {
    ev.stopPropagation();
    openPhasePanel(phase);
  }

  function handleOpenPapers(ev) {
    ev.stopPropagation();
    openPapersWithFilter({ phase: label });
  }

  function handleCardClick(ev) {
    if (ev.target.closest('button') || ev.target.closest('a')) return;
    if (isCompleted || isActivePhase) {
      handleToggleArchive(ev);
      return;
    }
    if (!isActivePhase) {
      alert('Conclua a fase ativa atual antes de avançar para a próxima.');
    }
  }

  function handleDragStart(ev) {
    if (!isDraggablePhase) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', label);
    dispatch('dragstart', { label, index });
  }

  function handleDragOver(ev) {
    if (!isDraggablePhase) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(ev) {
    if (!isDraggablePhase) return;
    ev.preventDefault();
    const sourceLabel = ev.dataTransfer.getData('text/plain');
    dispatch('drop', { sourceLabel, targetLabel: label, targetIndex: index });
  }
</script>

<div class="phaseCardWrapper">
  <div
    class="phaseCard modernPhaseCard"
    class:active={isActivePhase}
    class:phaseCard--locked={isPlannedPhase}
    class:phaseCard--completed={isCompleted}
    class:phaseCard--draggable={isDraggablePhase}
    draggable={isDraggablePhase}
    on:click={handleCardClick}
    on:dragstart={handleDragStart}
    on:dragover={handleDragOver}
    on:drop={handleDrop}
    role="button"
    tabindex="0"
    on:keydown={(e) => {
      if (e.key === 'Enter') handleCardClick(e);
    }}
  >
    <!-- Top step indicator & status row -->
    <div class="phaseCardTopRow">
      <div class="phaseStepTag">
        <span class="stepNumber">Etapa {index + 1}</span>
        <span class="stepTotal">de {totalPhases}</span>
      </div>

      <div class="phaseStatusIndicator">
        {#if isCompleted}
          <span class="statusBadge badgeDone" title="Fase concluída e protegida">
            <span class="statusBadgeIcon">✓</span> Concluída
          </span>
        {:else if isActivePhase}
          <span class="statusBadge badgeActive" title="Fase atualmente em condução">
            <span class="pulsePoint"></span> Fase Ativa
          </span>
        {:else}
          <span class="statusBadge badgePlanned" title="Aguardando conclusão da fase anterior">
            <span class="statusBadgeIcon">⏱</span> Planejada
          </span>
        {/if}
      </div>

      {#if isDraggablePhase}
        <span
          class="phaseDragHandle"
          title="Arraste para reposicionar esta fase planejada"
          aria-label="Arraste para reposicionar"
        >
          ⋮⋮
        </span>
      {/if}
    </div>

    <!-- Phase title and description -->
    <div class="phaseCardHead">
      <h3 class="phaseTitle" title={phase.title || `Fase ${index + 1}`}>
        {phase.title || `Fase ${index + 1}`}
      </h3>
      {#if phase.description || phase.desc}
        <p class="phaseDesc" title={phase.description || phase.desc}>
          {phase.description || phase.desc}
        </p>
      {/if}
    </div>

    <!-- Progress bar when phase is active or done -->
    {#if isActivePhase || isCompleted}
      <div class="phaseProgressBarWrap" title="Progresso da triagem de artigos nesta fase">
        <div class="progressBarMeta">
          <span class="progressLabel">Progresso da triagem</span>
          <span class="progressPct">{stats.utilization}%</span>
        </div>
        <div class="progressBarTrack">
          <div
            class="progressBarFill"
            class:isDone={isCompleted}
            style="width: {stats.utilization}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- 4 Triage Metrics Pillars (Mini-cards com semântica cristalina) -->
    <div class="triageMetricsGrid">
      <div
        class="triageMetricBox metricInherited"
        title="Artigos selecionados na fase anterior e recebidos como herança"
      >
        <div class="metricBoxHeader">
          <span class="metricIcon">📥</span>
          <span class="metricLabel">Herdados</span>
        </div>
        <strong class="metricValue">{stats.inherited}</strong>
        <span class="metricSub">da fase anterior</span>
      </div>

      <div
        class="triageMetricBox metricPending"
        title="Artigos novos ou pendentes aguardando decisão nesta fase"
      >
        <div class="metricBoxHeader">
          <span class="metricIcon">⏳</span>
          <span class="metricLabel">Pendentes</span>
        </div>
        <strong class="metricValue">{stats.pending}</strong>
        <span class="metricSub">na fila</span>
      </div>

      <div
        class="triageMetricBox metricSelected"
        title="Artigos aprovados nesta fase que avançam para a próxima etapa"
      >
        <div class="metricBoxHeader">
          <span class="metricIcon">✅</span>
          <span class="metricLabel">Aprovados</span>
        </div>
        <strong class="metricValue">{stats.selected}</strong>
        <span class="metricSub">avançam</span>
      </div>

      <div
        class="triageMetricBox metricRemoved"
        title="Artigos excluídos ou duplicados removidos nesta fase"
      >
        <div class="metricBoxHeader">
          <span class="metricIcon">❌</span>
          <span class="metricLabel">Excluídos</span>
        </div>
        <strong class="metricValue">{stats.removed}</strong>
        <span class="metricSub">removidos</span>
      </div>
    </div>

    <!-- Categories used in this phase -->
    {#if phaseCategories.length > 0}
      <div class="phaseCategoriesSection" title="Critérios e categorias ativas nesta fase">
        <div class="phaseCategoriesHeader">
          <span>Categorias ativas ({phaseCategories.length}):</span>
        </div>
        <div class="phaseCategoryBadges">
          {#each phaseCategories as cat}
            <span
              class="phaseCategoryBadgeItem"
              title="{cat.title || cat.label}: resultado {cat.metricType || 'pendente'}"
            >
              <span class="catColorDot" style="background: {cat.color || '#2eae6c'};"></span>
              <span class="catName">{cat.title || cat.label}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Card Footer Actions -->
    <div class="phaseCardFooter">
      <div class="phaseFooterLeft">
        {#if isCompleted || isActivePhase}
          <button
            class="btn small phaseArchiveBtn"
            class:active={isExpanded}
            type="button"
            on:click={handleToggleArchive}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Recolher gaveta de artigos' : 'Visualizar artigos avaliados nesta fase'}
          >
            <span>{isExpanded ? 'Ocultar artigos' : 'Ver artigos'}</span>
            <span class="archiveChevron" class:expanded={isExpanded} aria-hidden="true">▾</span>
          </button>
        {/if}
      </div>

      <div class="phaseFooterRight">
        <button
          class="btn small phaseFilterBtn"
          type="button"
          on:click={handleOpenPapers}
          title="Abrir tabela de artigos filtrada nesta fase"
        >
          <span>Triar artigos</span>
          <span aria-hidden="true">→</span>
        </button>

        <button
          class="btn small phaseEditBtn"
          type="button"
          on:click={handleEdit}
          title="Editar configurações, critérios e ciclo desta fase"
          aria-label="Editar fase {phase.title || `Fase ${index + 1}`}"
        >
          <svg
            class="phaseEditIcon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <span>Editar</span>
        </button>
      </div>
    </div>
  </div>

  {#if isExpanded}
    <PhaseArchivePanel
      {phase}
      {index}
      {totalPhases}
      {isActivePhase}
    />
  {/if}
</div>
