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
    getPaperClassificationForPhase,
    inferMetricTypeFromCategory,
    normalizeCategoryMetricType,
    getOverviewMetricType
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

  function handleCategoryClick(entry) {
    const phaseParam = scope === 'all' ? 'all' : scope;
    const metricType = typeof entry === 'object' && entry ? (entry.metricType || entry.key) : entry;
    openPapersWithFilter({ metric: metricType, category: 'all', phase: phaseParam });
  }

  function getArticleCategoryInfo(paper) {
    let category = getOverviewPaperCategory(paper, scope, project.categories, $highlightedLinksStore, activePhaseLabel);
    if (!category) {
      const metricType = getOverviewMetricType(paper, scope, activePhaseLabel, project.categories, $highlightedLinksStore) || 'pending';
      category = (project.categories || []).find(c => normalizeCategoryMetricType(c.metricType, inferMetricTypeFromCategory(c)) === metricType)
        || (project.categories || [])[0];
    }
    const color = category?.color
      ? normalizeHexColor(category.color, '#2eae6c')
      : '#2eae6c';
    const label = category?.title || category?.label || 'Pendente';
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
      <div class="viewTitleWithBadge">
        <span class="viewTitleIconBadge" aria-hidden="true">
          <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1.5"/>
            <rect x="14" y="3" width="7" height="5" rx="1.5"/>
            <rect x="14" y="12" width="7" height="9" rx="1.5"/>
            <rect x="3" y="16" width="7" height="5" rx="1.5"/>
          </svg>
        </span>
        <h2>Visão Geral</h2>
      </div>
      <p>
        Acompanhe o progresso do seu projeto e explore os principais indicadores.
      </p>
    </div>
    <div class="overviewUpdated">
      <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
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
      <span class="paperMetricIcon" aria-hidden="true">
        <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
          <path d="M6 6h10M6 10h10M6 14h6"/>
        </svg>
      </span>
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
      <span class="paperMetricIcon" aria-hidden="true">
        <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </span>
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
      <span class="paperMetricIcon" aria-hidden="true">
        <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </span>
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
      <span class="paperMetricIcon" aria-hidden="true">
        <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
        </svg>
      </span>
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
          <span class="overviewTitleIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
              <path d="M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
          </span>
          <span>Distribuição por categorias padrão</span>
        </div>
      </div>
      <div class="categoryDistributionBody">
        <div
          id="categoryDonut"
          class="categoryDonut"
          role="img"
          aria-label="Distribuição dos artigos por categorias padrão"
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
              on:click={() => handleCategoryClick(entry)}
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
          <span class="overviewTitleIcon" aria-hidden="true">
            <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16"/>
              <circle cx="8" cy="6" r="2" fill="currentColor"/>
              <circle cx="16" cy="12" r="2" fill="currentColor"/>
            </svg>
          </span>
          <span>Progresso das fases</span>
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
        <span class="overviewTitleIcon" aria-hidden="true">
          <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </span>
        <span>Artigos recentes</span>
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
