<script>
  import {
    isHistoryModalOpenStore,
    historyModalPaperStore,
    closeHistoryModal,
    papersStore,
    projectStore,
    activePhaseLabelStore,
    paperSearchQueryStore
  } from "../dashboardStore.js";
  import {
    normalizeHexColor,
    normalizeCategoryMetricType,
    paperBelongsToPhase
  } from "../dashboardHelpers.js";

  $: isOpen = $isHistoryModalOpenStore;
  $: rawPaper = $historyModalPaperStore;

  // Garante reatividade com o store principal para refletir alterações recentes
  $: activePaper = ($papersStore || []).find((p) => p.id === rawPaper?.id) || rawPaper || {};

  $: historyList = (() => {
    if (!activePaper || !Array.isArray(activePaper.history)) return [];
    return [...activePaper.history].sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  })();

  $: categories = Array.isArray($projectStore?.categories) ? $projectStore.categories : [];
  $: phases = Array.isArray($projectStore?.phases) ? $projectStore.phases : [];

  $: parentPaperId = activePaper?.parentPaperId || null;
  $: parentPaper = parentPaperId
    ? ($papersStore || []).find((p) => String(p.id) === String(parentPaperId))
    : null;

  $: childPapers = (() => {
    if (!activePaper?.id && activePaper?.id !== 0) return [];
    const activePhase = $activePhaseLabelStore || "";
    return ($papersStore || []).filter((p) => {
      if (String(p.parentPaperId) !== String(activePaper.id)) return false;
      if (!paperBelongsToPhase(p, activePhase)) return false;
      return true;
    });
  })();

  $: currentCategory = categories.find((c) => c.label === activePaper?.categoryLabel) || null;
  $: currentCategoryColor = normalizeHexColor(currentCategory?.color, activePaper?.highlightedColor || "#2563eb");
  $: currentCategoryTitle = currentCategory?.title || currentCategory?.label || activePaper?.categoryLabel || "Sem categoria";
  $: currentMetricType = normalizeCategoryMetricType(activePaper?.status || currentCategory?.metricType, "pending");
  $: phaseTitle = getPhaseTitle(activePaper?.phaseLabel || $activePhaseLabelStore);
  $: authorsText = getPaperAuthorsText(activePaper);

  let copied = false;

  async function copyPaperId() {
    if (!activePaper?.id) return;
    try {
      await navigator.clipboard.writeText(String(activePaper.id));
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch (err) {
      console.warn("Falha ao copiar:", err);
    }
  }

  function getCategoryObj(label) {
    if (!label) return null;
    return categories.find((c) => c.label === label || c.id === label) || null;
  }

  function getPhaseTitle(label) {
    if (!label) return "Fase atual";
    const ph = phases.find((p) => p.label === label || p.id === label);
    return ph?.title || ph?.label || label;
  }

  function getPaperAuthorsText(paper) {
    if (Array.isArray(paper?.authors) && paper.authors.length > 0) {
      return paper.authors.join(", ");
    }
    if (paper?.authorsRaw) {
      return paper.authorsRaw;
    }
    if (paper?.author) {
      return paper.author;
    }
    return "Autor não informado";
  }

  function formatEventTimestamp(ts) {
    if (!ts) return "Data não informada";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getActionMeta(action) {
    switch (action) {
      case "mark":
        return {
          title: "Marcação Inicial",
          badge: "Marcado",
          badgeClass: "node-mark",
          icon: "📌"
        };
      case "reclassify":
        return {
          title: "Reclassificação",
          badge: "Alterado",
          badgeClass: "node-reclassify",
          icon: "🔄"
        };
      case "migrate_category":
        return {
          title: "Migração de Categoria",
          badge: "Migrado",
          badgeClass: "node-migrate",
          icon: "🔀"
        };
      case "inherit":
        return {
          title: "Herança de Fase",
          badge: "Herdado",
          badgeClass: "node-inherit",
          icon: "⏭️"
        };
      case "update_field":
        return {
          title: "Edição de Metadado",
          badge: "Editado",
          badgeClass: "node-edit",
          icon: "✏️"
        };
      case "bulk_classify":
        return {
          title: "Triagem em Lote",
          badge: "Em Lote",
          badgeClass: "node-bulk",
          icon: "📦"
        };
      case "unmark":
        return {
          title: "Marcação Removida",
          badge: "Removido",
          badgeClass: "node-unmark",
          icon: "🗑️"
        };
      default:
        return {
          title: action || "Registro de Auditoria",
          badge: "Registro",
          badgeClass: "node-default",
          icon: "📜"
        };
    }
  }

  function navigateToParent() {
    if (parentPaperId) {
      paperSearchQueryStore.set(`id:${parentPaperId}`);
      closeHistoryModal();
    }
  }

  function navigateToChildren() {
    if (activePaper?.id || activePaper?.id === 0) {
      paperSearchQueryStore.set(`parent:${activePaper.id}`);
      closeHistoryModal();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen) {
      closeHistoryModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && activePaper}
  <div
    class="paperHistoryOverlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="paperHistoryMainTitle"
    on:click|self={closeHistoryModal}
    on:keydown|self={(e) => { if (e.key === 'Escape') closeHistoryModal(); }}
  >
    <div class="paperHistoryCard">
      <!-- Linha decorativa superior -->
      <div class="historyAccentBar"></div>

      <!-- Cabeçalho do Modal -->
      <div class="paperHistoryHeader">
        <div class="paperHistoryHeaderTop">
          <div class="paperHistoryBadgeRow">
            <span class="paperHistoryEyebrow">
              <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Auditoria Metodológica e Rastreabilidade
            </span>
          </div>

          <button
            type="button"
            class="paperHistoryCloseBtn"
            on:click={closeHistoryModal}
            title="Fechar histórico (Esc)"
            aria-label="Fechar modal de histórico"
          >
            ✕
          </button>
        </div>

        <h3 id="paperHistoryMainTitle" class="paperHistoryTitle">
          {activePaper.title || activePaper.url || activePaper.id || "(sem título)"}
        </h3>

        <!-- Fita de Resumo do Artigo (Ano, Autores, Categoria Atual, Desfecho e Fase) -->
        <div class="paperHistoryArticleStrip">
          <div class="articleStripRow">
            {#if activePaper.year}
              <span class="articleStripBadge badgeYear">📅 {activePaper.year}</span>
            {/if}
            {#if authorsText && authorsText !== "Autor não informado"}
              <span class="articleStripBadge badgeAuthors" title={authorsText}>👤 {authorsText}</span>
            {/if}
            {#if activePaper.venue}
              <span class="articleStripBadge badgeVenue" title={activePaper.venue}>📖 {activePaper.venue}</span>
            {/if}
          </div>

          <div class="articleStripStatusRow">
            <span class="articleStripCategory" style="border-left: 3px solid {currentCategoryColor};">
              <span class="pillDot" style="background: {currentCategoryColor};"></span>
              <span>Categoria: <strong>{currentCategoryTitle}</strong></span>
            </span>

            <span class="articleStripOutcome metric-{currentMetricType}">
              {currentMetricType === 'included' ? '✓ Aprovado' : currentMetricType === 'excluded' ? '× Excluído' : '⏳ Pendente'}
            </span>

            {#if phaseTitle}
              <span class="articleStripPhase">
                Fase: <strong>{phaseTitle}</strong>
              </span>
            {/if}

            {#if Array.isArray(activePaper.tags) && activePaper.tags.length > 0}
              <div class="articleStripTags">
                {#each activePaper.tags as tag}
                  <span class="stripTag">#{tag}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Seção de Linhagem e Snowballing (Origem e Derivações) -->
      {#if parentPaper || parentPaperId || childPapers.length > 0}
        <div class="historyGenealogySection">
          {#if parentPaper || parentPaperId}
            <div class="genealogyCard parentCard">
              <div class="genealogyIcon">🔗</div>
              <div class="genealogyInfo">
                <span class="genealogyLabel">Artigo Origem (Snowballing Ascendente)</span>
                <span class="genealogyTitle">
                  {parentPaper?.title || parentPaper?.url || `ID: ${parentPaperId}`}
                </span>
                {#if parentPaper?.year}
                  <span class="genealogyMeta">Publicado em {parentPaper.year}</span>
                {/if}
              </div>
              <button
                type="button"
                class="btn small genealogyBtn"
                on:click={navigateToParent}
                title="Filtrar e visualizar artigo de origem na pesquisa"
              >
                Ver Artigo Pai ↗
              </button>
            </div>
          {/if}

          {#if childPapers.length > 0}
            <div class="genealogyCard childrenCard">
              <div class="genealogyIcon">🌱</div>
              <div class="genealogyInfo">
                <span class="genealogyLabel">Artigos Derivados (Snowballing Descendente)</span>
                <span class="genealogyTitle">
                  {childPapers.length} {childPapers.length === 1 ? 'artigo identificado' : 'artigos identificados'} a partir das referências deste paper
                </span>
              </div>
              <button
                type="button"
                class="btn small genealogyBtn"
                on:click={navigateToChildren}
                title="Filtrar artigos filhos na fase atual"
              >
                Ver {childPapers.length} Artigos Filhos ↗
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Corpo com a Linha do Tempo Visual -->
      <div class="paperHistoryBody u-scroll-y">
        <div class="historyTimelineSummary">
          <span class="historyTimelineCount">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Linha do tempo ({historyList.length} {historyList.length === 1 ? 'evento registrado' : 'eventos registrados'})
          </span>
        </div>

        <div class="paperHistoryTimeline">
          {#each historyList as h, index (h.ts + (h.action || '') + index)}
            {@const meta = getActionMeta(h.action)}
            {@const details = h.details || {}}
            <div class="timelineItem">
              <!-- Trilho vertical com nó visual -->
              <div class="timelineTrack">
                <div class="timelineNode {meta.badgeClass}" title={meta.title}>
                  <span>{meta.icon}</span>
                </div>
                {#if index < historyList.length - 1}
                  <div class="timelineLine"></div>
                {/if}
              </div>

              <!-- Cartão do Evento -->
              <div class="timelineCard">
                <div class="timelineCardHeader">
                  <div class="timelineCardTitleRow">
                    <span class="timelineActionBadge {meta.badgeClass}">{meta.badge}</span>
                    <strong class="timelineActionTitle">{meta.title}</strong>
                  </div>
                  <time class="timelineTime" datetime={h.ts}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>{formatEventTimestamp(h.ts)}</span>
                  </time>
                </div>

                <div class="timelineCardBody">
                  {#if h.action === 'mark'}
                    {@const markCat = getCategoryObj(details.category)}
                    {@const markColor = normalizeHexColor(markCat?.color, '#2563eb')}
                    <p class="timelineNarrative">
                      Artigo registrado na pesquisa e vinculado à fase <strong>"{getPhaseTitle(details.phaseLabel)}"</strong>.
                    </p>
                    <div class="timelineBadgesRow">
                      {#if markCat || details.category}
                        <span class="timelinePill" style="border-left: 3px solid {markColor};">
                          <span class="pillDot" style="background: {markColor};"></span>
                          <span>Categoria: <strong>{markCat?.title || markCat?.label || details.category}</strong></span>
                        </span>
                      {/if}
                      {#if details.metricType || details.status}
                        {@const norm = normalizeCategoryMetricType(details.metricType || details.status, 'pending')}
                        <span class="timelineMetricBadge metric-{norm}">
                          {norm === 'included' ? '✓ Incluído' : norm === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                        </span>
                      {/if}
                    </div>

                  {:else if h.action === 'reclassify'}
                    {@const newCat = getCategoryObj(details.category)}
                    {@const newColor = normalizeHexColor(newCat?.color, '#2563eb')}
                    <p class="timelineNarrative">
                      Classificação alterada pelo pesquisador na fase <strong>"{getPhaseTitle(details.phaseLabel)}"</strong>.
                    </p>
                    <div class="timelineBadgesRow">
                      {#if newCat || details.category}
                        <span class="timelinePill" style="border-left: 3px solid {newColor};">
                          <span class="pillDot" style="background: {newColor};"></span>
                          <span>Nova Categoria: <strong>{newCat?.title || newCat?.label || details.category}</strong></span>
                        </span>
                      {/if}
                      {#if details.status}
                        {@const norm = normalizeCategoryMetricType(details.status, 'pending')}
                        <span class="timelineMetricBadge metric-{norm}">
                          {norm === 'included' ? '✓ Incluído' : norm === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                        </span>
                      {/if}
                      {#if details.prevStatus && details.prevStatus !== details.status}
                        <span class="timelinePreviousHint">
                          (Anterior: {details.prevStatus})
                        </span>
                      {/if}
                    </div>

                  {:else if h.action === 'migrate_category'}
                    {@const fromCat = getCategoryObj(details.fromCategory)}
                    {@const toCat = getCategoryObj(details.toCategory)}
                    {@const toColor = normalizeHexColor(toCat?.color, '#2563eb')}
                    <div class="timelineMigrationBox">
                      <div class="migrationNarrative">
                        🔄 <strong>Transferência de Categoria Obrigatória:</strong>
                        A categoria original foi excluída e os artigos foram reatribuídos para preservar a integridade metodológica da pesquisa.
                      </div>
                      <div class="migrationFlowRow">
                        <span class="migrationSourcePill">
                          De: <strong>{fromCat?.title || details.fromCategory || 'Categoria Excluída'}</strong>
                        </span>
                        <span class="migrationArrow">➔</span>
                        <span class="migrationDestPill" style="border-color: {toColor};">
                          <span class="pillDot" style="background: {toColor};"></span>
                          Para: <strong>{toCat?.title || details.toCategory}</strong>
                        </span>
                      </div>
                    </div>

                  {:else if h.action === 'inherit'}
                    <p class="timelineNarrative">
                      ⏭️ Artigo aprovado na etapa anterior e herdado automaticamente na progressão metodológica.
                    </p>
                    {#if details.fromPhase || details.toPhase}
                      <div class="timelineBadgesRow">
                        <span class="timelinePill">
                          Fase de Origem: <strong>{getPhaseTitle(details.fromPhase)}</strong>
                        </span>
                        <span>➔</span>
                        <span class="timelinePill">
                          Fase de Destino: <strong>{getPhaseTitle(details.toPhase)}</strong>
                        </span>
                      </div>
                    {/if}

                  {:else if h.action === 'update_field'}
                    <p class="timelineNarrative">
                      ✏️ Campo <strong>"{details.field || 'metadado'}"</strong> atualizado.
                    </p>
                    <div class="timelineFieldDiff">
                      {#if details.oldValue !== undefined}
                        <span class="diffOld">Antes: <s>{String(details.oldValue || '—')}</s></span>
                        <span class="diffArrow">➔</span>
                      {/if}
                      <span class="diffNew">Novo: <strong>{String(details.newValue ?? details.value ?? '—')}</strong></span>
                    </div>

                  {:else if h.action === 'bulk_classify'}
                    {@const bulkCat = getCategoryObj(details.category)}
                    <p class="timelineNarrative">
                      📦 Triagem realizada via operação em lote para a categoria <strong>"{bulkCat?.title || details.category || 'selecionada'}"</strong>.
                    </p>

                  {:else if h.action === 'unmark'}
                    <p class="timelineNarrative" style="color: #be123c;">
                      🗑️ Artigo desmarcado desta fase da revisão sistemática.
                    </p>

                  {:else}
                    <p class="timelineNarrative">
                      Ação registrada: <strong>{h.action || 'evento'}</strong>
                    </p>
                    {#if Object.keys(details).length > 0}
                      <div class="timelineDetailsChips">
                        {#each Object.entries(details) as [k, v]}
                          <span class="detailChip">
                            <span class="chipKey">{k}:</span>
                            <span class="chipVal">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </span>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="timelineEmptyState">
              <span class="emptyIcon">📭</span>
              <strong>Nenhum histórico registrado</strong>
              <p>Este artigo ainda não possui registros de alterações ou triagens no histórico.</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Rodapé com ID e Ações Rápidas -->
      <div class="paperHistoryFooter">
        <div class="footerLeft">
          <button
            type="button"
            class="paperIdCopyBtn"
            on:click={copyPaperId}
            title="Copiar identificador interno deste artigo"
          >
            <span>ID: <code>{activePaper.id}</code></span>
            <span class="copyStatus">{copied ? '✓ Copiado!' : '📋 Copiar'}</span>
          </button>
        </div>

        <div class="footerRight">
          {#if activePaper.url}
            <a
              href={activePaper.url}
              target="_blank"
              rel="noreferrer"
              class="btn small ghost paperExternalLinkBtn"
              title="Abrir página original do artigo em nova aba"
            >
              <span>Abrir link original</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          {/if}

          <button
            type="button"
            class="btn btn-primary"
            on:click={closeHistoryModal}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
