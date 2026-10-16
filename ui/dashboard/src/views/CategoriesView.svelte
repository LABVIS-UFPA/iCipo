<script>
  import { projectStore, openCategoryPanel } from '../dashboardStore.js';
  import CategoryItem from '../components/CategoryItem.svelte';
  import CategoryPanel from '../components/CategoryPanel.svelte';

  $: project = $projectStore || {};
  $: rawCategories = Array.isArray(project.categories) ? project.categories : [];
  $: categories = [...rawCategories].sort((a, b) => String(a.title || a.label).localeCompare(String(b.title || b.label)));

  function handleAddCategory() {
    openCategoryPanel(null);
  }
</script>

<section class="view categoriesView" id="view_categories">
  <div class="panelHeader">
    <h2>Categorias</h2>
    <p>
      Crie categorias e defina como cada classificação afeta as métricas.
    </p>
  </div>

  <div class="toolbar">
    <div style="display:flex;gap:8px;align-items:center;width:100%">
      <button id="btnShowAddCategory" class="btn" type="button" on:click={handleAddCategory}>
        Criar categoria
      </button>
      <div class="muted">
        As categorias continuam sendo exibidas com a mesma geometria após a
        criação.
      </div>
    </div>
  </div>

  <div class="card card--categories" style="margin-top:12px">
    <div class="cardTitle">Lista de categorias</div>
    <div class="muted" style="margin-bottom:8px">
      Use <b>Editar</b> para ajustar a finalidade da categoria ou
      <b>Excluir</b> para removê-la.
    </div>

    <div class="tableWrap" style="margin-top:8px">
      <ul id="categoryList" class="categoryList">
        {#if categories.length === 0}
          <div class="overviewEmptyState" style="padding: 24px;">
            Nenhuma categoria cadastrada no projeto. Clique em "Criar categoria" para adicionar.
          </div>
        {:else}
          {#each categories as category (category.label || category.id)}
            <CategoryItem {category} />
          {/each}
        {/if}
      </ul>
    </div>
  </div>
</section>

<CategoryPanel />
