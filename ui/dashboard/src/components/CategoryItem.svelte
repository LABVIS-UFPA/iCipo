<script>
  import {
    projectStore,
    openCategoryPanel,
    deleteCategoryAction
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
    if (deletionBlockReason) {
      alert(deletionBlockReason);
      return;
    }
    if (!confirm(`Excluir a categoria "${category.title || category.label}"?`)) return;

    try {
      await deleteCategoryAction(category.label);
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
    <button type="button" on:click={handleEdit}>Editar</button>
    <button
      type="button"
      disabled={Boolean(deletionBlockReason)}
      title={deletionBlockReason || `Excluir a categoria ${category.title || category.label}`}
      on:click={handleDelete}
    >
      Excluir
    </button>
  </div>
</li>
