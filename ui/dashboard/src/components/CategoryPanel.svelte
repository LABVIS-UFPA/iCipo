<script>
  import {
    projectStore,
    isCategoryPanelOpenStore,
    editingCategoryStore,
    categoryCreationRequiredStore,
    closeCategoryPanel,
    saveCategoryAction,
    deleteCategoryAction,
    createDefaultCategoriesAction
  } from '../dashboardStore.js';
  import {
    getCategoryDeletionBlockReason,
    normalizeHexColor,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory
  } from '../dashboardHelpers.js';

  let title = '';
  let description = '';
  let color = '#4CAF50';
  let metricType = 'included';
  let criteria = [];
  let newCriterion = '';
  let titleError = '';
  let defaultCategoriesError = '';
  let isSaving = false;
  let isCreatingDefaults = false;
  let isDeleting = false;

  $: isOpen = $isCategoryPanelOpenStore;
  $: editingCategory = $editingCategoryStore;
  $: categoryCreationRequired = $categoryCreationRequiredStore;
  $: project = $projectStore || {};

  $: isEditing = Boolean(editingCategory && editingCategory.label);
  $: deletionBlockReason = isEditing
    ? getCategoryDeletionBlockReason(project, editingCategory.label)
    : '';

  // Synchronize form when editingCategory changes or panel opens
  $: if (isOpen) {
    if (editingCategory) {
      title = editingCategory.title || '';
      description = editingCategory.description || '';
      color = normalizeHexColor(editingCategory.color, '#4CAF50');
      metricType = normalizeCategoryMetricType(
        editingCategory.metricType,
        inferMetricTypeFromCategory(editingCategory)
      );
      criteria = Array.isArray(editingCategory.criteria) ? [...editingCategory.criteria] : [];
    } else {
      title = '';
      description = '';
      color = '#4CAF50';
      metricType = 'included';
      criteria = [];
    }
    newCriterion = '';
    titleError = '';
    defaultCategoriesError = '';
  }

  function handleClose() {
    if (categoryCreationRequired) {
      window.location.href = '../projects/projects.html';
      return;
    }
    closeCategoryPanel();
  }

  function handleColorChange(event) {
    color = event.target.value.toUpperCase();
  }

  function addCriterion() {
    const text = newCriterion.trim();
    if (!text) return;
    if (!criteria.includes(text)) {
      criteria = [...criteria, text];
    }
    newCriterion = '';
  }

  function removeCriterion(index) {
    criteria = criteria.filter((_, i) => i !== index);
  }

  function handleCriterionKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCriterion();
    }
  }

  async function handleCreateDefaults() {
    defaultCategoriesError = '';
    isCreatingDefaults = true;
    try {
      await createDefaultCategoriesAction();
      closeCategoryPanel();
    } catch (err) {
      console.warn('Falha ao criar categorias padrão:', err);
      defaultCategoriesError = err?.message || 'Não foi possível criar as categorias padrão.';
    } finally {
      isCreatingDefaults = false;
    }
  }

  async function handleSave() {
    titleError = '';
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      titleError = 'Preencha o título da categoria.';
      return;
    }

    const data = {
      title: cleanTitle,
      label: isEditing ? editingCategory.label : cleanTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: description.trim(),
      color: color,
      metricType: normalizeCategoryMetricType(metricType, 'pending'),
      criteria: [...criteria]
    };

    isSaving = true;
    try {
      await saveCategoryAction(data, isEditing ? editingCategory.label : null);
      closeCategoryPanel();
    } catch (err) {
      console.warn('Falha ao salvar categoria:', err);
      titleError = err?.message || 'Não foi possível salvar a categoria.';
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!isEditing || deletionBlockReason) return;
    if (!confirm(`Excluir a categoria "${title}"?`)) return;

    isDeleting = true;
    try {
      await deleteCategoryAction(editingCategory.label);
      closeCategoryPanel();
    } catch (err) {
      console.warn('Falha ao excluir categoria:', err);
      alert(err?.message || 'Falha ao excluir categoria.');
    } finally {
      isDeleting = false;
    }
  }
</script>

{#if isOpen}
  <div
    class="sideOverlay"
    on:click={handleClose}
    aria-hidden="true"
  ></div>

  <div
    id="categoryPanel"
    class="sidePanel"
    class:open={isOpen}
    class:categoryCreationRequiredPanel={categoryCreationRequired}
    role="dialog"
    aria-labelledby="categoryPanelTitle"
  >
    <div class="sidePanelHeader">
      <div id="categoryPanelTitle" style="font-weight:900">
        {categoryCreationRequired ? 'Crie a primeira categoria' : (isEditing ? 'Editar categoria' : 'Nova categoria')}
      </div>
      <button id="btnCloseCategory" class="btn" on:click={handleClose}>
        {categoryCreationRequired ? 'Voltar aos projetos' : 'Fechar'}
      </button>
    </div>

    <div class="sidePanelBody u-scroll-y">
      {#if categoryCreationRequired}
        <div
          id="categoryRequiredNotice"
          class="phaseRequiredNotice"
          role="alert"
          aria-live="assertive"
        >
          <span class="requiredStepLabel">Tutorial · Etapa 3 de 4</span>
          <strong>Crie as categorias da sua triagem</strong>
          <span>
            As categorias organizam e identificam os artigos durante cada fase.
            Você pode criá-las manualmente ou usar a sugestão padrão do iCipó com um clique.
          </span>
        </div>

        <div id="defaultCategoriesSuggestion" class="defaultCategoriesSuggestion">
          <div class="defaultCategoriesSuggestionHeader">
            <div>
              <span class="tutorialEyebrow">Sugestão do iCipó</span>
              <strong>Categorias essenciais para começar</strong>
            </div>
            <span class="defaultCategoriesSuggestionBadge">1 clique</span>
          </div>
          <p>
            Crie automaticamente as três categorias necessárias para o fluxo de
            triagem. Você poderá editar nome, descrição, cor e critérios depois.
          </p>
          <div class="defaultCategoriesPreview" aria-label="Categorias padrão sugeridas">
            <span><i class="defaultCategoryDot defaultCategoryDotIncluded"></i>Incluir</span>
            <span><i class="defaultCategoryDot defaultCategoryDotExcluded"></i>Excluir</span>
            <span><i class="defaultCategoryDot defaultCategoryDotPending"></i>Pendente</span>
          </div>
          <button
            id="btnCreateDefaultCategories"
            type="button"
            class="btn defaultCategoriesButton"
            disabled={isCreatingDefaults}
            on:click={handleCreateDefaults}
          >
            {isCreatingDefaults ? 'Criando categorias...' : 'Criar categorias padrão'}
          </button>
          {#if defaultCategoriesError}
            <div id="defaultCategoriesError" class="fieldError visible" aria-live="polite">
              {defaultCategoriesError}
            </div>
          {/if}
        </div>

        <div class="categoryManualDivider">
          <span>ou crie manualmente</span>
        </div>
      {/if}

      <label for="categoryTitle">Título da categoria</label>
      <input
        id="categoryTitle"
        class="input"
        placeholder="Ex.: Incluído"
        bind:value={title}
        on:input={() => { if (title.trim()) titleError = ''; }}
      />
      {#if titleError}
        <div id="categoryTitleError" class="fieldError visible" aria-live="polite">{titleError}</div>
      {/if}

      <label for="categoryDescription">Descrição</label>
      <textarea
        id="categoryDescription"
        class="input"
        style="min-height:110px"
        placeholder="Explique quando esta categoria deve ser utilizada"
        bind:value={description}
      ></textarea>

      <label for="categoryColor">Cor</label>
      <div class="categoryColorRow">
        <input
          type="color"
          id="categoryColor"
          class="input categoryColorInput"
          value={color}
          on:input={handleColorChange}
        />
        <span id="categoryColorValue" class="categoryColorValue">{color}</span>
      </div>

      <label for="categoryMetricType">Impacto na métrica</label>
      <select id="categoryMetricType" class="input select" bind:value={metricType}>
        <option value="included">Incluído</option>
        <option value="excluded">Excluído</option>
        <option value="pending">Não contabilizar / Pendente</option>
      </select>
      <div class="categoryMetricHelp">
        Define em qual indicador da Visão Geral os artigos desta categoria
        serão contabilizados. Duplicatas são identificadas automaticamente pelo link.
      </div>

      <fieldset class="categoryFieldset">
        <legend>Critérios da categoria</legend>
        <div class="categoryCriterionComposer">
          <input
            id="categoryCriterionNew"
            class="input"
            placeholder="Digite um novo critério"
            bind:value={newCriterion}
            on:keydown={handleCriterionKeydown}
          />
          <button id="btnAddCategoryCriterion" type="button" class="btn" on:click={addCriterion}>
            Adicionar
          </button>
        </div>
        <div id="categoryCriteria" class="categoriesList categoryRequirementsList" aria-live="polite">
          {#if criteria.length === 0}
            <div class="muted categoryEmptyRequirements">Nenhum critério cadastrado.</div>
          {:else}
            {#each criteria as criterion, index (criterion + index)}
              <div class="categoryCriterionItem">
                <span>{criterion}</span>
                <button
                  type="button"
                  class="btn small ghost danger"
                  title="Remover critério"
                  on:click={() => removeCriterion(index)}
                >
                  ✕
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </fieldset>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button
          id="btnSaveCategory"
          class="btn"
          type="button"
          disabled={isSaving}
          on:click={handleSave}
        >
          {isSaving ? 'Salvando...' : 'Salvar categoria'}
        </button>
        {#if isEditing}
          <button
            id="btnDeleteCategory"
            class="btn danger"
            type="button"
            disabled={Boolean(deletionBlockReason) || isDeleting}
            title={deletionBlockReason || 'Excluir categoria'}
            on:click={handleDelete}
          >
            {isDeleting ? 'Excluindo...' : 'Excluir categoria'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
