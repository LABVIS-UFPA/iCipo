<script>
  import { createEventDispatcher } from 'svelte';
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    expandedCompletedPhaseStore,
    paperMetricFilterStore,
    openPhasePanel,
    togglePhaseCategoryAction,
    showNotice
  } from '../dashboardStore.js';
  import {
    getPhaseStats,
    isPhaseCompleted,
    isReorderablePlannedPhase,
    isDefaultCategory
  } from '../dashboardHelpers.js';

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

  function handleMetricBoxClick(ev, metric) {
    ev.stopPropagation();
    paperMetricFilterStore.set(metric);
    expandedCompletedPhaseStore.set(label);
  }

  async function handleToggleCategory(ev, catLabel) {
    ev.stopPropagation();
    if (isCompleted || isDefaultCategory(catLabel)) return;
    try {
      await togglePhaseCategoryAction(label, catLabel);
    } catch (err) {
      console.warn('Falha ao alternar categoria na fase:', err);
    }
  }

  function handleCardClick(ev) {
    if (ev.target.closest('button') || ev.target.closest('a')) return;
    if (isCompleted || isActivePhase) {
      handleToggleArchive(ev);
      return;
    }
    if (!isActivePhase) {
      showNotice('Conclua a fase ativa atual antes de avançar para a próxima.', 'warning');
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
            <span class="statusBadgeIcon" aria-hidden="true">
              <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            <span>Concluída</span>
          </span>
        {:else if isActivePhase}
          <span class="statusBadge badgeActive" title="Fase atualmente em condução">
            <span class="pulsePoint"></span> Fase Ativa
          </span>
        {:else}
          <span class="statusBadge badgePlanned" title="Aguardando conclusão da fase anterior">
            <span class="statusBadgeIcon" aria-hidden="true">
              <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
            <span>Planejada</span>
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
        role="button"
        tabindex="0"
        title="Ver artigos herdados da fase anterior"
        on:click={(ev) => handleMetricBoxClick(ev, 'inherited')}
        on:keydown={(ev) => ev.key === 'Enter' && handleMetricBoxClick(ev, 'inherited')}
      >
        <div class="metricBoxHeader">
          <span class="metricIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
          </span>
          <span class="metricLabel">Herdados</span>
        </div>
        <strong class="metricValue">{stats.inherited}</strong>
        <span class="metricSub">da fase anterior</span>
      </div>

      <div
        class="triageMetricBox metricPending"
        role="button"
        tabindex="0"
        title="Ver artigos pendentes de avaliação nesta fase"
        on:click={(ev) => handleMetricBoxClick(ev, 'pending')}
        on:keydown={(ev) => ev.key === 'Enter' && handleMetricBoxClick(ev, 'pending')}
      >
        <div class="metricBoxHeader">
          <span class="metricIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
            </svg>
          </span>
          <span class="metricLabel">Pendentes</span>
        </div>
        <strong class="metricValue">{stats.pending}</strong>
        <span class="metricSub">na fila</span>
      </div>

      <div
        class="triageMetricBox metricSelected"
        role="button"
        tabindex="0"
        title="Ver artigos aprovados que avançam para a próxima etapa"
        on:click={(ev) => handleMetricBoxClick(ev, 'included')}
        on:keydown={(ev) => ev.key === 'Enter' && handleMetricBoxClick(ev, 'included')}
      >
        <div class="metricBoxHeader">
          <span class="metricIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </span>
          <span class="metricLabel">Aprovados</span>
        </div>
        <strong class="metricValue">{stats.selected}</strong>
        <span class="metricSub">avançam</span>
      </div>

      <div
        class="triageMetricBox metricRemoved"
        role="button"
        tabindex="0"
        title="Ver artigos excluídos ou duplicados removidos nesta fase"
        on:click={(ev) => handleMetricBoxClick(ev, 'excluded')}
        on:keydown={(ev) => ev.key === 'Enter' && handleMetricBoxClick(ev, 'excluded')}
      >
        <div class="metricBoxHeader">
          <span class="metricIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </span>
          <span class="metricLabel">Excluídos</span>
        </div>
        <strong class="metricValue">{stats.removed}</strong>
        <span class="metricSub">removidos</span>
      </div>
    </div>

    <!-- Categories used in this phase -->
    {#if allCategories.length > 0}
      <div class="phaseCategoriesSection" title="Categorias desta fase — clique para marcar ou desmarcar">
        <div class="phaseCategoriesHeader">
          <span>Categorias ({phaseCategoryLabels.length} ativas):</span>
          {#if !isCompleted}
            <small class="phaseCatToggleHint">Clique para alternar</small>
          {/if}
        </div>
        <div class="phaseCategoryBadges">
          {#each allCategories as cat}
            {@const isDefault = isDefaultCategory(cat.label)}
            {@const isCatActive = isDefault || phaseCategoryLabels.includes(cat.label)}
            <button
              type="button"
              class="phaseCategoryBadgeItem"
              class:isCatActive={isCatActive}
              class:isCatInactive={!isCatActive}
              class:isReadOnly={isCompleted || isDefault}
              disabled={isCompleted || isDefault}
              on:click={(ev) => !isDefault && handleToggleCategory(ev, cat.label)}
              title={isDefault ? `${cat.title || cat.label}: Categoria padrão obrigatória (sempre ativa nesta fase).` : `${cat.title || cat.label}: ${isCatActive ? 'Ativa na fase (destacada no navegador). Clique para desmarcar.' : 'Desmarcada (não destaca links no navegador). Clique para ativar.'}`}
              aria-pressed={isCatActive}
            >
              <span class="catColorDot" style="background: {isCatActive ? (cat.color || '#2eae6c') : '#94a3b8'};"></span>
              <span class="catName">{cat.title || cat.label}</span>
              {#if isDefault}
                <span class="catDefaultLock" title="Obrigatória" style="font-size:10px;margin-left:3px;opacity:0.85">🔒</span>
              {:else}
                <span class="catCheckIcon" aria-hidden="true">{isCatActive ? '✓' : '○'}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Card Footer Actions -->
    <div class="phaseCardFooter">
      <div class="phaseFooterLeft">
        <button
          class="btn small phaseArchiveBtn"
          class:active={isExpanded}
          type="button"
          on:click={handleToggleArchive}
          aria-expanded={isExpanded}
          title={isExpanded ? 'Recolher gaveta de artigos' : 'Ver e triar artigos desta fase'}
        >
          <span class="phaseArchiveBtnIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M3 15h18M9 3v18"/>
            </svg>
          </span>
          <span>{isExpanded ? 'Ocultar artigos' : 'Ver artigos'}</span>
          <span class="archiveChevron" class:expanded={isExpanded} aria-hidden="true">▾</span>
        </button>
      </div>

      <div class="phaseFooterRight">
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
</div>
