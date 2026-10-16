<script>
  import {
    projectStore,
    papersStore,
    filteredPapersStore,
    highlightedLinksStore,
    activePhaseLabelStore,
    paperSearchQueryStore,
    paperPhaseFilterStore,
    paperMetricFilterStore,
    paperCategoryFilterStore,
    paperCurrentPhaseToggleStore,
    selectedPaperIdsStore,
    paperBulkStatusStore,
    currentSnowballParentIdStore,
    currentSnowballTitleStore,
    resetPaperFilters,
    setPaperFilterCurrentPhase,
    togglePaperSelection,
    selectAllPapers,
    updatePaperFieldAction,
    toggleSnowballParentAction,
    clearSnowballParent,
    openHistoryModal,
    requestPaperBulkOutcomeAction,
    bulkDeleteMarkedSelectedAction
  } from "../dashboardStore.js";
  import {
    fmtDate,
    hexToRgba,
    normalizeHexColor,
    getPaperCategoryKey,
    getPaperCategoryForPhase,
    getPaperCategoryColor,
    getPaperMetricTypeForPhase,
    getPaperMetricLabel,
    getPaperPhaseDisplay,
    paperBelongsToPhase,
    isPhaseCompleted,
    PAPER_BULK_ACTION_COPY,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory
  } from "../dashboardHelpers.js";

  $: phases = Array.isArray($projectStore?.phases) ? $projectStore.phases : [];
  $: categories = Array.isArray($projectStore?.categories) ? $projectStore.categories : [];
  $: activePhaseLabel = $activePhaseLabelStore || "";
  $: activePhase = phases.find(p => p.label === activePhaseLabel) || null;
  $: isPhaseLocked = !activePhase || isPhaseCompleted(activePhase);

  $: effectivePhase = $paperCurrentPhaseToggleStore
    ? activePhaseLabel
    : ($paperPhaseFilterStore === "active" ? activePhaseLabel : $paperPhaseFilterStore);

  $: selectedIds = $selectedPaperIdsStore;
  $: selectedCount = selectedIds.size;

  $: selectablePapers = $filteredPapersStore.filter((p) => {
    return !activePhaseLabel || paperBelongsToPhase(p, activePhaseLabel);
  });
  $: selectableIds = selectablePapers.map(p => String(p.id));

  $: allChecked = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  $: isIndeterminate = selectableIds.some(id => selectedIds.has(id)) && !allChecked;

  function handleCheckAllChange(e) {
    selectAllPapers(e.target.checked, selectableIds);
  }

  function handleCurrentPhaseToggle(e) {
    setPaperFilterCurrentPhase(e.target.checked);
  }

  function getBulkOutcomeButtonInfo(outcome) {
    const copy = PAPER_BULK_ACTION_COPY[outcome] || PAPER_BULK_ACTION_COPY.pending;
    if (!activePhase) {
      return { disabled: true, title: "Crie uma fase antes de classificar artigos." };
    }
    if (isPhaseLocked) {
      return { disabled: true, title: "A fase ativa está concluída. Crie a próxima fase ou reabra a atual antes de alterar a triagem." };
    }
    if (!selectedCount) {
      return { disabled: true, title: "Selecione pelo menos um artigo." };
    }

    const allowedLabels = new Set(Array.isArray(activePhase.categories) ? activePhase.categories : []);
    const matching = categories
      .filter(cat => allowedLabels.has(cat.label))
      .filter(cat => normalizeCategoryMetricType(cat.metricType, inferMetricTypeFromCategory(cat)) === outcome);

    if (!matching.length) {
      return { disabled: false, unavailable: true, title: `A fase ativa não possui uma categoria vinculada ao resultado ${copy.result}.` };
    }
    if (matching.length === 1) {
      return { disabled: false, title: `${copy.button} usando a categoria “${matching[0].title || matching[0].label}”.` };
    }
    return { disabled: false, title: `${copy.button}: escolha uma das ${matching.length} categorias compatíveis da fase ativa.` };
  }

  $: isFilteringActive = $paperSearchQueryStore ||
    $paperMetricFilterStore !== "all" ||
    $paperCategoryFilterStore !== "all" ||
    !$paperCurrentPhaseToggleStore;
</script>

<section class="view" id="view_papers" style="position: relative;">
  <!-- Filters panel -->
  <div class="paperFiltersPanel" aria-label="Filtros dos artigos">
    <label class="paperCurrentPhaseToggle">
      <input
        type="checkbox"
        checked={$paperCurrentPhaseToggleStore}
        on:change={handleCurrentPhaseToggle}
      />
      <span>Artigos da fase atual</span>
    </label>

    <select
      class="input paperFilterSelect"
      aria-label="Filtrar por fase"
      disabled={$paperCurrentPhaseToggleStore}
      bind:value={$paperPhaseFilterStore}
    >
      <option value="all">Todas as fases</option>
      {#each phases as phase (phase.label)}
        <option value={phase.label}>{phase.title || phase.label}</option>
      {/each}
    </select>

    <select
      class="input paperFilterSelect"
      aria-label="Filtrar por situação"
      bind:value={$paperMetricFilterStore}
    >
      <option value="all">Todas as situações</option>
      <option value="included">Incluídos</option>
      <option value="excluded">Excluídos</option>
      <option value="pending">Pendentes</option>
    </select>

    <select
      class="input paperFilterSelect"
      aria-label="Filtrar por categoria"
      bind:value={$paperCategoryFilterStore}
    >
      <option value="all">Todas as categorias</option>
      {#each categories as category (category.label)}
        <option value={getPaperCategoryKey(category)}>
          {category.title || category.label}
        </option>
      {/each}
    </select>

    <button
      type="button"
      class="btn"
      on:click={resetPaperFilters}
    >
      Limpar filtros
    </button>

    {#if $currentSnowballParentIdStore}
      <div
        id="snowballContextBanner"
        style="margin-left: auto; display: flex; align-items: center; color: var(--accent); font-weight: bold; font-size: 13px; gap: 8px;"
      >
        <span
          style="display: inline-block; width: 8px; height: 8px; background-color: #22C55E; border-radius: 50%; box-shadow: 0 0 4px #22C55E;"
        ></span>
        <span>
          Snowballing ativo: {$currentSnowballTitleStore || $currentSnowballParentIdStore}
        </span>
        <button
          type="button"
          class="btn small ghost"
          style="padding: 2px 8px; font-size: 11px;"
          on:click={clearSnowballParent}
        >
          Parar
        </button>
      </div>
    {/if}
  </div>

  <!-- Toolbar & bulk actions -->
  <div class="toolbar papersToolbar">
    <input
      class="input"
      placeholder="Buscar por título, autor, ano, tag ou fase…"
      bind:value={$paperSearchQueryStore}
    />

    <div class="paperBulkActions" aria-label="Ações para os artigos selecionados">
      <span class="paperSelectionCount" aria-live="polite">
        {selectedCount} selecionado{selectedCount === 1 ? "" : "s"}
      </span>

      <button
        class="btn paperBulkUnmarkBtn"
        type="button"
        disabled={isPhaseLocked || selectedCount === 0}
        title={isPhaseLocked
          ? "A fase ativa está concluída e não pode ser alterada."
          : (selectedCount === 0
            ? "Selecione pelo menos um artigo."
            : "Retirar os artigos selecionados da fase ativa, sem classificá-los como removidos.")}
        on:click={bulkDeleteMarkedSelectedAction}
      >
        Remover marcados
      </button>

      <span class="paperBulkDivider" aria-hidden="true"></span>

      {#each ["included", "excluded", "pending"] as outcome}
        {@const info = getBulkOutcomeButtonInfo(outcome)}
        <button
          class="btn paperBulkOutcomeBtn paperBulkOutcomeBtn--{outcome}"
          class:paperBulkOutcomeBtn--unavailable={info.unavailable}
          type="button"
          disabled={info.disabled}
          title={info.title}
          on:click={() => requestPaperBulkOutcomeAction(outcome)}
        >
          {PAPER_BULK_ACTION_COPY[outcome].button}
        </button>
      {/each}
    </div>

    {#if $paperBulkStatusStore.message}
      <span
        class="paperBulkStatus paperBulkStatus--{$paperBulkStatusStore.tone}"
        role="status"
        aria-live="polite"
      >
        {$paperBulkStatusStore.message}
      </span>
    {/if}
  </div>

  <!-- Active filter summary bar -->
  {#if isFilteringActive}
    <div
      class="paperFilterBar"
      role="status"
      aria-live="polite"
    >
      <span>
        Exibindo {$filteredPapersStore.length} de {$papersStore.length} artigos
        {#if $paperSearchQueryStore}
          • Busca: “{$paperSearchQueryStore}”
        {/if}
        {#if $paperMetricFilterStore !== 'all'}
          • {getPaperMetricLabel($paperMetricFilterStore)}
        {/if}
        {#if $paperCategoryFilterStore !== 'all'}
          • Categoria: {$paperCategoryFilterStore}
        {/if}
        {#if !$paperCurrentPhaseToggleStore && $paperPhaseFilterStore !== 'all'}
          • Fase: {$paperPhaseFilterStore}
        {/if}
      </span>
      <button
        type="button"
        class="btn"
        on:click={resetPaperFilters}
      >
        Limpar filtro
      </button>
    </div>
  {/if}

  <!-- Papers Table -->
  <div class="tableWrap papersTableWrap">
    <table class="table" id="papersTable">
      <thead>
        <tr>
          <th style="width:36px">
            <input
              type="checkbox"
              id="checkAll"
              checked={allChecked}
              indeterminate={isIndeterminate}
              disabled={selectableIds.length === 0}
              on:change={handleCheckAllChange}
            />
          </th>
          <th>Título</th>
          <th style="width:72px">Ano</th>
          <th style="width:190px">Fases</th>
          <th style="width:230px">Categoria</th>
          <th style="width:150px">Tags</th>
          <th style="width:120px">Links / Origem</th>
        </tr>
      </thead>
      <tbody>
        {#each $filteredPapersStore as p (p.id || p.url)}
          {@const category = getPaperCategoryForPhase(p, effectivePhase, categories, $highlightedLinksStore)}
          {@const metricType = getPaperMetricTypeForPhase(p, effectivePhase, categories, $highlightedLinksStore)}
          {@const categoryColor = getPaperCategoryColor(p, categories, $highlightedLinksStore)}
          {@const phaseDisplay = getPaperPhaseDisplay(p, phases)}
          {@const belongsToActive = !activePhaseLabel || paperBelongsToPhase(p, activePhaseLabel)}
          {@const isSnowballActive = $currentSnowballParentIdStore === String(p.id)}
          {@const categoryDisplayLabel = p.autoDuplicate
            ? "Duplicado automático"
            : (category?.title || category?.label || "Sem categoria")}

          <tr
            class={categoryColor ? "paperCategoryRow" : ""}
            style={categoryColor
              ? `--paper-category-color:${categoryColor};--paper-category-tint:${hexToRgba(categoryColor, 0.25)};--paper-category-tint-hover:${hexToRgba(categoryColor, 0.50)}`
              : ""}
          >
            <td>
              <input
                type="checkbox"
                class="rowCheck"
                checked={selectedIds.has(String(p.id))}
                disabled={!belongsToActive}
                title={belongsToActive ? "" : "Artigo de outra fase: disponível apenas para consulta"}
                on:change={(e) => togglePaperSelection(p.id, e.target.checked)}
              />
            </td>

            <td>
              <div class="paperTitleWrap">
                <button
                  type="button"
                  class="linkBtn"
                  title="Ver histórico"
                  on:click={() => openHistoryModal(p)}
                >
                  {p.title || "(sem título)"}
                </button>
              </div>
              <div style="color:#666;font-size:11px;margin-top:4px">
                {p.authorsRaw || ""} • {fmtDate(p.createdAt)}
              </div>
            </td>

            <td>
              <input
                class="cellInput"
                value={p.year ?? ""}
                placeholder="—"
                style="width:64px"
                on:change={(e) => updatePaperFieldAction(p.id, "year", e.target.value)}
              />
            </td>

            <td>
              <span class="paperPhaseBadge" title={phaseDisplay}>
                {phaseDisplay}
              </span>
            </td>

            <td>
              <span class="paperCategoryCell">
                <span class="categoryBadge">
                  {#if categoryColor}
                    <span
                      class="paperCategoryMarker"
                      style="background:{categoryColor}"
                      aria-hidden="true"
                    ></span>
                  {/if}
                  <span>{categoryDisplayLabel}</span>
                </span>
                <span class="paperOutcomeBadge paperOutcomeBadge--{metricType}">
                  {getPaperMetricLabel(metricType)}
                </span>
              </span>
            </td>

            <td>
              <input
                class="cellInput"
                value={Array.isArray(p.tags) ? p.tags.join(";") : ""}
                placeholder="ex: vis;ml"
                on:change={(e) => updatePaperFieldAction(p.id, "tags", e.target.value)}
              />
            </td>

            <td>
              <div style="display:flex;gap:4px;align-items:center;">
                {#if p.url}
                  <a
                    class="link"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir
                  </a>
                {/if}

                <button
                  type="button"
                  class="btn ghost small snowballBtn"
                  class:active={isSnowballActive}
                  style={isSnowballActive ? "background:var(--accent);color:white;border-color:var(--accent);" : ""}
                  title={isSnowballActive
                    ? "Snowballing ativo (clique para cancelar)"
                    : "Iniciar Snowballing a partir deste artigo"}
                  aria-label="Snowballing"
                  on:click={() => toggleSnowballParentAction(p.id, p.title || "(sem título)")}
                >
                  🔗
                </button>
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" style="text-align: center; color: #888; padding: 28px;">
              {#if $papersStore.length === 0}
                Nenhum artigo marcado neste projeto ainda. Adicione artigos usando a extensão no Google Scholar!
              {:else}
                Nenhum artigo encontrado para os filtros selecionados.
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
