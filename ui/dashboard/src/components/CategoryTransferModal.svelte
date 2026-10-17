<script>
  import {
    projectStore,
    papersStore,
    isCategoryTransferModalOpenStore,
    categoryTransferInitialSourceStore,
    closeCategoryTransferModal,
    transferPapersBetweenCategoriesAction
  } from "../dashboardStore.js";
  import {
    getPapersForCategory,
    PAPER_METRIC_LABELS
  } from "../dashboardHelpers.js";

  let sourceCategoryLabel = "";
  let targetCategoryLabel = "";
  let phaseFilter = "";
  let selectedPaperIds = new Set();
  let paperSearchText = "";
  let isTransferring = false;
  let errorMessage = "";
  let successNotice = "";
  let wasOpen = false;
  let lastSelectionKey = "";

  $: isOpen = $isCategoryTransferModalOpenStore;
  $: initialSource = $categoryTransferInitialSourceStore;
  $: project = $projectStore || {};
  $: categories = Array.isArray(project.categories) ? project.categories : [];
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: allPapers = $papersStore || [];

  // Categorias de origem com a contagem de artigos
  $: categoriesWithCount = categories.map(cat => {
    const papers = getPapersForCategory(allPapers, cat.label);
    return {
      ...cat,
      count: papers.length
    };
  });

  // Categorias disponíveis para destino (todas exceto a categoria de origem selecionada)
  $: availableTargets = categories.filter(c => c.label !== sourceCategoryLabel);

  // Inicializa APENAS uma vez quando o modal transita de fechado para aberto
  $: if (isOpen && !wasOpen) {
    wasOpen = true;
    errorMessage = "";
    successNotice = "";
    isTransferring = false;
    paperSearchText = "";
    phaseFilter = "";

    const cats = Array.isArray(project.categories) ? project.categories : [];
    if (initialSource && cats.some(c => c.label === initialSource)) {
      sourceCategoryLabel = initialSource;
    } else {
      const withPapers = categoriesWithCount.find(c => c.count > 0);
      sourceCategoryLabel = withPapers ? withPapers.label : (cats[0]?.label || "");
    }

    const targets = cats.filter(c => c.label !== sourceCategoryLabel);
    targetCategoryLabel = targets[0]?.label || "";
  } else if (!isOpen && wasOpen) {
    wasOpen = false;
    lastSelectionKey = "";
  }

  // Manipulador de troca de categoria de origem
  function handleSourceChange(event) {
    const newSource = event.target.value;
    sourceCategoryLabel = newSource;
    const targets = categories.filter(c => c.label !== newSource);
    if (!targetCategoryLabel || targetCategoryLabel === newSource || !targets.some(c => c.label === targetCategoryLabel)) {
      targetCategoryLabel = targets[0]?.label || "";
    }
  }

  // Artigos correspondentes à categoria de origem e filtro de fase
  $: eligiblePapers = (() => {
    if (!sourceCategoryLabel) return [];
    let papers = getPapersForCategory(allPapers, sourceCategoryLabel);

    if (phaseFilter) {
      papers = papers.filter(p => {
        const classif = p.classifications?.[phaseFilter];
        if (classif && String(classif.categoryLabel || "").trim().toLowerCase() === String(sourceCategoryLabel).trim().toLowerCase()) {
          return true;
        }
        return String(p.categoryLabel || "").trim().toLowerCase() === String(sourceCategoryLabel).trim().toLowerCase() &&
          (p.phaseLabel === phaseFilter || p.iterationId === phaseFilter);
      });
    }

    return papers;
  })();

  // Quando a chave de origem ou fase mudar, seleciona todos os artigos elegíveis por padrão
  $: {
    const currentKey = `${sourceCategoryLabel}::${phaseFilter}`;
    if (currentKey !== lastSelectionKey) {
      lastSelectionKey = currentKey;
      selectedPaperIds = new Set(eligiblePapers.map(p => String(p.id)));
    }
  }

  // Filtragem visual da lista pelo campo de pesquisa
  $: filteredPapers = eligiblePapers.filter(paper => {
    if (!paperSearchText.trim()) return true;
    const q = paperSearchText.toLowerCase();
    const title = String(paper.title || paper.url || "").toLowerCase();
    const authors = String(paper.author || paper.authorsRaw || (Array.isArray(paper.authors) ? paper.authors.join(" ") : "")).toLowerCase();
    return title.includes(q) || authors.includes(q);
  });

  function handleSelectAll() {
    selectedPaperIds = new Set(eligiblePapers.map(p => String(p.id)));
  }

  function handleDeselectAll() {
    selectedPaperIds = new Set();
  }

  function togglePaperSelection(id) {
    const strId = String(id);
    const next = new Set(selectedPaperIds);
    if (next.has(strId)) {
      next.delete(strId);
    } else {
      next.add(strId);
    }
    selectedPaperIds = next;
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen && !isTransferring) {
      closeCategoryTransferModal();
    }
  }

  function getPaperAuthorsYear(paper) {
    const authors = Array.isArray(paper?.authors) && paper.authors.length > 0
      ? paper.authors.join(", ")
      : (paper?.author || paper?.authorsRaw || "Autor não informado");
    const year = paper?.year ? ` (${paper.year})` : "";
    return `${authors}${year}`;
  }

  function getPhaseName(pLabel) {
    if (!pLabel) return "";
    const ph = phases.find(p => p.label === pLabel || p.id === pLabel);
    return ph?.title || ph?.label || pLabel;
  }

  async function handleConfirmTransfer() {
    if (isTransferring) return;
    if (!sourceCategoryLabel || !targetCategoryLabel) {
      errorMessage = "Selecione as categorias de origem e destino.";
      return;
    }
    if (sourceCategoryLabel === targetCategoryLabel) {
      errorMessage = "A categoria de destino deve ser diferente da categoria de origem.";
      return;
    }
    if (selectedPaperIds.size === 0) {
      errorMessage = "Selecione pelo menos 1 artigo para transferir.";
      return;
    }

    errorMessage = "";
    isTransferring = true;

    try {
      const movedCount = await transferPapersBetweenCategoriesAction(
        sourceCategoryLabel,
        targetCategoryLabel,
        {
          phaseLabel: phaseFilter || null,
          paperIds: Array.from(selectedPaperIds)
        }
      );
      successNotice = `${movedCount} ${movedCount === 1 ? 'artigo transferido' : 'artigos transferidos'} com sucesso!`;
      setTimeout(() => {
        closeCategoryTransferModal();
      }, 700);
    } catch (err) {
      console.warn("Falha na transferência de categorias:", err);
      errorMessage = err?.message || "Ocorreu um erro ao transferir os artigos.";
      isTransferring = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="categoryTransferOverlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="transferModalTitle"
    on:click|self={() => { if (!isTransferring) closeCategoryTransferModal(); }}
    on:keydown|self={(e) => { if (e.key === 'Escape' && !isTransferring) closeCategoryTransferModal(); }}
  >
    <div class="categoryTransferCard">
      <!-- Linha decorativa superior -->
      <div class="transferAccentBar"></div>

      <!-- Cabeçalho do Modal -->
      <div class="transferHeader">
        <div class="transferHeaderRow">
          <div class="transferBadgeRow">
            <span class="transferBadge">
              <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="16 3 21 3 21 8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
              Reclassificação Metodológica
            </span>
            <span class="transferCountBadge">
              {eligiblePapers.length} {eligiblePapers.length === 1 ? 'artigo disponível' : 'artigos disponíveis'}
            </span>
          </div>

          <button
            type="button"
            class="transferCloseBtn"
            disabled={isTransferring}
            on:click={closeCategoryTransferModal}
            title="Fechar (Esc)"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        <h3 id="transferModalTitle" class="transferTitle">
          Mover Artigos entre Categorias
        </h3>
        <p class="transferDescription">
          Transfira artigos de uma categoria de origem para outra categoria de destino sem excluir nenhuma das categorias do projeto.
        </p>
      </div>

      <!-- Corpo com Seleção e Lista de Artigos -->
      <div class="transferBody u-scroll-y">
        {#if errorMessage}
          <div class="transferErrorBanner" role="alert">
            <span>⚠️ {errorMessage}</span>
          </div>
        {/if}

        {#if successNotice}
          <div class="transferSuccessBanner" role="status">
            <span>✓ {successNotice}</span>
          </div>
        {/if}

        <!-- Controles de Seleção de Categorias e Fase -->
        <div class="transferFormGrid">
          <!-- Categoria de Origem -->
          <div class="transferFormField">
            <label for="selectSourceCat" class="transferFormLabel">
              Categoria de Origem (De):
            </label>
            <div class="selectWrapper">
              <select
                id="selectSourceCat"
                class="transferSelect"
                value={sourceCategoryLabel}
                on:change={handleSourceChange}
                disabled={isTransferring}
              >
                {#each categoriesWithCount as cat (cat.label)}
                  <option value={cat.label}>
                    {cat.title || cat.label} ({cat.count} {cat.count === 1 ? 'artigo' : 'artigos'})
                  </option>
                {/each}
              </select>
            </div>
          </div>

          <!-- Categoria de Destino -->
          <div class="transferFormField">
            <label for="selectTargetCat" class="transferFormLabel">
              Categoria de Destino (Para):
            </label>
            <div class="selectWrapper">
              <select
                id="selectTargetCat"
                class="transferSelect"
                bind:value={targetCategoryLabel}
                disabled={isTransferring}
              >
                {#each availableTargets as cat (cat.label)}
                  {@const outcome = PAPER_METRIC_LABELS[cat.metricType] || 'Pendente'}
                  <option value={cat.label}>
                    {cat.title || cat.label} ({outcome})
                  </option>
                {/each}
              </select>
            </div>
          </div>

          <!-- Filtro de Fase -->
          <div class="transferFormField transferFormField--full">
            <label for="selectPhaseFilter" class="transferFormLabel">
              Escopo da Fase (Opcional):
            </label>
            <div class="selectWrapper">
              <select
                id="selectPhaseFilter"
                class="transferSelect"
                bind:value={phaseFilter}
                disabled={isTransferring}
              >
                <option value="">Todas as etapas da pesquisa</option>
                {#each phases as ph (ph.label || ph.id)}
                  <option value={ph.label || ph.id}>
                    Fase: {ph.title || ph.label}
                  </option>
                {/each}
              </select>
            </div>
          </div>
        </div>

        <!-- Seção de Artigos com Seleção Múltipla -->
        <div class="transferPapersSection">
          <div class="transferPapersToolbar">
            <div class="transferPapersTitle">
              <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>Artigos Selecionados ({selectedPaperIds.size} de {eligiblePapers.length})</span>
            </div>

            {#if eligiblePapers.length > 0}
              <div class="transferToolbarActions">
                <button
                  type="button"
                  class="btnLink"
                  disabled={isTransferring || selectedPaperIds.size === eligiblePapers.length}
                  on:click={handleSelectAll}
                >
                  Selecionar todos
                </button>
                <span class="dividerDot">·</span>
                <button
                  type="button"
                  class="btnLink"
                  disabled={isTransferring || selectedPaperIds.size === 0}
                  on:click={handleDeselectAll}
                >
                  Desmarcar todos
                </button>
              </div>
            {/if}
          </div>

          {#if eligiblePapers.length > 5}
            <div class="transferSearchBox">
              <input
                type="text"
                class="transferSearchInput"
                placeholder="Filtrar artigos por título ou autor..."
                bind:value={paperSearchText}
              />
            </div>
          {/if}

          <!-- Lista de Artigos Rolável -->
          {#if eligiblePapers.length === 0}
            <div class="transferEmptyPapers">
              <span>📭 Nenhum artigo encontrado nesta categoria{phaseFilter ? ' na fase selecionada' : ''}.</span>
            </div>
          {:else if filteredPapers.length === 0}
            <div class="transferEmptyPapers">
              <span>Nenhum artigo encontrado com o termo "{paperSearchText}".</span>
            </div>
          {:else}
            <div class="transferPapersList u-scroll-y">
              {#each filteredPapers as paper, idx (paper.id || paper.url || idx)}
                {@const isChecked = selectedPaperIds.has(String(paper.id))}
                <label class="transferPaperCard" class:transferPaperCard--selected={isChecked}>
                  <input
                    type="checkbox"
                    class="paperCheckbox"
                    checked={isChecked}
                    disabled={isTransferring}
                    on:change={() => togglePaperSelection(paper.id)}
                  />
                  <div class="paperIndexBadge">{idx + 1}</div>
                  <div class="paperInfoCol">
                    <span class="paperTitleText" title={paper.title || paper.url}>
                      {paper.title || paper.url || "(artigo sem título)"}
                    </span>
                    <div class="paperMetaRow">
                      <span class="paperAuthorsText">{getPaperAuthorsYear(paper)}</span>
                      {#if paper.phaseLabel}
                        <span class="paperPhaseTag">{getPhaseName(paper.phaseLabel)}</span>
                      {/if}
                    </div>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Rodapé com Botões de Ação -->
      <div class="transferFooter">
        <button
          type="button"
          class="btn ghost"
          disabled={isTransferring}
          on:click={closeCategoryTransferModal}
        >
          Cancelar
        </button>

        <button
          type="button"
          class="btn primary"
          disabled={isTransferring || selectedPaperIds.size === 0 || !targetCategoryLabel || sourceCategoryLabel === targetCategoryLabel}
          on:click={handleConfirmTransfer}
        >
          {#if isTransferring}
            <span class="spinner" aria-hidden="true"></span>
            <span>Transferindo artigos...</span>
          {:else}
            <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            <span>
              Mover {selectedPaperIds.size} {selectedPaperIds.size === 1 ? 'Artigo' : 'Artigos'}
            </span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
