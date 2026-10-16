<script>
  import {
    projectStore,
    activePhaseLabelStore,
    openPhasePanel,
    reorderPhasesAction
  } from '../dashboardStore.js';
  import PhaseCard from '../components/PhaseCard.svelte';
  import PhasePanel from '../components/PhasePanel.svelte';

  $: project = $projectStore || {};
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: activePhaseLabel = $activePhaseLabelStore;

  function handleAddPhase() {
    openPhasePanel(null);
  }

  async function handleReorder(event) {
    const { sourceLabel, targetLabel, targetIndex } = event.detail;
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) return;
    const currentLabels = phases.map(p => p.label);
    const sourceIndex = currentLabels.indexOf(sourceLabel);
    if (sourceIndex < 0) return;
    const newLabels = [...currentLabels];
    newLabels.splice(sourceIndex, 1);
    newLabels.splice(targetIndex, 0, sourceLabel);
    try {
      await reorderPhasesAction(newLabels);
    } catch (err) {
      console.warn('Falha ao reorganizar fases:', err);
      alert(err?.message || 'Falha ao reorganizar fases.');
    }
  }
</script>

<section class="view phasesView" id="view_phases">
  <div class="panelHeader">
    <h2>Fases</h2>
    <p>
      Gerencie as fases do seu processo. As alterações são salvas no
      project.json via WebSocket.
    </p>
  </div>

  <div class="toolbar">
    <div style="display:flex;gap:8px;align-items:center">
      <button id="btnShowAddPhase" class="btn" type="button" on:click={handleAddPhase}>
        Adicionar nova fase
      </button>
      <div class="muted">
        As fases são organizadas em ordem. Use “Ver artigos” na fase ativa
        ou em uma fase concluída para consultar a triagem sem sair da
        árvore.
      </div>
    </div>
  </div>

  <div class="card card--phases" style="margin-top:12px">
    <div class="cardTitle">Progressão de fases</div>
    <div class="phasesRow">
      <div id="phasesList" class="phasesList" aria-live="polite">
        {#if phases.length === 0}
          <div class="overviewEmptyState" style="padding: 24px;">
            Nenhuma fase cadastrada. Clique em "Adicionar nova fase" para iniciar o fluxo.
          </div>
        {:else}
          {#each phases as phase, index (phase.label || index)}
            <PhaseCard
              {phase}
              {index}
              on:drop={handleReorder}
            />
          {/each}
        {/if}
      </div>
    </div>
  </div>
</section>

<PhasePanel />
