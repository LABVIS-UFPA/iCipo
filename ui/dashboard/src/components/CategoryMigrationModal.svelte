<script>
  import {
    projectStore,
    categoryMigrationModalStore,
    closeCategoryMigrationModal,
    migrateAndFinalizeCategoryDeletionAction
  } from "../dashboardStore.js";
  import {
    normalizeHexColor,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory,
    isDefaultCategory,
    PAPER_METRIC_LABELS
  } from "../dashboardHelpers.js";

  let selectedTargetLabel = null;
  let isMigrating = false;
  let errorMessage = "";

  $: modalData = $categoryMigrationModalStore;
  $: isOpen = Boolean(modalData?.isOpen);
  $: categoryToDelete = modalData?.categoryToDelete || {};
  $: linkedPapers = Array.isArray(modalData?.linkedPapers) ? modalData.linkedPapers : [];

  $: project = $projectStore || {};
  $: projectCategories = Array.isArray(project.categories) ? project.categories : [];
  $: destinationCategories = projectCategories.filter(
    cat => cat?.label && cat.label !== categoryToDelete?.label
  );

  $: if (isOpen) {
    selectedTargetLabel = null;
    isMigrating = false;
    errorMessage = "";
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen && !isMigrating) {
      handleCancel();
    }
  }

  function handleCancel() {
    if (isMigrating) return;
    closeCategoryMigrationModal();
  }

  function handleSelectTarget(catLabel) {
    if (isMigrating) return;
    selectedTargetLabel = catLabel;
    errorMessage = "";
  }

  async function handleConfirmMigration() {
    if (!selectedTargetLabel || isMigrating) return;
    errorMessage = "";
    isMigrating = true;
    try {
      await migrateAndFinalizeCategoryDeletionAction(categoryToDelete.label, selectedTargetLabel);
    } catch (err) {
      console.warn("Falha ao migrar e excluir categoria:", err);
      errorMessage = err?.message || "Ocorreu um erro ao migrar os artigos.";
      isMigrating = false;
    }
  }

  function getPaperAuthorsYear(paper) {
    const authors = paper?.author || paper?.authors || "Autor não informado";
    const year = paper?.year || "";
    return year ? `${authors} (${year})` : authors;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Overlay escurecido de fundo com desfoque -->
  <div
    class="categoryMigrationOverlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="categoryMigrationTitle"
    aria-describedby="categoryMigrationDesc"
    on:click|self={handleCancel}
    on:keydown|self={(e) => { if (e.key === 'Escape') handleCancel(); }}
  >
    <!-- Card que desce de cima para baixo na tela -->
    <div class="categoryMigrationCard">
      <!-- Linha de destaque no topo -->
      <div class="migrationAccentBar"></div>

      <!-- Cabeçalho do Card -->
      <div class="migrationHeader">
        <div class="migrationHeaderRow">
          <div class="migrationBadgeRow">
            <span class="migrationBadge">
              <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Migração Obrigatória de Artigos
            </span>
            <span class="migrationCountPill">
              {linkedPapers.length} {linkedPapers.length === 1 ? 'artigo vinculado' : 'artigos vinculados'}
            </span>
          </div>

          <button
            type="button"
            class="migrationCloseBtn"
            disabled={isMigrating}
            on:click={handleCancel}
            title="Cancelar e fechar (Esc)"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        <h3 id="categoryMigrationTitle" class="migrationTitle">
          Reatribuir artigos antes de excluir a categoria
        </h3>
        <p id="categoryMigrationDesc" class="migrationDescription">
          A categoria <strong>"{categoryToDelete?.title || categoryToDelete?.label}"</strong> possui <strong>{linkedPapers.length} {linkedPapers.length === 1 ? 'artigo atrelado' : 'artigos atrelados'}</strong>.
          Para que nenhum artigo fique sem categoria na pesquisa, selecione abaixo para qual categoria eles serão transferidos antes de prosseguir com a exclusão.
        </p>
      </div>

      <!-- Corpo com Artigos Vinculados e Opções de Destino -->
      <div class="migrationBody u-scroll-y">
        {#if errorMessage}
          <div class="migrationErrorBanner" role="alert">
            <span>⚠️ {errorMessage}</span>
          </div>
        {/if}

        <!-- Seção 1: Artigos vinculados que serão transferidos -->
        <div class="migrationSection">
          <div class="migrationSectionHeader">
            <div class="migrationSectionTitle">
              <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>Artigos vinculados a esta categoria ({linkedPapers.length})</span>
            </div>
            <span class="migrationSectionSubtext">Serão atualizados com a nova categoria</span>
          </div>

          <div class="migrationPapersList" role="region" aria-label="Lista de artigos vinculados">
            {#each linkedPapers as paper, index (paper.id || paper.url || index)}
              <div class="migrationPaperCard">
                <span class="paperIndexBadge">{index + 1}</span>
                <div class="paperInfoCol">
                  <span class="paperTitleText" title={paper.title || "Sem título"}>
                    {paper.title || "Sem título"}
                  </span>
                  <div class="paperMetaRow">
                    <span class="paperAuthorsText">{getPaperAuthorsYear(paper)}</span>
                    {#if paper.phaseLabel}
                      <span class="paperPhaseDot">·</span>
                      <span class="paperPhaseTag">{paper.phaseLabel}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Seção 2: Opção para migração dos artigos (Obrigatória) -->
        <div class="migrationSection">
          <div class="migrationSectionHeader">
            <div class="migrationSectionTitle">
              <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <span>Selecione a categoria de destino (*)</span>
            </div>
            <span class="migrationSectionSubtext">A exclusão só é liberada após a escolha</span>
          </div>

          <div class="migrationCategoryGrid" role="radiogroup" aria-label="Categorias de destino disponíveis">
            {#if destinationCategories.length === 0}
              <div class="migrationNoCategories">
                Nenhuma outra categoria disponível para receber os artigos.
              </div>
            {:else}
              {#each destinationCategories as targetCat (targetCat.label)}
                {@const isSelected = selectedTargetLabel === targetCat.label}
                {@const catColor = normalizeHexColor(targetCat.color, '#2563eb')}
                {@const normMetric = normalizeCategoryMetricType(targetCat.metricType, inferMetricTypeFromCategory(targetCat))}
                {@const isDefault = isDefaultCategory(targetCat.label)}
                <button
                  type="button"
                  class="migrationCategoryOption"
                  class:selected={isSelected}
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isMigrating}
                  on:click={() => handleSelectTarget(targetCat.label)}
                >
                  <div class="catOptionRadioCol">
                    <div class="migrationRadioIndicator" class:checked={isSelected}>
                      {#if isSelected}
                        <span class="radioDot"></span>
                      {/if}
                    </div>
                    <span class="catColorCircle" style="background-color: {catColor};" aria-hidden="true"></span>
                  </div>

                  <div class="catOptionTexts">
                    <div class="catOptionTitleRow">
                      <strong class="catOptionName">{targetCat.title || targetCat.label}</strong>
                      {#if isDefault}
                        <span class="migrationDefaultTag">Padrão</span>
                      {/if}
                    </div>
                    {#if targetCat.description}
                      <span class="catOptionDesc">{targetCat.description}</span>
                    {/if}
                  </div>

                  <div class="catOptionRight">
                    {#if normMetric === 'included'}
                      <span class="catMetricBadge metricIncluded">Incluído</span>
                    {:else if normMetric === 'excluded'}
                      <span class="catMetricBadge metricExcluded">Excluído</span>
                    {:else}
                      <span class="catMetricBadge metricPending">Pendente</span>
                    {/if}
                  </div>
                </button>
              {/each}
            {/if}
          </div>

          <!-- Dica ou confirmação visual de seleção -->
          {#if !selectedTargetLabel}
            <div class="migrationSelectHint warningHint" role="alert">
              <span>⚠️ Selecione uma categoria de destino acima para habilitar a exclusão.</span>
            </div>
          {:else}
            {@const chosenCat = destinationCategories.find(c => c.label === selectedTargetLabel)}
            <div class="migrationSelectHint successHint" role="status">
              <span>
                ✓ Os <strong>{linkedPapers.length}</strong> artigo(s) serão transferidos para a categoria <strong>"{chosenCat?.title || chosenCat?.label}"</strong> e a categoria <strong>"{categoryToDelete?.title || categoryToDelete?.label}"</strong> será excluída permanentemente.
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Rodapé com Botões de Ação -->
      <div class="migrationFooter">
        <button
          type="button"
          class="btn ghost"
          disabled={isMigrating}
          on:click={handleCancel}
        >
          Cancelar
        </button>

        <button
          id="btnConfirmCategoryMigration"
          type="button"
          class="btn btn-primary migrationConfirmBtn"
          class:ready={Boolean(selectedTargetLabel)}
          disabled={!selectedTargetLabel || isMigrating}
          on:click={handleConfirmMigration}
          title={!selectedTargetLabel ? "Selecione uma categoria de destino para prosseguir" : "Migrar artigos e excluir categoria"}
        >
          {#if isMigrating}
            <span class="savingSpinner" aria-hidden="true"></span>
            <span>Migrando artigos e excluindo...</span>
          {:else if !selectedTargetLabel}
            <span>Selecione a categoria de destino</span>
          {:else}
            <span>Migrar {linkedPapers.length} artigo(s) e excluir</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
