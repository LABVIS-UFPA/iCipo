<script>
  import {
    getPhaseArchiveRecords,
    normalizeMetricType,
    normalizeHexColor,
    formatOverviewDate,
    extractPaperYear,
    getPaperAuthorsText
  } from '../dashboardHelpers.js';
  import { projectStore, papersStore } from '../dashboardStore.js';

  export let phase = {};

  $: records = getPhaseArchiveRecords(phase, $papersStore);
  $: categories = Array.isArray($projectStore?.categories) ? $projectStore.categories : [];

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

  function getOutcomeLabel(record) {
    if (record.inherited) return 'Herdado';
    const norm = normalizeMetricType(record.outcome, 'pending');
    if (norm === 'included') return 'Selecionado';
    if (norm === 'excluded') return 'Removido';
    return 'Pendente';
  }
</script>

<div class="phaseArchivePanel" role="region" aria-label="Artigos da fase {phase.title || phase.label}">
  <div class="phaseArchiveHeader">
    <div class="phaseArchiveTitle">Artigos desta fase ({records.length})</div>
  </div>

  {#if records.length === 0}
    <div class="phaseArchiveEmpty">Nenhum artigo classificado ou registrado nesta fase.</div>
  {:else}
    <div class="phaseArchiveList u-scroll-y">
      {#each records as record (record.key)}
        {@const catInfo = getCategoryInfo(record)}
        {@const outcome = normalizeMetricType(record.outcome, 'pending')}
        {@const authors = getPaperAuthorsText(record.paper)}
        {@const year = extractPaperYear(record.paper)}
        <article class="phaseArchiveArticle phaseArchiveArticle--{record.inherited ? 'inherited' : outcome}">
          <div class="phaseArchiveArticleHeader">
            <span class="phaseArchiveOutcomeBadge outcome--{outcome}">
              {getOutcomeLabel(record)}
            </span>
            <span class="phaseArchiveCategoryBadge">
              <i style="background: {catInfo.color}"></i>
              {catInfo.name}
            </span>
            {#if record.classifiedAt}
              <span class="phaseArchiveDate">
                {formatOverviewDate(record.classifiedAt, true)}
              </span>
            {/if}
          </div>

          <div class="phaseArchiveArticleTitle">
            {#if record.paper?.url}
              <a href={record.paper.url} target="_blank" rel="noreferrer" title="Abrir artigo">
                {record.paper.title || record.paper.url || '(sem título)'}
              </a>
            {:else}
              {record.paper?.title || '(sem título)'}
            {/if}
          </div>

          <div class="phaseArchiveArticleMeta">
            {#if authors !== '—'}
              <span>{authors}</span>
            {/if}
            {#if year}
              <span>· {year}</span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
