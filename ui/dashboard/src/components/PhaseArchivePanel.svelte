<script>
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
    normalizeStr
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
    openPhasePanel,
    phaseArticlesViewModeStore,
    setPhaseArticlesViewMode,
    classifySinglePaperAction,
    unmarkSinglePaperAction
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
      if (confirm("Esta fase está marcada como concluída. Deseja abrir a edição para reabrir a fase e continuar a triagem?")) {
        handleOpenEditPhase();
      }
      return;
    }
    classifySinglePaperAction(paper, outcome, activePhaseObj.label);
  }

  function handleSinglePaperUnmark(paper) {
    if (isCompleted) {
      if (confirm("Esta fase está marcada como concluída. Deseja abrir a edição para reabrir a fase e continuar a triagem?")) {
        handleOpenEditPhase();
      }
      return;
    }
    unmarkSinglePaperAction(paper, activePhaseObj.label);
  }

  function handleOpenEditPhase() {
    openPhasePanel(activePhaseObj);
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
    if (!categoryLabel) return { color: '#A5ADBA', name: 'Sem categoria' };
    const matched = categories.find(cat => {
      const l = String(cat?.label || '').trim().toLowerCase();
      const t = String(cat?.title || '').trim().toLowerCase();
      return l === categoryLabel || t === categoryLabel;
    });
    return {
      color: normalizeHexColor(matched?.color, '#A5ADBA'),
      name: matched?.title || matched?.label || record.categoryLabel || 'Sem categoria'
    };
  }

  function getOutcomeInfo(record) {
    if (record.inherited) {
      return { label: 'Herdado', cls: 'outcome--inherited', icon: '📥' };
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
></div>

<div
  class="phaseArchivePanel is-open"
  role="dialog"
  aria-modal="true"
  aria-labelledby="phaseArchiveMainTitle"
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

      <p class="phaseArchiveDescription">
        {#if isActivePhase}
          Fase em condução: avalie artigos individualmente ou em lote para incluir, excluir ou definir como pendente. Metadados e Snowballing atualizados em tempo real.
        {:else if isCompleted}
          Fase concluída e protegida: artigos avaliados nesta etapa gravados para integridade e auditoria metodológica.
        {:else}
          Fase planejada: gerencie artigos e critérios desta etapa.
        {/if}
      </p>
    </div>

    <div class="phaseArchiveHeaderActions">
      <button
        class="btn small phaseArchiveEditBtn"
        type="button"
        on:click={handleOpenEditPhase}
        title="Editar configurações, critérios e ciclo desta fase"
        aria-label="Editar configurações da fase"
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
        <span>Editar Fase</span>
      </button>

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
  </div>

  {#if isCompleted}
    <div class="phaseArchiveCompletedNotice" role="note">
      <div class="phaseCompletedNoticeText">
        <span>🔒</span>
        <span>Esta fase está concluída e com triagem protegida.</span>
      </div>
      <button
        type="button"
        class="phaseCompletedNoticeBtn"
        on:click={handleOpenEditPhase}
      >
        Editar / Reabrir fase →
      </button>
    </div>
  {/if}

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
      <span>📥 Herdados</span>
      <strong>{inheritedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--pending"
      class:active={activeFilter === 'pending'}
      on:click={() => handleFilterPillClick('pending')}
      title="Filtrar artigos pendentes de avaliação"
    >
      <span>⏳ Pendentes</span>
      <strong>{pendingCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--selected"
      class:active={activeFilter === 'included'}
      on:click={() => handleFilterPillClick('included')}
      title="Filtrar artigos aprovados para avançar"
    >
      <span>✅ Aprovados</span>
      <strong>{selectedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--removed"
      class:active={activeFilter === 'excluded'}
      on:click={() => handleFilterPillClick('excluded')}
      title="Filtrar artigos excluídos ou duplicados"
    >
      <span>❌ Excluídos</span>
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
          placeholder="Buscar por título, autor, ano, tag, periódico ou id:X / parent:X..."
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
          ▤ Cartões
        </button>
        <button
          type="button"
          class="viewToggleBtn"
          class:active={viewMode === 'table'}
          on:click={() => setPhaseArticlesViewMode('table')}
          title="Visualizar em tabela analítica compacta"
        >
          ▦ Tabela
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
              <th>Título / Autores</th>
              <th style="width:74px">Ano</th>
              <th style="width:110px">Desfecho</th>
              <th style="width:150px">Categoria</th>
              <th style="width:130px">Tags</th>
              <th style="width:180px;text-align:center">Decisão na Fase</th>
              <th style="width:96px;text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredRecords as record (record.key)}
              {@const catInfo = getCategoryInfo(record)}
              {@const outcomeInfo = getOutcomeInfo(record)}
              {@const isSnowballActive = $currentSnowballParentIdStore === String(record.paper?.id)}
              {@const paperId = record.paper?.id}

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

                <td>
                  <input
                    class="cellInput phaseInlineYear"
                    value={extractPaperYear(record.paper) || ""}
                    placeholder="—"
                    disabled={isCompleted}
                    title="Editar ano de publicação"
                    on:change={(e) => updatePaperFieldAction(paperId, "year", e.target.value)}
                  />
                </td>

                <td>
                  <span class="phaseArchiveOutcome {outcomeInfo.cls}">
                    <span class="outcomeIcon" aria-hidden="true">{outcomeInfo.icon}</span>
                    <span>{outcomeInfo.label}</span>
                  </span>
                </td>

                <td>
                  <span class="phaseArchiveCategoryBadge" title="Categoria: {catInfo.name}">
                    <i style="background: {catInfo.color}"></i>
                    <span>{catInfo.name}</span>
                  </span>
                </td>

                <td>
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
