<script>
  import {
    projectStore,
    papersStore,
    highlightedLinksStore,
    overviewMetricScopeStore,
    activePhaseLabelStore,
    overviewMetricsStore,
    categoryDistributionStore,
    phaseProgressStore,
    recentArticlesStore,
    setOverviewMetricScope,
    openPapersWithFilter,
    setActiveView
  } from '../dashboardStore.js';
  import {
    formatOverviewDate,
    formatMetricPercentage,
    extractPaperYear,
    getPaperAuthorsText,
    getPaperPhaseTitle,
    getPaperCategoryColor,
    normalizeHexColor,
    getOverviewPaperCategory,
    resolveOverviewPhaseLabel,
    getPaperClassificationForPhase
  } from '../dashboardHelpers.js';

  $: project = $projectStore || {};
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: activePhaseLabel = $activePhaseLabelStore;
  $: scope = $overviewMetricScopeStore;

  $: latestPaperDate = ($papersStore || [])
    .map(p => p?.updatedAt || p?.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  $: updatedAt = project.updatedAt || latestPaperDate || project.createdAt;
  $: updatedText = updatedAt
    ? `Última atualização: ${formatOverviewDate(updatedAt, true).toLowerCase()}`
    : 'Última atualização: agora';

  $: scopeHint = scope === 'all'
    ? 'Resumo consolidado de todas as fases do projeto.'
    : 'Métricas dos artigos selecionados ou avaliados na fase.';

  $: metrics = $overviewMetricsStore;
  $: distribution = $categoryDistributionStore;
  $: phaseProgress = $phaseProgressStore;
  $: recentArticles = $recentArticlesStore;

  $: totalPapersInDistribution = distribution.reduce((sum, item) => sum + item.count, 0);

  $: donutGradient = (() => {
    if (!totalPapersInDistribution) return 'conic-gradient(#E5E9F0 0 100%)';
    let cursor = 0;
    const segments = [];
    for (const entry of distribution) {
      if (!entry.count) continue;
      const start = cursor;
      cursor += (entry.count / totalPapersInDistribution) * 100;
      segments.push(`${entry.color} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`);
    }
    return `conic-gradient(${segments.join(', ') || '#E5E9F0 0 100%'})`;
  })();

  function handleScopeChange(event) {
    setOverviewMetricScope(event.target.value);
  }

  function handleMetricClick(metricType) {
    const phaseParam = scope === 'all' ? 'all' : scope;
    openPapersWithFilter({ metric: metricType, phase: phaseParam });
  }

  function handleCategoryClick(categoryKey) {
    const phaseParam = scope === 'all' ? 'all' : scope;
    openPapersWithFilter({ category: categoryKey, phase: phaseParam });
  }

  function getArticleCategoryInfo(paper) {
    const category = getOverviewPaperCategory(paper, scope, project.categories, $highlightedLinksStore, activePhaseLabel);
    const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
    const color = category?.color
      ? normalizeHexColor(category.color, '#A5ADBA')
      : (phaseLabel === 'all' ? getPaperCategoryColor(paper, project.categories, $highlightedLinksStore) : '#A5ADBA');
    const label = category?.title || category?.label || 'Sem categoria';
    return { color, label };
  }

  function getArticleDate(paper) {
    const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
    if (phaseLabel && phaseLabel !== 'all') {
      const classification = getPaperClassificationForPhase(paper, phaseLabel);
      return classification?.classifiedAt || paper?.updatedAt || paper?.createdAt || '';
    }
    return paper?.updatedAt || paper?.createdAt || '';
  }

  function getArticlePhaseDisplay(paper) {
    const phaseLabel = resolveOverviewPhaseLabel(scope, activePhaseLabel);
    if (phaseLabel && phaseLabel !== 'all') {
      const matched = phases.find(item => item?.label === phaseLabel);
      return matched?.title || phaseLabel;
    }
    return getPaperPhaseTitle(paper, phases, activePhaseLabel);
  }
</script>

<section class="view overviewView" id="view_overview">
  <div class="overviewHeading">
    <div>
      <h2>Visão Geral</h2>
      <p>
        Acompanhe o progresso do seu projeto e explore os principais indicadores.
      </p>
    </div>
    <div class="overviewUpdated">
      <span aria-hidden="true">◷</span>
      <span id="overviewUpdatedAt">{updatedText}</span>
    </div>
  </div>

  <div class="overviewMetricScope" aria-label="Escopo das métricas da visão geral">
    <label for="overviewMetricScopeSelect">
      <span>Visualizar métricas</span>
      <select
        id="overviewMetricScopeSelect"
        aria-label="Selecionar escopo das métricas"
        value={scope}
        on:change={handleScopeChange}
      >
        <option value="all">Projeto geral</option>
        {#each phases as phase, index (phase.label || index)}
          <option value={phase.label}>
            {phase.title || phase.label || `Fase ${index + 1}`}
            {phase.label === activePhaseLabel ? ' (ativa)' : ''}
          </option>
        {/each}
      </select>
    </label>
    <small id="overviewMetricScopeHint">{scopeHint}</small>
  </div>

  <div class="paperMetricsGrid" aria-label="Resumo da seleção de artigos">
    <button
      class="paperMetricCard paperMetricCard--total"
      type="button"
      data-paper-metric="all"
      aria-label="Ver todos os artigos"
      on:click={() => handleMetricClick('all')}
    >
      <span class="paperMetricIcon" aria-hidden="true">▤</span>
      <span class="paperMetricContent">
        <span class="paperMetricLabel">Total</span>
        <strong id="paperMetricTotal">{metrics.total}</strong>
        <small id="paperMetricTotalDetail">
          {metrics.total ? `${metrics.total} ${metrics.total === 1 ? 'artigo registrado' : 'artigos registrados'}` : 'Nenhum artigo registrado'}
        </small>
      </span>
      <span class="paperMetricArrow" aria-hidden="true">→</span>
    </button>

    <button
      class="paperMetricCard paperMetricCard--included"
      type="button"
      data-paper-metric="included"
      aria-label="Ver artigos incluídos"
      on:click={() => handleMetricClick('included')}
    >
      <span class="paperMetricIcon" aria-hidden="true">✓</span>
      <span class="paperMetricContent">
        <span class="paperMetricLabel">Incluídos</span>
        <strong id="paperMetricIncluded">{metrics.included}</strong>
        <small id="paperMetricIncludedDetail">{formatMetricPercentage(metrics.included, metrics.total)}</small>
      </span>
      <span class="paperMetricArrow" aria-hidden="true">→</span>
    </button>

    <button
      class="paperMetricCard paperMetricCard--excluded"
      type="button"
      data-paper-metric="excluded"
      aria-label="Ver artigos excluídos"
      on:click={() => handleMetricClick('excluded')}
    >
      <span class="paperMetricIcon" aria-hidden="true">×</span>
      <span class="paperMetricContent">
        <span class="paperMetricLabel">Excluídos</span>
        <strong id="paperMetricExcluded">{metrics.excluded}</strong>
        <small id="paperMetricExcludedDetail">{formatMetricPercentage(metrics.excluded, metrics.total)}</small>
      </span>
      <span class="paperMetricArrow" aria-hidden="true">→</span>
    </button>

    <button
      class="paperMetricCard paperMetricCard--pending"
      type="button"
      data-paper-metric="pending"
      aria-label="Ver artigos pendentes"
      on:click={() => handleMetricClick('pending')}
    >
      <span class="paperMetricIcon" aria-hidden="true">◷</span>
      <span class="paperMetricContent">
        <span class="paperMetricLabel">Pendentes</span>
        <strong id="paperMetricPending">{metrics.pending}</strong>
        <small id="paperMetricPendingDetail">{formatMetricPercentage(metrics.pending, metrics.total)}</small>
      </span>
      <span class="paperMetricArrow" aria-hidden="true">→</span>
    </button>
  </div>

  <div class="overviewLayout overviewLayoutTop overviewLayoutPrimary">
    <article class="overviewCard categoryDistributionCard">
      <div class="overviewCardHeader">
        <div class="overviewCardTitle">
          <span class="overviewTitleIcon">◫</span> Distribuição por categoria
        </div>
      </div>
      <div class="categoryDistributionBody">
        <div
          id="categoryDonut"
          class="categoryDonut"
          role="img"
          aria-label="Distribuição dos artigos por categoria"
          style="background: {donutGradient}"
        >
          <div class="categoryDonutCenter">
            <strong id="categoryDonutTotal">{totalPapersInDistribution}</strong>
            <span>Total</span>
          </div>
        </div>
        <div id="categoryLegend" class="categoryLegend">
          {#each distribution as entry (entry.key)}
            {@const percentage = totalPapersInDistribution ? (entry.count / totalPapersInDistribution) * 100 : 0}
            <button
              type="button"
              class="categoryLegendRow"
              on:click={() => handleCategoryClick(entry.key)}
            >
              <span class="categoryLegendLabel">
                <i style="background: {entry.color}"></i>
                {entry.label}
              </span>
              <span>
                {entry.count} ({percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
              </span>
            </button>
          {/each}
        </div>
      </div>
      <button
        class="overviewCardLink"
        type="button"
        data-overview-view="categories"
        on:click={() => setActiveView('categories')}
      >
        Ver todas as categorias <span>→</span>
      </button>
    </article>

    <article class="overviewCard phaseProgressCard">
      <div class="overviewCardHeader">
        <div class="overviewCardTitle">
          <span class="overviewTitleIcon">▧</span> Progresso das fases
        </div>
      </div>
      <div id="phaseProgressList" class="phaseProgressList">
        {#if phaseProgress.length === 0}
          <div class="overviewEmptyState">Crie uma fase para acompanhar o progresso do projeto.</div>
        {:else}
          {#each phaseProgress.slice(0, 6) as item, index (item.phase?.label || index)}
            <button
              type="button"
              class="phaseProgressRow"
              on:click={() => setActiveView('phases')}
            >
              <span class="phaseProgressNumber">{index + 1}</span>
              <span class="phaseProgressContent">
                <span class="phaseProgressTop">
                  <strong>{item.phase?.title || `Fase ${index + 1}`}</strong>
                  <span>{item.processed}/{item.total}</span>
                </span>
                <span class="phaseProgressTrack">
                  <i style="width: {item.percentage}%"></i>
                </span>
              </span>
            </button>
          {/each}
        {/if}
      </div>
      <button
        class="overviewCardLink"
        type="button"
        data-overview-view="phases"
        on:click={() => setActiveView('phases')}
      >
        Ver todas as fases <span>→</span>
      </button>
    </article>
  </div>

  <article class="overviewCard recentArticlesCard">
    <div class="overviewCardHeader">
      <div class="overviewCardTitle">
        <span class="overviewTitleIcon">▣</span> Artigos recentes
      </div>
    </div>
    <div class="overviewRecentTableWrap">
      <table class="overviewRecentTable" id="overviewRecentTable">
        <thead>
          <tr>
            <th>Título</th>
            <th>Autores</th>
            <th>Ano</th>
            <th>Categoria</th>
            <th>Fase</th>
            <th>Adicionado em</th>
          </tr>
        </thead>
        <tbody>
          {#if recentArticles.length === 0}
            <tr>
              <td colspan="6" class="overviewEmptyCell">Nenhum artigo marcado neste projeto.</td>
            </tr>
          {:else}
            {#each recentArticles as paper (paper.id || paper.url)}
              {@const categoryInfo = getArticleCategoryInfo(paper)}
              {@const year = extractPaperYear(paper) || '—'}
              {@const date = getArticleDate(paper)}
              {@const phaseTitle = getArticlePhaseDisplay(paper)}
              <tr>
                <td class="overviewRecentTitle">
                  {#if paper.url}
                    <a href={paper.url} target="_blank" rel="noreferrer" title="Abrir artigo">
                      {paper.title || paper.url || '(sem título)'}
                    </a>
                  {:else}
                    {paper.title || '(sem título)'}
                  {/if}
                </td>
                <td>{getPaperAuthorsText(paper)}</td>
                <td>{year}</td>
                <td>
                  <span class="overviewCategoryBadge">
                    <i style="background: {categoryInfo.color}"></i>
                    {categoryInfo.label}
                  </span>
                </td>
                <td>{phaseTitle}</td>
                <td>{formatOverviewDate(date, true)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </article>
</section>
