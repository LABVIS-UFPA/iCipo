<script>
  import {
    projectStore,
    openCategoryPanel,
    requestCategoryDeletionAction
  } from '../dashboardStore.js';
  import {
    normalizeHexColor,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory,
    getReadableCategoryTextColor,
    getCategoryDeletionBlockReason,
    isDefaultCategory,
    PAPER_METRIC_LABELS
  } from '../dashboardHelpers.js';

  export let category = {};

  $: project = $projectStore || {};
  $: isDefault = isDefaultCategory(category.label);
  $: color = normalizeHexColor(category.color, '#4CAF50');
  $: textColor = getReadableCategoryTextColor(color);
  $: usesDarkText = textColor === '#101828';
  $: metricType = normalizeCategoryMetricType(category.metricType, inferMetricTypeFromCategory(category));
  $: metricLabel = PAPER_METRIC_LABELS[metricType] || 'Pendente';
  $: deletionBlockReason = getCategoryDeletionBlockReason(project, category.label);

  function handleEdit() {
    openCategoryPanel(category);
  }

  async function handleDelete() {
    try {
      await requestCategoryDeletionAction(category);
    } catch (err) {
      console.warn('Falha ao excluir categoria:', err);
      alert(err?.message || 'Falha ao excluir categoria.');
    }
  }
</script>

<li
  class="categoryItem"
  style="background-color: {color}; --category-foreground: {textColor}; --category-description: {textColor};"
  data-category-tone={usesDarkText ? 'light' : 'dark'}
>
  <div class="left">
    <span class="pill" style="background-color: {color}"></span>
    <div style="min-width: 0;">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="title">{category.title || category.label}</span>
        {#if isDefault}
          <span class="categoryKindBadge categoryKindBadge--default" title="Categoria padrão do iCipó">Padrão</span>
        {:else}
          <span class="categoryKindBadge categoryKindBadge--custom" title="Categoria personalizada">Personalizada</span>
        {/if}
      </div>
      {#if category.description}
        <span class="sub">{category.description}</span>
      {/if}
    </div>
  </div>

  <div class="right">
    <span class="categoryMetricBadge categoryMetricBadge--{metricType}" title="Impacto na métrica: {metricLabel}">
      {metricLabel}
    </span>
    <span class="meta" style="font-family: monospace; font-size: 12px;">{color}</span>
    <button type="button" on:click={handleEdit}>
      <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>Editar</span>
    </button>
    <button
      type="button"
      disabled={Boolean(deletionBlockReason)}
      title={deletionBlockReason || `Excluir a categoria ${category.title || category.label}`}
      on:click={handleDelete}
    >
      <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      <span>Excluir</span>
    </button>
  </div>
</li>
