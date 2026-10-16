<script>
  import { createEventDispatcher } from 'svelte';
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    expandedCompletedPhaseStore,
    setActivePhaseAction,
    openPhasePanel
  } from '../dashboardStore.js';
  import {
    getPhaseStats,
    isPhaseCompleted,
    isReorderablePlannedPhase
  } from '../dashboardHelpers.js';
  import PhaseArchivePanel from './PhaseArchivePanel.svelte';

  export let phase = {};
  export let index = 0;


  const dispatch = createEventDispatcher();

  $: project = $projectStore || {};
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: activePhaseLabel = $activePhaseLabelStore;
  $: label = phase.label;
  $: isActivePhase = activePhaseLabel === label;
  $: isCompleted = isPhaseCompleted(phase);
  $: isPlannedPhase = !isCompleted && !isActivePhase;
  $: isDraggablePhase = isReorderablePlannedPhase(label, phases, activePhaseLabel);
  $: stats = getPhaseStats(phase, $papersStore);

  $: isExpanded = $expandedCompletedPhaseStore === label;

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

  async function handleCardClick(ev) {
    if (ev.target.closest('button') || ev.target.closest('a')) return;

    if (isCompleted || isActivePhase) {
      handleToggleArchive(ev);
      return;
    }

    if (!isActivePhase) {
      alert('Conclua a fase ativa para ativar a próxima.');
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
    class="phaseCard"
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
    on:keydown={(e) => { if (e.key === 'Enter') handleCardClick(e); }}
  >
    <div class="phaseCardHeader">
      <div
        class="statusDot"
        title={isActivePhase ? 'Fase ativa' : (isCompleted ? 'Fase concluída' : 'Fase planejada')}
      ></div>
      <div class="phaseHeadText">
        <div class="phaseTitle">{phase.title || `Fase ${index + 1}`}</div>
      </div>
      {#if isDraggablePhase}
        <span class="phaseDragHandle" title="Arraste para reposicionar esta fase planejada" aria-label="Arraste para reposicionar">
          ⋮⋮
        </span>
      {/if}
    </div>

    <div class="phaseCardBody">
      <div class="papersSection">
        <div class="papersTitle">📊 Triagem de artigos</div>
        <div class="papersGrid">
          <div title="Artigos selecionados na fase anterior e recebidos nesta fase">
            <span class="muted">Herdados:</span> <strong>{stats.inherited}</strong>
          </div>
          <div title="Artigos novos desta fase ainda sem decisão">
            <span class="muted">Pendentes:</span> <strong>{stats.pending}</strong>
          </div>
          <div title="Artigos selecionados durante esta fase">
            <span class="muted">Selecionados:</span> <strong>{stats.selected}</strong>
          </div>
          <div title="Artigos excluídos ou identificados como duplicados">
            <span class="muted">Removidos:</span> <strong>{stats.removed}</strong>
          </div>
        </div>
        <div class="papersUtil">
          Rótulo: <strong class="phaseLabelStatus {isCompleted ? 'done' : 'pending'}">
            {isCompleted ? 'Concluído' : (isActivePhase ? 'Em análise' : 'Planejada')}
          </strong>
        </div>
      </div>
    </div>

    <div class="phaseCardFooter">
      {#if isActivePhase}
        <span class="activeLabel pill" aria-hidden="true">Ativo</span>
      {/if}
      <div class="phaseCardActions">
        {#if isCompleted || isActivePhase}
          <button
            class="btn small phaseArchiveToggle"
            type="button"
            on:click={handleToggleArchive}
            aria-expanded={isExpanded}
          >
            <span>{isExpanded ? 'Ocultar artigos' : 'Ver artigos'}</span>
            <span class="phaseArchiveChevron" aria-hidden="true">⌄</span>
          </button>
        {/if}
        <button class="btn small" type="button" on:click={handleEdit}>
          Editar
        </button>
      </div>
    </div>
  </div>

  {#if isExpanded}
    <PhaseArchivePanel {phase} />
  {/if}
</div>
