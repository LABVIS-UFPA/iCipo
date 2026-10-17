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

  function getCategoryTitle(catObj, label) {
    if (catObj?.title) return catObj.title;
    if (catObj?.label) {
      return String(catObj.label).charAt(0).toUpperCase() + String(catObj.label).slice(1);
    }
    if (label) {
      return String(label).charAt(0).toUpperCase() + String(label).slice(1);
    }
    return "Sem categoria";
  }

  function getCategoryColor(catObj, label, metricType) {
    if (catObj?.color) return normalizeHexColor(catObj.color);
    const norm = String(label || "").toLowerCase();
    const metric = String(metricType || "").toLowerCase();
    if (norm === "incluir" || norm.includes("inclu") || metric === "included") return "#16a34a";
    if (norm === "excluir" || norm.includes("exclu") || metric === "excluded") return "#dc2626";
    if (norm === "duvida" || norm.includes("duvid") || metric === "pending") return "#d97706";
    return "#64748b";
  }

  function getSourceDescription(source) {
    if (source === "articles_toolbar") return "pela barra de ferramentas de artigos";
    if (source === "bulk_modal") return "pelo assistente de triagem em lote";
    if (source === "context_menu") return "pelo menu de contexto";
    if (source === "scholar") return "durante a navegação no Google Scholar";
    if (!source) return "na interface da pesquisa";
    return `via ${source}`;
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
          title: "Reclassificação Individual",
          badge: "Alterado",
          badgeClass: "node-reclassify",
          icon: "🔄"
        };
      case "bulk_reclassify":
      case "bulk_classify":
        return {
          title: "Triagem em Lote",
          badge: "Em Lote",
          badgeClass: "node-bulk",
          icon: "📦"
        };
      case "migrate_category":
        return {
          title: "Migração de Categoria",
          badge: "Migrado",
          badgeClass: "node-migrate",
          icon: "🔀"
        };
      case "carry_forward":
      case "inherit":
        return {
          title: "Avanço / Herança de Fase",
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
      case "unmark":
        return {
          title: "Marcação Removida",
          badge: "Desmarcado",
          badgeClass: "node-unmark",
          icon: "🗑️"
        };
      default:
        return {
          title: action ? String(action).replace(/_/g, " ") : "Registro de Auditoria",
          badge: "Registro",
          badgeClass: "node-default",
          icon: "📋"
        };
    }
  }

  function translateDetailKey(key) {
    const map = {
      category: "Categoria",
      metricType: "Desfecho",
      phaseLabel: "Fase",
      previousCategory: "Categoria Anterior",
      previousStatus: "Status Anterior",
      prevStatus: "Status Anterior",
      source: "Origem da Ação",
      status: "Status",
      field: "Campo",
      oldValue: "Valor Anterior",
      newValue: "Novo Valor",
      visited: "Visitado",
      fromCategory: "Categoria de Origem",
      toCategory: "Categoria de Destino",
      fromPhaseLabel: "Fase de Origem",
      toPhaseLabel: "Fase de Destino",
      categoryChanged: "Mudança de Categoria",
      colorChanged: "Mudança de Cor",
      origin: "Origem"
    };
    return map[key] || key;
  }

  function translateDetailValue(key, val) {
    if (val === null || val === undefined) return "—";
    if (val === true) return "Sim";
    if (val === false) return "Não";
    if (typeof val === "object") return JSON.stringify(val);
    const s = String(val);
    if (key === "metricType" || key === "previousStatus" || key === "prevStatus" || key === "status") {
      if (s === "included") return "✓ Incluído";
      if (s === "excluded") return "× Excluído";
      if (s === "pending" || s === "new") return "⏳ Pendente";
    }
    if (key === "source") {
      if (s === "articles_toolbar") return "Barra de Ferramentas de Artigos";
      if (s === "bulk_modal") return "Assistente de Lote";
      if (s === "context_menu") return "Menu de Contexto";
      if (s === "scholar") return "Google Scholar";
    }
    if (key === "phaseLabel" || key === "fromPhaseLabel" || key === "toPhaseLabel") {
      return getPhaseTitle(s);
    }
    if (key === "category" || key === "previousCategory" || key === "fromCategory" || key === "toCategory") {
      return getCategoryTitle(getCategoryObj(s), s);
    }
    return s;
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
                  <!-- CASO 1: TRIAGEM EM LOTE (bulk_reclassify ou bulk_classify) -->
                  {#if h.action === 'bulk_reclassify' || h.action === 'bulk_classify'}
                    {@const newCat = getCategoryObj(details.category)}
                    {@const newTitle = getCategoryTitle(newCat, details.category)}
                    {@const newMetric = normalizeCategoryMetricType(details.metricType || details.status, 'pending')}
                    {@const newColor = getCategoryColor(newCat, details.category, newMetric)}

                    {@const prevCat = getCategoryObj(details.previousCategory)}
                    {@const prevTitle = getCategoryTitle(prevCat, details.previousCategory)}
                    {@const rawPrevStatus = details.previousStatus || details.prevStatus}
                    {@const prevMetric = rawPrevStatus && rawPrevStatus !== 'new' ? normalizeCategoryMetricType(rawPrevStatus, 'pending') : null}
                    {@const prevColor = getCategoryColor(prevCat, details.previousCategory, prevMetric)}

                    {@const phaseName = getPhaseTitle(details.phaseLabel)}
                    {@const sourceDesc = getSourceDescription(details.source)}

                    <p class="timelineNarrative">
                      📦 Artigo classificado em lote {sourceDesc} na fase <strong>"{phaseName}"</strong>.
                    </p>

                    <div class="timelineMovementCard">
                      <div class="movementCol movementFrom">
                        <span class="movementLabel">Estado Anterior:</span>
                        <div class="movementPill" style="border-left: 3px solid {prevColor};">
                          <span class="pillDot" style="background: {prevColor};"></span>
                          <span class="movementCatName">{prevTitle}</span>
                          {#if prevMetric}
                            <span class="timelineMetricBadge metric-{prevMetric}">
                              {prevMetric === 'included' ? '✓ Incluído' : prevMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                            </span>
                          {/if}
                        </div>
                      </div>

                      <div class="movementArrowCol" aria-hidden="true">
                        <span class="movementArrowIcon">➔</span>
                      </div>

                      <div class="movementCol movementTo">
                        <span class="movementLabel">Novo Estado Definido:</span>
                        <div class="movementPill highlightTo" style="border-left: 3px solid {newColor};">
                          <span class="pillDot" style="background: {newColor};"></span>
                          <span class="movementCatName">{newTitle}</span>
                          <span class="timelineMetricBadge metric-{newMetric}">
                            {newMetric === 'included' ? '✓ Incluído' : newMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                          </span>
                        </div>
                      </div>
                    </div>

                  <!-- CASO 2: MARCAÇÃO INICIAL (mark) -->
                  {:else if h.action === 'mark'}
                    {@const markCat = getCategoryObj(details.category)}
                    {@const markTitle = getCategoryTitle(markCat, details.category)}
                    {@const markMetric = normalizeCategoryMetricType(details.metricType || details.status, 'pending')}
                    {@const markColor = getCategoryColor(markCat, details.category, markMetric)}
                    <p class="timelineNarrative">
                      📌 Artigo inserido na pesquisa e classificado na fase <strong>"{getPhaseTitle(details.phaseLabel)}"</strong>.
                    </p>
                    <div class="timelineBadgesRow">
                      {#if details.category}
                        <span class="timelinePill" style="border-left: 3px solid {markColor};">
                          <span class="pillDot" style="background: {markColor};"></span>
                          <span>Categoria: <strong>{markTitle}</strong></span>
                        </span>
                      {/if}
                      <span class="timelineMetricBadge metric-{markMetric}">
                        {markMetric === 'included' ? '✓ Incluído' : markMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                      </span>
                    </div>

                  <!-- CASO 3: RECLASSIFICAÇÃO INDIVIDUAL (reclassify) -->
                  {:else if h.action === 'reclassify'}
                    {@const newCat = getCategoryObj(details.category)}
                    {@const newTitle = getCategoryTitle(newCat, details.category)}
                    {@const newMetric = normalizeCategoryMetricType(details.metricType || details.status, 'pending')}
                    {@const newColor = getCategoryColor(newCat, details.category, newMetric)}

                    {@const prevCat = getCategoryObj(details.previousCategory)}
                    {@const prevTitle = getCategoryTitle(prevCat, details.previousCategory)}
                    {@const rawPrevStatus = details.previousStatus || details.prevStatus}
                    {@const prevMetric = rawPrevStatus && rawPrevStatus !== 'new' ? normalizeCategoryMetricType(rawPrevStatus, 'pending') : null}
                    {@const prevColor = getCategoryColor(prevCat, details.previousCategory, prevMetric)}

                    {@const phaseName = getPhaseTitle(details.phaseLabel)}

                    <p class="timelineNarrative">
                      🔄 Classificação do artigo alterada na fase <strong>"{phaseName}"</strong>.
                    </p>

                    {#if details.previousCategory || prevMetric}
                      <div class="timelineMovementCard">
                        <div class="movementCol movementFrom">
                          <span class="movementLabel">Estado Anterior:</span>
                          <div class="movementPill" style="border-left: 3px solid {prevColor};">
                            <span class="pillDot" style="background: {prevColor};"></span>
                            <span class="movementCatName">{prevTitle}</span>
                            {#if prevMetric}
                              <span class="timelineMetricBadge metric-{prevMetric}">
                                {prevMetric === 'included' ? '✓ Incluído' : prevMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                              </span>
                            {/if}
                          </div>
                        </div>

                        <div class="movementArrowCol" aria-hidden="true">
                          <span class="movementArrowIcon">➔</span>
                        </div>

                        <div class="movementCol movementTo">
                          <span class="movementLabel">Novo Estado Definido:</span>
                          <div class="movementPill highlightTo" style="border-left: 3px solid {newColor};">
                            <span class="pillDot" style="background: {newColor};"></span>
                            <span class="movementCatName">{newTitle}</span>
                            <span class="timelineMetricBadge metric-{newMetric}">
                              {newMetric === 'included' ? '✓ Incluído' : newMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>
                    {:else}
                      <div class="timelineBadgesRow">
                        <span class="timelinePill" style="border-left: 3px solid {newColor};">
                          <span class="pillDot" style="background: {newColor};"></span>
                          <span>Nova Categoria: <strong>{newTitle}</strong></span>
                        </span>
                        <span class="timelineMetricBadge metric-{newMetric}">
                          {newMetric === 'included' ? '✓ Incluído' : newMetric === 'excluded' ? '× Excluído' : '⏳ Pendente'}
                        </span>
                      </div>
                    {/if}

                  <!-- CASO 4: MIGRAÇÃO DE CATEGORIA (migrate_category) -->
                  {:else if h.action === 'migrate_category'}
                    {@const fromCat = getCategoryObj(details.fromCategory)}
                    {@const toCat = getCategoryObj(details.toCategory)}
                    {@const toColor = normalizeHexColor(toCat?.color, '#2563eb')}
                    <div class="timelineMigrationBox">
                      <div class="migrationNarrative">
                        🔀 <strong>Transferência de Categoria Obrigatória:</strong>
                        A categoria anterior foi excluída do projeto. Para preservar a integridade metodológica e impedir artigos órfãos, o artigo foi transferido para outra categoria ativa.
                      </div>
                      <div class="timelineMovementCard" style="background: transparent; border: none; padding: 0;">
                        <div class="movementCol movementFrom">
                          <span class="movementLabel" style="color:#7e22ce;">Categoria Excluída:</span>
                          <div class="movementPill" style="background: #ffffff; border-style: dashed;">
                            <span>{fromCat?.title || details.fromCategory || 'Categoria Removida'}</span>
                          </div>
                        </div>
                        <div class="movementArrowCol" aria-hidden="true">
                          <span class="movementArrowIcon" style="color: #7e22ce;">➔</span>
                        </div>
                        <div class="movementCol movementTo">
                          <span class="movementLabel" style="color:#7e22ce;">Nova Categoria Herdada:</span>
                          <div class="movementPill highlightTo" style="background: #ffffff; border-left: 3px solid {toColor};">
                            <span class="pillDot" style="background: {toColor};"></span>
                            <strong>{toCat?.title || details.toCategory}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                  <!-- CASO 5: HERANÇA / AVANÇO DE FASE (carry_forward ou inherit) -->
                  {:else if h.action === 'carry_forward' || h.action === 'inherit'}
                    {@const fromPhase = getPhaseTitle(details.fromPhaseLabel || details.fromPhase)}
                    {@const toPhase = getPhaseTitle(details.toPhaseLabel || details.toPhase)}
                    {@const cat = getCategoryObj(details.category)}
                    {@const catColor = normalizeHexColor(cat?.color, '#22c55e')}
                    <p class="timelineNarrative">
                      ⏭️ <strong>Avanço Metodológico:</strong> Artigo aprovado na etapa anterior e herdado como base para a etapa seguinte.
                    </p>
                    <div class="timelineMovementCard">
                      <div class="movementCol movementFrom">
                        <span class="movementLabel">Fase de Origem:</span>
                        <div class="movementPill">
                          <span>{fromPhase}</span>
                        </div>
                      </div>
                      <div class="movementArrowCol" aria-hidden="true">
                        <span class="movementArrowIcon">➔</span>
                      </div>
                      <div class="movementCol movementTo">
                        <span class="movementLabel">Herdado na Fase:</span>
                        <div class="movementPill highlightTo" style="border-left: 3px solid {catColor};">
                          <span class="pillDot" style="background: {catColor};"></span>
                          <span>{toPhase}</span>
                          {#if cat}
                            <span class="timelineMetricBadge metric-included">{cat.title || cat.label}</span>
                          {/if}
                        </div>
                      </div>
                    </div>

                  <!-- CASO 6: EDIÇÃO DE METADADOS (update_field) -->
                  {:else if h.action === 'update_field'}
                    {@const fieldName = details.field === 'year' ? 'Ano de Publicação' : details.field === 'tags' ? 'Tags do Artigo' : details.field === 'notes' ? 'Anotações' : (details.field || 'Metadado')}
                    <p class="timelineNarrative">
                      ✏️ O campo <strong>"{fieldName}"</strong> foi modificado.
                    </p>
                    <div class="timelineFieldDiff">
                      {#if details.oldValue !== undefined && details.oldValue !== null}
                        <span class="diffOld">Antes: <s>{String(details.oldValue || '—')}</s></span>
                        <span class="diffArrow">➔</span>
                      {/if}
                      <span class="diffNew">Novo: <strong>{String(details.newValue ?? details.value ?? '—')}</strong></span>
                    </div>

                  <!-- CASO 7: REMOÇÃO DE MARCAÇÃO (unmark) -->
                  {:else if h.action === 'unmark'}
                    {@const phaseName = getPhaseTitle(details.phaseLabel)}
                    <div class="timelineUnmarkBox">
                      <p class="timelineNarrative" style="color: #be123c; margin-bottom: 4px;">
                        🗑️ <strong>Classificação Desfeita:</strong> A marcação deste artigo foi removida da fase <strong>"{phaseName}"</strong>.
                      </p>
                      <span class="timelinePreviousHint" style="color: #be123c;">
                        O artigo voltou ao estado inicial (pendente) nesta fase da pesquisa.
                      </span>
                    </div>

                  <!-- CASO 8: FALLBACK FORMATADO COM CHIPS LEGÍVEIS -->
                  {:else}
                    <p class="timelineNarrative">
                      Registro de auditoria: <strong>{meta.title}</strong>
                    </p>
                    {#if Object.keys(details).length > 0}
                      <div class="timelineDetailsChips">
                        {#each Object.entries(details) as [k, v]}
                          <span class="detailChip">
                            <span class="chipKey">{translateDetailKey(k)}:</span>
                            <span class="chipVal">{translateDetailValue(k, v)}</span>
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
