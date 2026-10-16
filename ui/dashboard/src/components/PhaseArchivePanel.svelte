<script>
  import {
    getPhaseArchiveRecords,
    normalizeMetricType,
    normalizeHexColor,
    formatOverviewDate,
    extractPaperYear,
    getPaperAuthorsText,
    isPhaseCompleted
  } from '../dashboardHelpers.js';
  import {
    projectStore,
    papersStore,
    expandedCompletedPhaseStore,
    openPapersWithFilter
  } from '../dashboardStore.js';

  export let phase = {};
  export let index = 0;
  export let totalPhases = 1;
  export let isActivePhase = false;

  $: isCompleted = isPhaseCompleted(phase);
  $: records = getPhaseArchiveRecords(phase, $papersStore);
  $: categories = Array.isArray($projectStore?.categories) ? $projectStore.categories : [];

  $: phaseCategoryLabels = Array.isArray(phase.categories) ? phase.categories : [];
  $: phaseCategories = phaseCategoryLabels
    .map((clabel) => categories.find((c) => c.label === clabel))
    .filter(Boolean);

  $: inheritedCount = records.filter(r => r.inherited).length;
  $: pendingCount = records.filter(r => !r.inherited && normalizeMetricType(r.outcome, 'pending') === 'pending').length;
  $: selectedCount = records.filter(r => !r.inherited && normalizeMetricType(r.outcome, 'pending') === 'included').length;
  $: removedCount = records.filter(r => !r.inherited && (normalizeMetricType(r.outcome, 'pending') === 'excluded' || r.outcome === 'duplicate')).length;

  let activeFilter = 'all'; // 'all' | 'inherited' | 'pending' | 'included' | 'excluded'
  let searchQuery = '';
  let selectedCategoryFilter = 'all';
  let copiedId = null;

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

    // Busca textual (título, autores, ano, periódico)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const title = String(record.paper?.title || '').toLowerCase();
      const authors = String(getPaperAuthorsText(record.paper) || '').toLowerCase();
      const year = String(extractPaperYear(record.paper) || '');
      const venue = String(record.paper?.venue || record.paper?.journal || record.paper?.publisher || '').toLowerCase();
      if (!title.includes(q) && !authors.includes(q) && !year.includes(q) && !venue.includes(q)) {
        return false;
      }
    }

    return true;
  });

  function handleClose() {
    expandedCompletedPhaseStore.set(null);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }

  function handleOpenTable(metric = 'all') {
    openPapersWithFilter({ phase: phase.label, metric });
    handleClose();
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

<!-- Overlay que escurece o fundo e fecha a aba lateral ao clicar fora -->
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
  <!-- Cabeçalho com Etapa, Status e Ação de Fechar -->
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
        {phase.title || `Fase ${index + 1}`}
      </h3>

      <p class="phaseArchiveDescription">
        {phase.description || phase.desc || 'Artigos classificados e registrados nesta fase da revisão sistemática.'}
      </p>
    </div>

    <button
      class="btn phaseArchiveCloseBtn"
      type="button"
      on:click={handleClose}
      title="Fechar visualização de artigos (Esc)"
      aria-label="Fechar"
    >
      ✕
    </button>
  </div>

  <!-- Barra de Ações Rápidas no topo -->
  <div class="phaseArchiveQuickActionBar">
    <button
      class="btn small phaseArchiveTableBtn"
      type="button"
      on:click={() => handleOpenTable('all')}
      title="Abrir a tabela de artigos filtrada nesta fase"
    >
      <span>Abrir na Tabela de Artigos</span>
      <span aria-hidden="true">→</span>
    </button>
  </div>

  <!-- Filtros Rápidos com Contadores Clicáveis -->
  <div class="phaseArchiveSummary">
    <button
      type="button"
      class="phaseArchiveSummaryItem"
      class:active={activeFilter === 'all'}
      on:click={() => activeFilter = 'all'}
      title="Exibir todos os artigos desta fase"
    >
      <span>Todos</span>
      <strong>{records.length}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--inherited"
      class:active={activeFilter === 'inherited'}
      on:click={() => activeFilter = 'inherited'}
      title="Filtrar artigos herdados da fase anterior"
    >
      <span>📥 Herdados</span>
      <strong>{inheritedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--pending"
      class:active={activeFilter === 'pending'}
      on:click={() => activeFilter = 'pending'}
      title="Filtrar artigos pendentes de avaliação"
    >
      <span>⏳ Pendentes</span>
      <strong>{pendingCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--selected"
      class:active={activeFilter === 'included'}
      on:click={() => activeFilter = 'included'}
      title="Filtrar artigos aprovados para avançar"
    >
      <span>✅ Aprovados</span>
      <strong>{selectedCount}</strong>
    </button>

    <button
      type="button"
      class="phaseArchiveSummaryItem phaseArchiveSummaryItem--removed"
      class:active={activeFilter === 'excluded'}
      on:click={() => activeFilter = 'excluded'}
      title="Filtrar artigos excluídos ou duplicados"
    >
      <span>❌ Excluídos</span>
      <strong>{removedCount}</strong>
    </button>
  </div>

  <!-- Barra de Ferramentas de Busca e Filtro de Categoria -->
  <div class="phaseArchiveToolbar">
    <div class="phaseArchiveSearchRow">
      <div class="phaseArchiveSearchWrap">
        <input
          type="text"
          class="phaseArchiveSearchInput"
          placeholder="Buscar por título, autor, ano ou periódico..."
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button
            type="button"
            class="phaseArchiveClearBtn"
            on:click={() => searchQuery = ''}
            title="Limpar busca"
          >
            ✕
          </button>
        {/if}
      </div>

      {#if phaseCategories.length > 0}
        <select
          class="phaseArchiveCategorySelect"
          bind:value={selectedCategoryFilter}
          title="Filtrar por categoria"
        >
          <option value="all">Todas categorias</option>
          {#each phaseCategories as cat}
            <option value={cat.label}>{cat.title || cat.label}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="phaseArchiveMetaCount">
      Exibindo <strong>{filteredRecords.length}</strong> de {records.length} artigos
    </div>
  </div>

  <!-- Lista de Artigos Detalhados -->
  <div class="phaseArchiveArticleList u-scroll-y">
    {#if records.length === 0}
      <div class="phaseArchiveEmpty">
        <div style="font-size:28px;margin-bottom:6px">📭</div>
        <strong>Nenhum artigo nesta fase</strong>
        <p style="margin:4px 0 0;color:#64748b">
          Nenhum artigo foi classificado ou importado para esta fase ainda.
        </p>
      </div>
    {:else if filteredRecords.length === 0}
      <div class="phaseArchiveEmpty">
        <div style="font-size:28px;margin-bottom:6px">🔍</div>
        <strong>Nenhum artigo encontrado</strong>
        <p style="margin:4px 0 10px;color:#64748b">
          Nenhum artigo corresponde aos critérios de busca e filtro atuais.
        </p>
        <button
          type="button"
          class="btn small"
          on:click={() => { searchQuery = ''; activeFilter = 'all'; selectedCategoryFilter = 'all'; }}
        >
          Limpar filtros
        </button>
      </div>
    {:else}
      {#each filteredRecords as record (record.key)}
        {@const catInfo = getCategoryInfo(record)}
        {@const outcomeInfo = getOutcomeInfo(record)}
        {@const authors = getPaperAuthorsText(record.paper)}
        {@const year = extractPaperYear(record.paper)}
        {@const venue = record.paper?.venue || record.paper?.journal || record.paper?.publisher}

        <article class="phaseArchiveArticleCard">
          <!-- Cabeçalho do Card com Desfecho, Categoria e Data -->
          <div class="phaseArchiveCardTop">
            <div class="phaseArchiveCardBadges">
              <span class="phaseArchiveOutcome {outcomeInfo.cls}" title="Desfecho do artigo nesta fase">
                <span class="outcomeIcon" aria-hidden="true">{outcomeInfo.icon}</span>
                <span>{outcomeInfo.label}</span>
              </span>

              <span class="phaseArchiveCategoryBadge" title="Categoria atribuída: {catInfo.name}">
                <i style="background: {catInfo.color}"></i>
                <span>{catInfo.name}</span>
              </span>
            </div>

            {#if record.classifiedAt}
              <span class="phaseArchiveDateTag" title="Data da classificação">
                {formatOverviewDate(record.classifiedAt, true)}
              </span>
            {/if}
          </div>

          <!-- Título do Artigo -->
          <h4 class="phaseArchiveCardTitle">
            {#if record.paper?.url}
              <a
                href={record.paper.url}
                target="_blank"
                rel="noreferrer"
                title="Abrir artigo em nova aba"
              >
                <span>{record.paper.title || record.paper.url || '(sem título)'}</span>
                <span class="extLinkIcon" aria-hidden="true">↗</span>
              </a>
            {:else}
              <span>{record.paper?.title || '(sem título)'}</span>
            {/if}
          </h4>

          <!-- Metadados de Autores, Ano e Periódico -->
          <div class="phaseArchiveCardMeta">
            {#if authors && authors !== '—'}
              <span title="Autores">👤 {authors}</span>
            {/if}
            {#if year}
              <span title="Ano de publicação">📅 {year}</span>
            {/if}
            {#if venue}
              <span title="Veículo de publicação">📖 {venue}</span>
            {/if}
          </div>

          <!-- Justificativa ou notas de triagem se houver -->
          {#if record.classification?.notes || record.paper?.notes}
            <div class="phaseArchiveCardNote" title="Anotação de triagem">
              <strong>Nota:</strong> {record.classification?.notes || record.paper?.notes}
            </div>
          {/if}

          <!-- Ações Rápidas no Rodapé do Card -->
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

            {#if record.paper?.url}
              <a
                href={record.paper.url}
                target="_blank"
                rel="noreferrer"
                class="phaseArchiveMiniBtn"
                title="Abrir link original do artigo"
              >
                <span>Abrir link original ↗</span>
              </a>
            {/if}
          </div>
        </article>
      {/each}
    {/if}
  </div>
</div>
