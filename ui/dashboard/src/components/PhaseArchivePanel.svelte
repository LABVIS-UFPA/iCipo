<script>
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    getPhaseArchiveRecords,
    normalizeMetricType,
    normalizeHexColor,
    hexToRgba,
    formatOverviewDate,
    extractPaperYear,
    getPaperAuthorsText,
    isPhaseCompleted,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory,
    normalizeStr,
    isPaperLockedInActivePhase
  } from '../dashboardHelpers.js';
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    expandedCompletedPhaseStore,
    paperBulkStatusStore,
    currentSnowballParentIdStore,
    currentSnowballTitleStore,
    paperMetricFilterStore,
    paperCategoryFilterStore,
    paperSearchQueryStore,
    updatePaperFieldAction,
    toggleSnowballParentAction,
    clearSnowballParent,
    openHistoryModal,
    phaseArticlesViewModeStore,
    setPhaseArticlesViewMode,
    classifySinglePaperAction,
    unmarkSinglePaperAction,
    showNotice
  } from '../dashboardStore.js';

  export let phase = {};
  export let index = 0;
  export let totalPhases = 1;
  export let isActivePhase = false;

  // Garante reatividade com projectStore para atualizar sempre que o projeto ou artigos mudarem
  $: activePhaseObj = ($projectStore?.phases || []).find(p => p.label === phase.label) || phase;
  $: isCompleted = isPhaseCompleted(activePhaseObj);
  $: records = getPhaseArchiveRecords(activePhaseObj, $papersStore);
  $: categories = Array.isArray($projectStore?.categories) ? $projectStore.categories : [];

  $: phaseCategoryLabels = Array.isArray(activePhaseObj.categories) ? activePhaseObj.categories : [];
  $: phaseCategories = phaseCategoryLabels
    .map((clabel) => categories.find((c) => c.label === clabel))
    .filter(Boolean);

  $: inheritedCount = records.filter(r => r.inherited).length;
  $: pendingCount = records.filter(r => !r.inherited && normalizeMetricType(r.outcome, 'pending') === 'pending').length;
  $: selectedCount = records.filter(r => !r.inherited && normalizeMetricType(r.outcome, 'pending') === 'included').length;
  $: removedCount = records.filter(r => !r.inherited && (normalizeMetricType(r.outcome, 'pending') === 'excluded' || r.outcome === 'duplicate')).length;

  // Filtros locais sincronizados com os stores
  let activeFilter = $paperMetricFilterStore || 'all'; // 'all' | 'inherited' | 'pending' | 'included' | 'excluded'
  let searchQuery = $paperSearchQueryStore || '';
  let selectedCategoryFilter = $paperCategoryFilterStore || 'all';
  $: viewMode = $phaseArticlesViewModeStore || 'cards'; // 'cards' | 'table' persistido
  let copiedId = null;

  // Mantém sincronização caso um filtro externo mude
  $: if ($paperMetricFilterStore && $paperMetricFilterStore !== activeFilter) {
    activeFilter = $paperMetricFilterStore;
  }
  $: if ($paperCategoryFilterStore && $paperCategoryFilterStore !== selectedCategoryFilter) {
    selectedCategoryFilter = $paperCategoryFilterStore;
  }
  $: if ($paperSearchQueryStore !== undefined && $paperSearchQueryStore !== searchQuery) {
    searchQuery = $paperSearchQueryStore;
  }

  function handleFilterPillClick(filt) {
    activeFilter = filt;
    paperMetricFilterStore.set(filt);
  }

  function handleCategoryFilterChange(e) {
    selectedCategoryFilter = e.target.value;
    paperCategoryFilterStore.set(selectedCategoryFilter);
  }

  function handleSearchInput(e) {
    searchQuery = e.target.value;
    paperSearchQueryStore.set(searchQuery);
  }

  function handleClearSearch() {
    searchQuery = '';
    paperSearchQueryStore.set('');
  }

  function handleResetFilters() {
    searchQuery = '';
    activeFilter = 'all';
    selectedCategoryFilter = 'all';
    paperSearchQueryStore.set('');
    paperMetricFilterStore.set('all');
    paperCategoryFilterStore.set('all');
  }

  // Filtragem inteligente de registros
  $: filteredRecords = records.filter(record => {
    // Filtro por desfecho
    const norm = normalizeMetricType(record.outcome, 'pending');
    if (activeFilter === 'inherited' && !record.inherited) return false;
    if (activeFilter === 'pending' && (record.inherited || norm !== 'pending')) return false;
    if (activeFilter === 'included' && (record.inherited || norm !== 'included')) return false;
    if (activeFilter === 'excluded' && (record.inherited || (norm !== 'excluded' && record.outcome !== 'duplicate'))) return false;

    // Filtro por categoria
    if (selectedCategoryFilter !== 'all') {
      const catLabel = String(record?.categoryLabel || '').trim().toLowerCase();
      if (catLabel !== selectedCategoryFilter.toLowerCase()) return false;
    }

    // Busca textual e sintaxe id: / parent:
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      if (q.startsWith('id:')) {
        const targetId = q.replace('id:', '').trim();
        if (String(record.paper?.id) !== targetId) return false;
      } else if (q.startsWith('parent:')) {
        const targetId = q.replace('parent:', '').trim();
        if (String(record.paper?.parentPaperId) !== targetId) return false;
      } else {
        const normQ = normalizeStr(q);
        const title = normalizeStr(record.paper?.title || '');
        const authors = normalizeStr(getPaperAuthorsText(record.paper) || '');
        const year = String(extractPaperYear(record.paper) || '');
        const venue = normalizeStr(record.paper?.venue || record.paper?.journal || record.paper?.publisher || '');
        const tags = Array.isArray(record.paper?.tags) ? normalizeStr(record.paper.tags.join(' ')) : '';
        const notes = normalizeStr(record.classification?.notes || record.paper?.notes || '');
        if (!title.includes(normQ) && !authors.includes(normQ) && !year.includes(normQ) && !venue.includes(normQ) && !tags.includes(normQ) && !notes.includes(normQ)) {
          return false;
        }
      }
    }

    return true;
  });



  // Ações Diretas em Artigo Único (Incluir, Excluir, Pendente, Remover Marcado)
  function handleSinglePaperOutcome(paper, outcome) {
    if (isCompleted) {
      showNotice("Esta fase está marcada como concluída. Reabra a fase em 'Editar' para alterar a triagem.", "warning");
      return;
    }
    if (isPaperLockedInActivePhase(paper, activePhaseObj?.label)) {
      showNotice("Artigos herdados de fases anteriores já foram validados e não podem ser reclassificados.", "warning");
      return;
    }
    classifySinglePaperAction(paper, outcome, activePhaseObj.label);
  }

  function handleSinglePaperUnmark(paper) {
    if (isCompleted) {
      showNotice("Esta fase está marcada como concluída. Reabra a fase em 'Editar' para alterar a triagem.", "warning");
      return;
    }
    if (isPaperLockedInActivePhase(paper, activePhaseObj?.label)) {
      showNotice("Artigos herdados de fases anteriores são validados e não podem ser removidos.", "warning");
      return;
    }
    unmarkSinglePaperAction(paper, activePhaseObj.label);
  }

  function handleClose() {
    expandedCompletedPhaseStore.set(null);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }

  function handleCopyTitle(record) {
    const text = record.paper?.title || '';
    if (!text) return;
    navigator.clipboard?.writeText(text);
    copiedId = record.key;
    setTimeout(() => {
      if (copiedId === record.key) copiedId = null;
    }, 1800);
  }

  function getCategoryInfo(record) {
    const categoryLabel = String(record?.categoryLabel || '').trim().toLowerCase();
    let matched = null;
    if (categoryLabel) {
      matched = categories.find(cat => {
        const l = String(cat?.label || '').trim().toLowerCase();
        const t = String(cat?.title || '').trim().toLowerCase();
        return l === categoryLabel || t === categoryLabel;
      });
    }
    if (!matched) {
      const normOutcome = normalizeMetricType(record?.outcome, 'pending');
      matched = categories.find(cat => normalizeCategoryMetricType(cat?.metricType, inferMetricTypeFromCategory(cat)) === normOutcome)
        || categories[0];
    }
    return {
      color: normalizeHexColor(matched?.color, '#2eae6c'),
      name: matched?.title || matched?.label || 'Pendente'
    };
  }

  function getOutcomeInfo(record) {
    if (record.inherited || isPaperLockedInActivePhase(record.paper, activePhaseObj?.label)) {
      return { label: 'Validado', cls: 'outcome--included', icon: '✓' };
    }
    const norm = normalizeMetricType(record.outcome, 'pending');
    if (norm === 'included') {
      return { label: 'Aprovado', cls: 'outcome--included', icon: '✅' };
    }
    if (norm === 'excluded') {
      return { label: 'Excluído', cls: 'outcome--excluded', icon: '❌' };
    }
    if (record.outcome === 'duplicate') {
      return { label: 'Duplicado', cls: 'outcome--excluded', icon: '🔁' };
    }
    return { label: 'Pendente', cls: 'outcome--pending', icon: '⏳' };
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Overlay que fecha a aba lateral ao clicar fora -->
<div
  class="sideOverlay open phaseArchiveOverlay"
  on:click={handleClose}
  aria-hidden="true"
  transition:fade={{ duration: 320 }}
></div>

<div
  class="phaseArchivePanel is-open"
  role="dialog"
  aria-modal="true"
  aria-labelledby="phaseArchiveMainTitle"
  transition:fly={{ x: 1200, duration: 400, opacity: 1, easing: cubicOut }}
>
  <!-- Cabeçalho da Gaveta com Etapa, Status e Fechar -->
  <div class="phaseArchiveHeader">
    <div class="phaseArchiveHeaderText">
      <div class="phaseArchiveStepRow">
        <span class="phaseArchiveEyebrow">
          Etapa {index + 1} de {totalPhases}
        </span>
        {#if isCompleted}
          <span class="statusBadge badgeDone">✓ Concluída</span>
        {:else if isActivePhase}
          <span class="statusBadge badgeActive"><span class="pulsePoint"></span> Fase Ativa</span>
        {:else}
          <span class="statusBadge badgePlanned">⏱ Planejada</span>
        {/if}
      </div>

      <h3 id="phaseArchiveMainTitle" class="phaseArchiveTitle">
        {activePhaseObj.title || `Fase ${index + 1}`} · Artigos
      </h3>

      {#if isCompleted}
        <p class="phaseArchiveDescription">
          Fase concluída e protegida: artigos avaliados nesta etapa gravados para integridade e auditoria metodológica.
        </p>
      {:else if !isActivePhase}
        <p class="phaseArchiveDescription">
          Fase planejada: gerencie artigos e critérios desta etapa.
        </p>
      {/if}
    </div>

    <button
      class="btn phaseArchiveCloseBtn"
      type="button"
      on:click={handleClose}
      title="Fechar artigos da fase (Esc)"
      aria-label="Fechar"
    >
      ✕
    </button>
  </div>

  <!-- Banner de Snowballing Ativo (se houver) -->
  {#if $currentSnowballParentIdStore}
    <div class="phaseSnowballBanner" role="status" aria-live="polite">
      <div class="phaseSnowballBannerLeft">
        <span class="snowballPulseDot"></span>
        <span class="phaseSnowballBannerText">
          <strong>Snowballing ativo:</strong> {$currentSnowballTitleStore || $currentSnowballParentIdStore}
        </span>
      </div>
      <button
        type="button"
        class="btn small ghost phaseSnowballStopBtn"
        on:click={clearSnowballParent}
        title="Encerrar o modo Snowballing a partir deste artigo"
      >
        Parar Snowballing
      </button>
    </div>
  {/if}

  <!-- Filtros Rápidos com Contadores Clicáveis -->
  <div class="phaseArchiveSummary">
    <button
      type="button"
      class="phaseArchiveSummaryItem"
      class:active={activeFilter === 'all'}
      on:click={() => handleFilterPillClick('all')}
      title="Exibir todos os artigos desta fase"
    >
      <span>Todos</span>
      <strong>{records.length}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--inherited"
      class:active={activeFilter === 'inherited'}
      on:click={() => handleFilterPillClick('inherited')}
      title="Filtrar artigos herdados da fase anterior"
    >
      <span style="display:inline-flex;align-items:center;gap:5px">
        <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
        <span>Herdados</span>
      </span>
      <strong>{inheritedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--pending"
      class:active={activeFilter === 'pending'}
      on:click={() => handleFilterPillClick('pending')}
      title="Filtrar artigos pendentes de avaliação"
    >
      <span style="display:inline-flex;align-items:center;gap:5px">
        <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
        </svg>
        <span>Pendentes</span>
      </span>
      <strong>{pendingCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--selected"
      class:active={activeFilter === 'included'}
      on:click={() => handleFilterPillClick('included')}
      title="Filtrar artigos aprovados para avançar"
    >
      <span style="display:inline-flex;align-items:center;gap:5px">
        <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Aprovados</span>
      </span>
      <strong>{selectedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--removed"
      class:active={activeFilter === 'excluded'}
      on:click={() => handleFilterPillClick('excluded')}
      title="Filtrar artigos excluídos ou duplicados"
    >
      <span style="display:inline-flex;align-items:center;gap:5px">
        <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Excluídos</span>
      </span>
      <strong>{removedCount}</strong>
    </button>
  </div>

  <!-- Barra de Busca, Filtro de Categoria e Alternância de Visualização -->
  <div class="phaseArchiveToolbar">
    <div class="phaseArchiveSearchRow">
      <div class="phaseArchiveSearchWrap">
        <input
          type="text"
          class="phaseArchiveSearchInput"
          placeholder="Buscar..."
          aria-label="Buscar artigos"
          value={searchQuery}
          on:input={handleSearchInput}
        />
        {#if searchQuery}
          <button
            type="button"
            class="phaseArchiveClearBtn"
            on:click={handleClearSearch}
            title="Limpar busca"
          >
            ✕
          </button>
        {/if}
      </div>

      {#if phaseCategories.length > 0}
        <select
          class="phaseArchiveCategorySelect"
          value={selectedCategoryFilter}
          on:change={handleCategoryFilterChange}
          title="Filtrar por categoria atribuída"
        >
          <option value="all">Todas as categorias</option>
          {#each phaseCategories as cat}
            <option value={cat.label}>{cat.title || cat.label}</option>
          {/each}
        </select>
      {/if}

      <div class="phaseArchiveViewToggle" role="group" aria-label="Modo de visualização">
        <button
          type="button"
          class="viewToggleBtn"
          class:active={viewMode === 'cards'}
          on:click={() => setPhaseArticlesViewMode('cards')}
          title="Visualizar em cartões com detalhes completos"
        >
          <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Cartões</span>
        </button>
        <button
          type="button"
          class="viewToggleBtn"
          class:active={viewMode === 'table'}
          on:click={() => setPhaseArticlesViewMode('table')}
          title="Visualizar em tabela analítica compacta"
        >
          <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18"/>
          </svg>
          <span>Tabela</span>
        </button>
      </div>
    </div>

    <div class="phaseArchiveMetaRow">
      <span class="phaseArchiveMetaCount">
        Exibindo <strong>{filteredRecords.length}</strong> de {records.length} artigos
        {#if searchQuery || activeFilter !== 'all' || selectedCategoryFilter !== 'all'}
          · <button type="button" class="phaseArchiveResetLink" on:click={handleResetFilters}>Limpar filtros</button>
        {/if}
      </span>
    </div>
  </div>

  <!-- Feedback de Status de Ações -->
  {#if $paperBulkStatusStore.message}
    <div
      class="phaseBulkStatusBanner phaseBulkStatusBanner--{$paperBulkStatusStore.tone}"
      role="status"
      aria-live="polite"
    >
      <span>{$paperBulkStatusStore.message}</span>
    </div>
  {/if}

  <!-- Lista de Artigos: Modo Cartões ou Modo Tabela -->
  <div class="phaseArchiveContentWrap u-scroll-y">
    {#if records.length === 0}
      <div class="phaseArchiveEmpty">
        <div style="font-size:32px;margin-bottom:8px">📭</div>
        <strong>Nenhum artigo registrado nesta fase</strong>
        <p style="margin:6px 0 0;color:#64748b;max-width:380px;">
          Marque artigos no Google Scholar com a extensão ou avance a fase anterior para herdar os artigos aprovados.
        </p>
      </div>
    {:else if filteredRecords.length === 0}
      <div class="phaseArchiveEmpty">
        <div style="font-size:32px;margin-bottom:8px">🔍</div>
        <strong>Nenhum artigo encontrado</strong>
        <p style="margin:6px 0 12px;color:#64748b">
          Nenhum artigo corresponde aos critérios de busca ou filtros selecionados.
        </p>
        <button
          type="button"
          class="btn small"
          on:click={handleResetFilters}
        >
          Limpar todos os filtros
        </button>
      </div>
    {:else if viewMode === 'table'}
      <!-- MODO TABELA ANALÍTICA -->
      <div class="phaseTableContainer">
        <table class="phaseTable" id="phaseArticlesTable">
          <thead>
            <tr>
              <th class="phaseColTitle">Título / Autores</th>
              <th class="phaseColYear">Ano</th>
              <th class="phaseColOutcome">Desfecho</th>
              <th class="phaseColCategory">Categoria</th>
              <th class="phaseColTags">Tags</th>
              <th class="phaseColTriage">Decisão</th>
              <th class="phaseColActions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredRecords as record (record.key)}
              {@const catInfo = getCategoryInfo(record)}
              {@const outcomeInfo = getOutcomeInfo(record)}
              {@const isSnowballActive = $currentSnowballParentIdStore === String(record.paper?.id)}
              {@const paperId = record.paper?.id}
              {@const isLocked = Boolean(record.inherited || isPaperLockedInActivePhase(record.paper, activePhaseObj?.label))}

              <tr style={catInfo.color ? `--row-cat-color:${catInfo.color}` : ""}>

                <td class="phaseTableCellTitle">
                  <div class="phaseTableTitleWrap">
                    <button
                      type="button"
                      class="phaseTableTitleLink"
                      title="Ver linha do tempo e auditoria deste artigo"
                      on:click={() => openHistoryModal(record.paper)}
                    >
                      {record.paper?.title || record.paper?.url || '(sem título)'}
                    </button>
                  </div>
                  <div class="phaseTableAuthors">
                    {getPaperAuthorsText(record.paper)}
                    {#if record.paper?.venue}
                      · <em>{record.paper.venue}</em>
                    {/if}
                  </div>
                </td>

                <td class="phaseTableCellYear">
                  <input
                    class="cellInput phaseInlineYear"
                    value={extractPaperYear(record.paper) || ""}
                    placeholder="—"
                    disabled={isCompleted}
                    title="Editar ano de publicação"
                    on:change={(e) => updatePaperFieldAction(paperId, "year", e.target.value)}
                  />
                </td>

                <td class="phaseTableCellOutcome">
                  <span class="phaseArchiveOutcome {outcomeInfo.cls}">
                    <span class="outcomeIcon" aria-hidden="true">{outcomeInfo.icon}</span>
                    <span>{outcomeInfo.label}</span>
                  </span>
                </td>

                <td class="phaseTableCellCategory">
                  <span class="phaseArchiveCategoryBadge" title="Categoria: {catInfo.name}">
                    <i style="background: {catInfo.color}"></i>
                    <span>{catInfo.name}</span>
                  </span>
                </td>

                <td class="phaseTableCellTags">
                  <input
                    class="cellInput phaseInlineTags"
                    value={Array.isArray(record.paper?.tags) ? record.paper.tags.join(";") : ""}
                    placeholder="ex: vis;ml"
                    disabled={isCompleted}
                    title="Editar tags (separadas por ponto-e-vírgula)"
                    on:change={(e) => updatePaperFieldAction(paperId, "tags", e.target.value)}
                  />
                </td>

                <!-- Coluna de Botões Diretos de Triagem Individual na Tabela -->
                <td class="phaseTableCellTriage">
                  {#if isLocked}
                    <span class="phaseValidatedBadge" title="Artigo validado e herdado da fase anterior">Validado</span>
                  {:else}
                    <div class="phaseTableTriageGroup">
                      <button
                        type="button"
                        class="phaseTableTriageBtn phaseTableTriageBtn--included"
                        class:active={outcomeInfo.label === 'Aprovado'}
                        disabled={isCompleted}
                        title="Classificar artigo como Incluído (Aprovado)"
                        on:click={() => handleSinglePaperOutcome(record.paper, 'included')}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="phaseTableTriageBtn phaseTableTriageBtn--excluded"
                        class:active={outcomeInfo.label === 'Excluído' || outcomeInfo.label === 'Duplicado'}
                        disabled={isCompleted}
                        title="Classificar artigo como Excluído"
                        on:click={() => handleSinglePaperOutcome(record.paper, 'excluded')}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        class="phaseTableTriageBtn phaseTableTriageBtn--pending"
                        class:active={outcomeInfo.label === 'Pendente'}
                        disabled={isCompleted}
                        title="Classificar artigo como Pendente"
                        on:click={() => handleSinglePaperOutcome(record.paper, 'pending')}
                      >
                        ⏳
                      </button>
                      <button
                        type="button"
                        class="phaseTableTriageBtn phaseTableTriageBtn--unmark"
                        disabled={isCompleted}
                        title="Remover marcação deste artigo desta fase"
                        on:click={() => handleSinglePaperUnmark(record.paper)}
                      >
                        🗑
                      </button>
                    </div>
                  {/if}
                </td>

                <td class="phaseTableCellActions">
                  <div class="phaseTableActionButtons">
                    {#if record.paper?.url}
                      <a
                        class="phaseMiniIconBtn"
                        href={record.paper.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir link original"
                      >
                        ↗
                      </a>
                    {/if}

                    <button
                      type="button"
                      class="phaseMiniIconBtn"
                      class:active={isSnowballActive}
                      title={isSnowballActive ? "Snowballing ativo (clique para cancelar)" : "Iniciar Snowballing a partir deste artigo"}
                      on:click={() => toggleSnowballParentAction(paperId, record.paper?.title || "(sem título)")}
                    >
                      🔗
                    </button>

                    <button
                      type="button"
                      class="phaseMiniIconBtn"
                      title="Ver histórico de alterações"
                      on:click={() => openHistoryModal(record.paper)}
                    >
                      📜
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <!-- MODO CARTÕES DETALHADOS -->
      <div class="phaseArchiveArticleList">
        {#each filteredRecords as record (record.key)}
          {@const catInfo = getCategoryInfo(record)}
          {@const outcomeInfo = getOutcomeInfo(record)}
          {@const authors = getPaperAuthorsText(record.paper)}
          {@const year = extractPaperYear(record.paper)}
          {@const venue = record.paper?.venue || record.paper?.journal || record.paper?.publisher}
          {@const paperId = record.paper?.id}
          {@const isSnowballActive = $currentSnowballParentIdStore === String(paperId)}
          {@const isLocked = Boolean(record.inherited || isPaperLockedInActivePhase(record.paper, activePhaseObj?.label))}

          <article
            class="phaseArchiveArticleCard"
            style={catInfo.color ? `--cat-color-border:${catInfo.color}` : ''}
          >
            <!-- Topo do Card com Badges e Ações Rápidas -->
            <div class="phaseArchiveCardTop">
              <div class="phaseArchiveCardBadges">
                <span class="phaseArchiveOutcome {outcomeInfo.cls}" title="Desfecho do artigo nesta etapa">
                  <span class="outcomeIcon" aria-hidden="true">{outcomeInfo.icon}</span>
                  <span>{outcomeInfo.label}</span>
                </span>

                <span class="phaseArchiveCategoryBadge" title="Categoria atribuída: {catInfo.name}">
                  <i style="background: {catInfo.color}"></i>
                  <span>{catInfo.name}</span>
                </span>
              </div>

              <div class="phaseCardTopRight">
                {#if record.classifiedAt}
                  <span class="phaseArchiveDateTag" title="Data da classificação">
                    {formatOverviewDate(record.classifiedAt, true)}
                  </span>
                {/if}

                <button
                  type="button"
                  class="btn ghost small snowballBtn phaseCardSnowballBtn"
                  class:active={isSnowballActive}
                  title={isSnowballActive
                    ? "Snowballing ativo (clique para cancelar)"
                    : "Iniciar busca Snowballing a partir deste artigo"}
                  on:click={() => toggleSnowballParentAction(paperId, record.paper?.title || "(sem título)")}
                >
                  🔗 Snowballing
                </button>
              </div>
            </div>

            <!-- Título do Artigo (Clicável para Histórico) -->
            <h4 class="phaseArchiveCardTitle">
              <button
                type="button"
                class="phaseTitleLinkBtn"
                on:click={() => openHistoryModal(record.paper)}
                title="Ver histórico e auditoria genealógica deste artigo"
              >
                {record.paper?.title || record.paper?.url || '(sem título)'}
              </button>
            </h4>

            <!-- Metadados de Autores, Ano e Veículo -->
            <div class="phaseArchiveCardMeta">
              {#if authors && authors !== '—'}
                <span class="phaseMetaItem" title="Autores">👤 {authors}</span>
              {/if}

              <div class="phaseMetaYearField" title="Ano de publicação (editável)">
                <span class="phaseMetaLabel">📅</span>
                <input
                  class="cellInput phaseInlineYear"
                  value={year || ""}
                  placeholder="Ano"
                  disabled={isCompleted}
                  on:change={(e) => updatePaperFieldAction(paperId, "year", e.target.value)}
                />
              </div>

              {#if venue}
                <span class="phaseMetaItem" title="Veículo de publicação">📖 {venue}</span>
              {/if}
            </div>

            <!-- Tags Editáveis Inline -->
            <div class="phaseCardTagsRow">
              <span class="phaseTagsLabel">🏷 Tags:</span>
              <input
                class="cellInput phaseInlineTags"
                value={Array.isArray(record.paper?.tags) ? record.paper.tags.join("; ") : ""}
                placeholder="ex: vis; interacao; ml"
                disabled={isCompleted}
                title="Editar tags do artigo (separadas por ponto-e-vírgula)"
                on:change={(e) => updatePaperFieldAction(paperId, "tags", e.target.value)}
              />
            </div>

            <!-- Justificativa ou notas de triagem se houver -->
            {#if record.classification?.notes || record.paper?.notes}
              <div class="phaseArchiveCardNote" title="Anotação registrada na triagem">
                <strong>Nota:</strong> {record.classification?.notes || record.paper?.notes}
              </div>
            {/if}

            <!-- Botões Diretos de Triagem Individual no Card (Incluir, Excluir, Pendente, Remover Marcado) -->
            <div class="phaseCardTriageRow">
              {#if isLocked}
                <span class="phaseCardTriageLabel">Decisão:</span>
                <span class="phaseValidatedBadge" title="Artigo validado e herdado da fase anterior">Validado</span>
              {:else}
                <span class="phaseCardTriageLabel">Triar artigo:</span>
                <div class="phaseCardTriageButtons">
                  <button
                    type="button"
                    class="phaseTriageBtn phaseTriageBtn--included"
                    class:active={outcomeInfo.label === 'Aprovado'}
                    disabled={isCompleted}
                    title={isCompleted ? "Fase concluída" : "Classificar este artigo como Incluído (Aprovado)"}
                    on:click={() => handleSinglePaperOutcome(record.paper, 'included')}
                  >
                    <span aria-hidden="true">✓</span> Incluir
                  </button>

                  <button
                    type="button"
                    class="phaseTriageBtn phaseTriageBtn--excluded"
                    class:active={outcomeInfo.label === 'Excluído' || outcomeInfo.label === 'Duplicado'}
                    disabled={isCompleted}
                    title={isCompleted ? "Fase concluída" : "Classificar este artigo como Excluído"}
                    on:click={() => handleSinglePaperOutcome(record.paper, 'excluded')}
                  >
                    <span aria-hidden="true">×</span> Excluir
                  </button>

                  <button
                    type="button"
                    class="phaseTriageBtn phaseTriageBtn--pending"
                    class:active={outcomeInfo.label === 'Pendente'}
                    disabled={isCompleted}
                    title={isCompleted ? "Fase concluída" : "Classificar este artigo como Pendente"}
                    on:click={() => handleSinglePaperOutcome(record.paper, 'pending')}
                  >
                    <span aria-hidden="true">⏳</span> Pendente
                  </button>

                  <button
                    type="button"
                    class="phaseTriageBtn phaseTriageBtn--unmark"
                    disabled={isCompleted}
                    title={isCompleted ? "Fase concluída" : "Remover a marcação deste artigo desta fase"}
                    on:click={() => handleSinglePaperUnmark(record.paper)}
                  >
                    <span aria-hidden="true">🗑</span> Remover marcado
                  </button>
                </div>
              {/if}
            </div>

            <!-- Ações no Rodapé do Card -->
            <div class="phaseArchiveCardActions">
              <button
                type="button"
                class="phaseArchiveMiniBtn"
                class:copied={copiedId === record.key}
                on:click={() => handleCopyTitle(record)}
                title="Copiar título do artigo para a área de transferência"
              >
                {#if copiedId === record.key}
                  <span>✓ Copiado!</span>
                {:else}
                  <span>📋 Copiar título</span>
                {/if}
              </button>

              <button
                type="button"
                class="phaseArchiveMiniBtn"
                on:click={() => openHistoryModal(record.paper)}
                title="Ver linha do tempo e auditoria deste artigo"
              >
                <span>📜 Histórico</span>
              </button>

              {#if record.paper?.url}
                <a
                  href={record.paper.url}
                  target="_blank"
                  rel="noreferrer"
                  class="phaseArchiveMiniBtn"
                  title="Abrir link original do artigo em nova aba"
                >
                  <span>Abrir original ↗</span>
                </a>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>
