<script>
  import {
    projectStore,
    openCategoryPanel,
    openCategoryTransferModal
  } from '../dashboardStore.js';
  import CategoryItem from '../components/CategoryItem.svelte';

  $: project = $projectStore || {};
  $: rawCategories = Array.isArray(project.categories) ? project.categories : [];
  $: categories = [...rawCategories].sort((a, b) => String(a.title || a.label).localeCompare(String(b.title || b.label)));

  function handleAddCategory() {
    openCategoryPanel(null);
  }
</script>

<section class="view categoriesView" id="view_categories">
  <div class="panelHeader">
    <div class="viewTitleWithBadge">
      <span class="viewTitleIconBadge" aria-hidden="true">
        <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </span>
      <h2>Categorias</h2>
    </div>
    <p>
      Gerencie as categorias padrão (<b>Incluir</b>, <b>Excluir</b> e <b>Pendente</b>), que vêm ativadas por padrão em todas as fases, e crie categorias personalizadas com desfecho vinculado às métricas da pesquisa.
    </p>
  </div>

  <div class="toolbar">
    <div style="display:flex;gap:10px;align-items:center;width:100%;flex-wrap:wrap">
      <button id="btnShowAddCategory" class="btn" type="button" on:click={handleAddCategory}>
        <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Criar categoria personalizada</span>
      </button>
      <button class="btn secondary" type="button" on:click={() => openCategoryTransferModal()}>
        <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="15" y1="15" x2="21" y2="21"/>
          <line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
        <span>Mover artigos entre categorias</span>
      </button>
      <div class="muted" style="margin-left:auto">
        Categorias personalizadas somam automaticamente no indicador ao qual foram associadas.
      </div>
    </div>
  </div>

  <div class="card card--categories" style="margin-top:12px">
    <div class="cardTitle" style="display:flex;align-items:center;gap:7px">
      <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--green)" aria-hidden="true">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
      <span>Lista de categorias</span>
    </div>
    <div class="muted" style="margin-bottom:8px">
      Use <b>Editar</b> para gerenciar o nome, cor, critérios ou remover a categoria.
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
