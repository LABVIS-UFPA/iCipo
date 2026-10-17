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

  let flowContainerEl;

  function handleAddPhase() {
    openPhasePanel(null);
  }

  function scrollFlow(direction) {
    if (!flowContainerEl) return;
    const scrollAmount = 400;
    flowContainerEl.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  }

  async function handleReorder(event) {
    const { sourceLabel, targetLabel, targetIndex } = event.detail;
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) return;
    const currentLabels = phases.map((p) => p.label);
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
    <div>
      <div class="viewTitleWithBadge">
        <span class="viewTitleIconBadge" aria-hidden="true">
          <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16"/>
            <circle cx="8" cy="6" r="2" fill="currentColor"/>
            <circle cx="16" cy="12" r="2" fill="currentColor"/>
            <circle cx="10" cy="18" r="2" fill="currentColor"/>
          </svg>
        </span>
        <h2>Fases do Estudo</h2>
      </div>
      <p>
        Gerencie as etapas da sua Revisão Sistemática. Os artigos selecionados em cada etapa avançam como herança para a fase seguinte.
      </p>
    </div>
  </div>

  <div class="toolbar">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%">
      <button
        id="btnShowAddPhase"
        class="btn btn-primary"
        type="button"
        on:click={handleAddPhase}
      >
        <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Adicionar nova fase</span>
      </button>
      <div class="muted phaseToolbarHint" style="display:inline-flex;align-items:center;gap:6px">
        <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--orange);" aria-hidden="true">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/>
        </svg>
        <span>Use a barra de rolagem horizontal abaixo dos cards para navegar no fluxo sequencial.</span>
      </div>
    </div>
  </div>

  <!-- Cartões de Fases com Setas de Avanço Conectoras e Barra de Rolagem Horizontal -->
  <div class="card card--phases" style="margin-top:16px">
    <div class="phasesHeaderRow">
      <div>
        <div class="cardTitle">Fluxo Contínuo de Fases e Triagem</div>
        <div class="muted">
          Sequência linear de progressão. Role horizontalmente da esquerda para a direita para ver todas as fases sem quebra de linha.
        </div>
      </div>

      {#if phases.length > 2}
        <div class="phasesScrollNav" aria-label="Navegar pelas fases">
          <button
            type="button"
            class="btn btnScroll"
            title="Rolar fases para a esquerda"
            aria-label="Rolar para a esquerda"
            on:click={() => scrollFlow('left')}
          >
            ‹
          </button>
          <button
            type="button"
            class="btn btnScroll"
            title="Rolar fases para a direita"
            aria-label="Rolar para a direita"
            on:click={() => scrollFlow('right')}
          >
            ›
          </button>
        </div>
      {/if}
    </div>

    <!-- Container com barra de rolagem horizontal suave (scroll da direita para a esquerda e vice-versa) -->
    <div class="phasesFlowRow" bind:this={flowContainerEl}>
      <div id="phasesList" class="phasesFlowList" aria-live="polite">
        {#if phases.length === 0}
          <div class="overviewEmptyState" style="padding: 36px 20px; text-align: center; width: 100%;">
            <div style="margin-bottom: 10px; color: var(--green);">
              <svg class="academicSvg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h16M4 12h16M4 18h16"/>
                <circle cx="8" cy="6" r="2" fill="currentColor"/>
                <circle cx="16" cy="12" r="2" fill="currentColor"/>
                <circle cx="10" cy="18" r="2" fill="currentColor"/>
              </svg>
            </div>
            <div style="font-weight: 750; font-size: 15px; margin-bottom: 6px;">Nenhuma fase cadastrada</div>
            <p style="color: var(--muted); font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
              Este projeto ainda não possui fases. Crie a primeira fase para definir critérios de triagem e começar a marcar artigos no Google Scholar.
            </p>
            <button class="btn btn-primary" type="button" on:click={handleAddPhase}>
              Adicionar primeira fase
            </button>
          </div>
        {:else}
          {#each phases as phase, index (phase.label || index)}
            <div class="phaseFlowCardItem">
              <PhaseCard
                {phase}
                {index}
                totalPhases={phases.length}
                on:drop={handleReorder}
              />
            </div>

            {#if index < phases.length - 1}
              <!-- Seta Conectora de Progressão entre Fases no fluxo horizontal -->
              <div
                class="phaseProgressionArrow"
                aria-hidden="true"
                title="Os artigos aprovados na Etapa {index + 1} avançam como herança para a Etapa {index + 2}"
              >
                <div class="arrowBadge">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
                <span class="arrowLabel">Avanço</span>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>
</section>

<PhasePanel />
