<script>
  import {
    projectStore,
    papersStore,
    isCategoryPanelOpenStore,
    editingCategoryStore,
    categoryCreationRequiredStore,
    closeCategoryPanel,
    openCategoryTransferModal,
    saveCategoryAction,
    deleteCategoryAction,
    requestCategoryDeletionAction,
    createDefaultCategoriesAction,
    completeCategoryTutorialStep
  } from '../dashboardStore.js';
  import {
    getCategoryDeletionBlockReason,
    normalizeHexColor,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory,
    isDefaultCategory,
    getPapersForCategory
  } from '../dashboardHelpers.js';

  const PRESET_COLORS = [
    '#22C55E',
    '#10B981',
    '#06B6D4',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#F43F5E',
    '#EF4444',
    '#F59E0B',
    '#64748B'
  ];

  function getReadableColor(hex) {
    if (!hex || typeof hex !== 'string') return '#ffffff';
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return '#ffffff';
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 140 ? '#0f172a' : '#ffffff';
  }

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
  $: isDefault = isEditing && isDefaultCategory(editingCategory?.label);
  $: allPapers = $papersStore || [];
  $: linkedPaperCount = (isEditing && editingCategory?.label) ? getPapersForCategory(allPapers, editingCategory.label).length : 0;
  $: deletionBlockReason = isEditing
    ? getCategoryDeletionBlockReason(project, editingCategory.label, allPapers)
    : '';
  $: cannotDelete = isEditing && (Boolean(deletionBlockReason) || isDeleting || isDefault);
  $: deleteTooltip = isDefault
    ? 'As 3 categorias padrão (Incluir, Excluir, Pendente) não podem ser excluídas para manter a consistência do fluxo de triagem.'
    : (deletionBlockReason || 'Excluir categoria');

  function handleOpenTransferFromPanel() {
    const label = editingCategory?.label;
    closeCategoryPanel();
    openCategoryTransferModal(label);
  }

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

  $: projectCategories = Array.isArray(project.categories) ? project.categories : [];
  $: hasAllDefaults = ['included', 'excluded', 'pending'].every(m =>
    projectCategories.some(c => normalizeCategoryMetricType(c?.metricType, inferMetricTypeFromCategory(c || {})) === m)
  );

  function handleClose() {
    if (categoryCreationRequired) {
      if (confirm('O tutorial é obrigatório para configurar o projeto. Deseja sair e voltar para a lista de projetos?')) {
        window.location.href = '../projects/projects.html';
      }
      return;
    }
    closeCategoryPanel();
  }

  async function handleCloseWithAutoSave() {
    if (categoryCreationRequired) {
      const cleanTitle = title.trim();
      if (cleanTitle) {
        try {
          await handleSave();
        } catch (err) {
          console.warn('Falha no auto-save da categoria ao fechar:', err);
        }
      }
      return;
    }

    const cleanTitle = title.trim();

    // Se estiver editando e o título estiver vazio, adverte o usuário e mantém o painel aberto
    if (isEditing && !cleanTitle) {
      titleError = 'Preencha o título da categoria antes de salvar.';
      return;
    }

    // Se o título estiver preenchido, salva automaticamente ao clicar fora
    if (cleanTitle) {
      try {
        await handleSave();
        return;
      } catch (err) {
        console.warn('Falha no auto-save da categoria ao fechar:', err);
        return;
      }
    }

    // Se for uma nova categoria sem título preenchido, fecha diretamente sem salvar
    closeCategoryPanel();
  }

  function handleAdvanceToTutorialStage4() {
    completeCategoryTutorialStep();
  }

  async function handleKeydown(event) {
    if (!isOpen) return;
    if (event.key === 'Escape' && !categoryCreationRequired) {
      await handleCloseWithAutoSave();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      await handleSave();
    }
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
    } catch (err) {
      console.warn('Falha ao criar categorias padrão:', err);
      defaultCategoriesError = err?.message || 'Não foi possível criar as categorias padrão.';
    } finally {
      isCreatingDefaults = false;
    }
  }

  async function handleSave() {
    if (isSaving) return;
    titleError = '';
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      titleError = 'Preencha o título da categoria.';
      return;
    }

    // Se houver algum critério digitado no campo de texto mas não adicionado, adiciona
    const pendingCriterion = newCriterion.trim();
    if (pendingCriterion && !criteria.includes(pendingCriterion)) {
      criteria = [...criteria, pendingCriterion];
      newCriterion = '';
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
      if (categoryCreationRequired) {
        title = '';
        description = '';
        criteria = [];
        newCriterion = '';
      } else {
        closeCategoryPanel();
      }
    } catch (err) {
      console.warn('Falha ao salvar categoria:', err);
      titleError = err?.message || 'Não foi possível salvar a categoria.';
      throw err;
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!isEditing || deletionBlockReason) return;

    isDeleting = true;
    try {
      await requestCategoryDeletionAction(editingCategory);
    } catch (err) {
      console.warn('Falha ao excluir categoria:', err);
      alert(err?.message || 'Falha ao excluir categoria.');
    } finally {
      isDeleting = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="sideOverlay open"
    on:click={handleCloseWithAutoSave}
    aria-hidden="true"
  ></div>

  <div
    id="categoryPanel"
    class="sidePanel phaseDrawerPanel categoryDrawerPanel"
    class:open={isOpen}
    class:categoryCreationRequiredPanel={categoryCreationRequired}
    role="dialog"
    aria-labelledby="categoryPanelTitle"
  >
    <!-- Header moderno e informativo -->
    <div class="sidePanelHeader phaseDrawerHeader">
      <div class="phaseDrawerHeaderInfo">
        <div class="phaseDrawerStepRow">
          {#if categoryCreationRequired}
            <span class="phaseDrawerStepPill">Tutorial · Etapa 3 de 4</span>
          {:else if isEditing}
            <span class="categoryKindBadge {isDefault ? 'categoryKindBadge--default' : 'categoryKindBadge--custom'}">
              {isDefault ? 'Categoria Padrão' : 'Categoria Personalizada'}
            </span>
            <span class="categoryMetricBadge categoryMetricBadge--{metricType}">
              {metricType === 'included' ? '✓ Incluir' : (metricType === 'excluded' ? '× Excluir' : '⏳ Pendente')}
            </span>
          {:else}
            <span class="categoryKindBadge categoryKindBadge--custom">Nova Categoria</span>
            <span class="categoryMetricBadge categoryMetricBadge--{metricType}">
              {metricType === 'included' ? '✓ Incluir' : (metricType === 'excluded' ? '× Excluir' : '⏳ Pendente')}
            </span>
          {/if}
        </div>
        <h2 id="categoryPanelTitle" class="phaseDrawerTitle">
          {#if categoryCreationRequired}
            Categorias da Triagem
          {:else if isEditing}
            {title ? title : (isDefault ? 'Editar Categoria Padrão' : 'Editar Categoria')}
          {:else}
            Nova Categoria Personalizada
          {/if}
        </h2>
        <span class="phaseDrawerSubtitle">
          {#if isDefault}
            Configure o nome, cor, critérios e diretrizes desta categoria padrão.
          {:else if isEditing}
            Edite as configurações, métricas e critérios de inclusão/exclusão.
          {:else}
            Crie uma categoria personalizada para detalhar critérios específicos da pesquisa.
          {/if}
        </span>
      </div>

      <button
        id="btnCloseCategory"
        class="btn phaseDrawerCloseBtn"
        type="button"
        on:click={handleCloseWithAutoSave}
        title={categoryCreationRequired ? 'Voltar aos projetos' : 'Fechar e salvar alterações (Esc)'}
        aria-label="Fechar painel"
      >
        ✕
      </button>
    </div>

    <div class="sidePanelBody u-scroll-y phaseDrawerBody">
      {#if categoryCreationRequired}
        <div
          id="categoryRequiredNotice"
          class="phaseRequiredNotice"
          role="alert"
          aria-live="assertive"
        >
          <span class="requiredStepLabel">Tutorial · Etapa 3 de 4</span>
          <strong>Categorias Padrão e Personalizadas</strong>
          <span>
            O iCipó organiza a triagem através de 3 categorias padrão essenciais: <b>Incluir</b>, <b>Excluir</b> e <b>Pendente</b>, que já vêm <b>ativadas por padrão em todas as fases</b>.
            Você pode utilizá-las diretamente ou criar categorias personalizadas adicionais para detalhar critérios específicos, associando cada uma à sua respectiva métrica.
          </span>
        </div>

        {#if hasAllDefaults}
          <div id="defaultCategoriesSuggestion" class="defaultCategoriesSuggestion defaultCategoriesSuggestion--ready">
            <div class="defaultCategoriesSuggestionHeader">
              <div>
                <span class="tutorialEyebrow" style="color:var(--good,#16a34a)">Configuração Pronta</span>
                <strong>Categorias padrão essenciais ativas</strong>
              </div>
              <span class="defaultCategoriesSuggestionBadge" style="background:rgba(34,197,94,0.14);color:#15803d;border:1px solid rgba(34,197,94,0.3)">✓ 3 Ativas nas Fases</span>
            </div>
            <p>
              O seu projeto já possui as 3 categorias padrão essenciais ativadas por padrão em todas as fases para a triagem e cálculo das métricas:
            </p>
            <div class="defaultCategoriesPreview" aria-label="Categorias padrão configuradas">
              <span><i class="defaultCategoryDot defaultCategoryDotIncluded"></i><b>Incluir</b> (Avança de fase)</span>
              <span><i class="defaultCategoryDot defaultCategoryDotExcluded"></i><b>Excluir</b> (Descartado)</span>
              <span><i class="defaultCategoryDot defaultCategoryDotPending"></i><b>Pendente</b> (Em análise)</span>
            </div>

            <div class="tutorialCategoryActionRow" style="margin-top: 16px;">
              <button
                id="btnAdvanceToArticlesTutorial"
                type="button"
                class="btn btn-primary"
                style="width: 100%; padding: 12px 18px; font-weight: 750; font-size: 14.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;"
                on:click={handleAdvanceToTutorialStage4}
              >
                <span>Confirmar categorias e avançar para Etapa 4 →</span>
              </button>
            </div>
          </div>
        {:else}
          <div id="defaultCategoriesSuggestion" class="defaultCategoriesSuggestion">
            <div class="defaultCategoriesSuggestionHeader">
              <div>
                <span class="tutorialEyebrow">Sugestão do iCipó</span>
                <strong>Categorias essenciais para começar</strong>
              </div>
              <span class="defaultCategoriesSuggestionBadge">1 clique</span>
            </div>
            <p>
              Crie automaticamente as três categorias essenciais, que virão ativadas por padrão em todas as fases para o fluxo de
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
        {/if}

        <div class="categoryManualDivider">
          <span>ou crie uma categoria personalizada</span>
        </div>
      {/if}

      {#if isDefault}
        <div class="categoryDefaultNotice" role="note">
          <span style="font-size:16px;line-height:1">🛡️</span>
          <div>
            <strong>Categoria Padrão do iCipó ({title || editingCategory.title})</strong>
            <span>
              Esta é uma das 3 categorias essenciais do fluxo de triagem. Seu impacto nas métricas é fixado como
              <b>{metricType === 'included' ? 'Incluir' : (metricType === 'excluded' ? 'Excluir' : 'Pendente')}</b>.
              Você pode personalizar a descrição, a cor e adicionar critérios específicos de elegibilidade.
            </span>
          </div>
        </div>
      {/if}

      <!-- Campo Título -->
      <div class="phaseDrawerFieldGroup">
        <label for="categoryTitle" class="phaseDrawerLabel">
          Título da categoria <span class="requiredAsterisk" aria-hidden="true">*</span>
        </label>
        <div class="phaseDrawerFieldHint">
          Ex.: Fora do Escopo, Estudo Primário, Alta Relevância, Não Indexado
        </div>
        <input
          id="categoryTitle"
          class="input phaseDrawerInput"
          placeholder="Digite o título da categoria"
          bind:value={title}
          on:input={() => { if (title.trim()) titleError = ''; }}
        />
        {#if titleError}
          <div id="categoryTitleError" class="fieldError visible" aria-live="polite">{titleError}</div>
        {/if}
      </div>

      <!-- Campo Descrição -->
      <div class="phaseDrawerFieldGroup">
        <label for="categoryDescription" class="phaseDrawerLabel">
          Descrição e Diretrizes de Uso
        </label>
        <div class="phaseDrawerFieldHint">
          Explique com clareza quando os revisores devem aplicar esta categoria na triagem.
        </div>
        <textarea
          id="categoryDescription"
          class="input phaseDrawerTextarea"
          rows="3"
          placeholder="Ex.: Aplique esta categoria quando o artigo não contemplar os métodos exigidos..."
          bind:value={description}
        ></textarea>
      </div>

      <!-- Campo Cor com Paleta Rápida -->
      <div class="phaseDrawerFieldGroup">
        <label for="categoryColor" class="phaseDrawerLabel">
          Cor de Identificação
        </label>
        <div class="phaseDrawerFieldHint">
          A cor será utilizada nas etiquetas do Scholar, cartões de fase e relatórios visuais.
        </div>
        <div class="categoryColorPaletteWrapper">
          <div class="categoryColorPickerRow">
            <input
              type="color"
              id="categoryColor"
              class="categoryColorPickerInput"
              value={color}
              on:input={handleColorChange}
              title="Escolher cor personalizada"
            />
            <div
              class="categoryColorPreviewBox"
              style="background: {color}; color: {getReadableColor(color)}"
            >
              {color}
            </div>
            <span style="font-size:11.5px;color:#64748b">
              Clique no seletor ou nas cores rápidas abaixo:
            </span>
          </div>

          <div class="categoryQuickSwatches" aria-label="Cores rápidas">
            {#each PRESET_COLORS as presetColor}
              <button
                type="button"
                class="categorySwatchDot"
                class:selected={color.toUpperCase() === presetColor.toUpperCase()}
                style="background: {presetColor}"
                title="Usar cor {presetColor}"
                on:click={() => { color = presetColor.toUpperCase(); }}
                aria-label="Cor {presetColor}"
              ></button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Campo Impacto nas Métricas (Desfecho) -->
      <div class="phaseDrawerFieldGroup">
        <span class="phaseDrawerLabel">
          Impacto nas Métricas (Desfecho)
        </span>
        <div class="phaseDrawerFieldHint">
          {#if isDefault}
            Categorias padrão possuem vínculo estrutural fixo com o desfecho da fase.
          {:else}
            Defina como esta categoria alimentará as métricas e indicadores de progresso:
          {/if}
        </div>

        {#if !isDefault}
          <div class="categoryMetricCards">
            <label class="categoryMetricCard" class:active={metricType === 'included'}>
              <input
                type="radio"
                name="categoryMetricChoice"
                value="included"
                bind:group={metricType}
              />
              <div class="categoryMetricCardBody">
                <div class="categoryMetricCardHeader">
                  <span class="categoryMetricBadge categoryMetricBadge--included">✓ Incluir</span>
                  <strong>Relacionada a Incluir</strong>
                </div>
                <span class="categoryMetricCardDesc">
                  Artigo atende aos critérios da fase, avança para a próxima etapa da pesquisa e contabiliza nas Inclusões.
                </span>
              </div>
            </label>

            <label class="categoryMetricCard" class:active={metricType === 'excluded'}>
              <input
                type="radio"
                name="categoryMetricChoice"
                value="excluded"
                bind:group={metricType}
              />
              <div class="categoryMetricCardBody">
                <div class="categoryMetricCardHeader">
                  <span class="categoryMetricBadge categoryMetricBadge--excluded">× Excluir</span>
                  <strong>Relacionada a Excluir</strong>
                </div>
                <span class="categoryMetricCardDesc">
                  Artigo não atende aos critérios, é descartado da revisão e contabiliza nas Exclusões.
                </span>
              </div>
            </label>

            <label class="categoryMetricCard" class:active={metricType === 'pending'}>
              <input
                type="radio"
                name="categoryMetricChoice"
                value="pending"
                bind:group={metricType}
              />
              <div class="categoryMetricCardBody">
                <div class="categoryMetricCardHeader">
                  <span class="categoryMetricBadge categoryMetricBadge--pending">⏳ Pendente</span>
                  <strong>Relacionada a Pendente</strong>
                </div>
                <span class="categoryMetricCardDesc">
                  Artigo fica em triagem/avaliação. Deve ser resolvido antes de a fase ser marcada como concluída.
                </span>
              </div>
            </label>
          </div>
        {:else}
          <div class="categoryDefaultImpactBox">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="categoryMetricBadge categoryMetricBadge--{metricType}">
                {metricType === 'included' ? '✓ Incluído' : (metricType === 'excluded' ? '× Excluído' : '⏳ Pendente')}
              </span>
              <strong style="font-size:12px;color:#1e293b">
                {metricType === 'included' ? 'Avança p/ próxima etapa' : (metricType === 'excluded' ? 'Descartado da revisão' : 'Aguardando decisão')}
              </strong>
            </div>
          </div>
        {/if}

        <select
          id="categoryMetricType"
          class="input select visually-hidden"
          bind:value={metricType}
          tabindex="-1"
          aria-hidden="true"
        >
          <option value="included">Incluído</option>
          <option value="excluded">Excluído</option>
          <option value="pending">Não contabilizar / Pendente</option>
        </select>
      </div>

      <!-- Critérios Específicos -->
      <div class="phaseDrawerFieldGroup">
        <label for="categoryCriterionNew" class="phaseDrawerLabel">
          Critérios da Categoria
        </label>
        <div class="phaseDrawerFieldHint">
          Adicione diretrizes e regras práticas para orientar os pesquisadores na marcação.
        </div>

        <div class="categoryCriterionBox">
          <div class="categoryCriterionInputRow">
            <input
              id="categoryCriterionNew"
              class="input phaseDrawerInput"
              style="flex:1"
              placeholder="Digite um critério e aperte Enter ou Adicionar"
              bind:value={newCriterion}
              on:keydown={handleCriterionKeydown}
            />
            <button
              id="btnAddCategoryCriterion"
              type="button"
              class="categoryAddCriterionBtn"
              on:click={addCriterion}
            >
              + Adicionar
            </button>
          </div>

          <div id="categoryCriteria" class="categoryCriteriaChips" aria-live="polite">
            {#if criteria.length === 0}
              <div class="categoryEmptyCriteria">Nenhum critério específico cadastrado. Digite acima e clique em Adicionar.</div>
            {:else}
              {#each criteria as criterion, index (criterion + index)}
                <div class="categoryCriterionChip" title={criterion}>
                  <span class="criterionChipText">{criterion}</span>
                  <button
                    type="button"
                    class="criterionChipRemoveBtn"
                    title="Remover critério"
                    on:click={() => removeCriterion(index)}
                    aria-label="Remover critério"
                  >
                    ✕
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- Botões de Ação Principais -->
      <div class="phaseDrawerActionsRow">
        <button
          id="btnSaveCategory"
          class="btn phaseDrawerPrimaryBtn"
          class:ready={title.trim()}
          type="button"
          disabled={isSaving}
          on:click={handleSave}
          title="Salvar alterações (Ctrl+Enter)"
        >
          {#if isSaving}
            <span class="savingSpinner" aria-hidden="true"></span>
            <span>Salvando...</span>
          {:else}
            <span>{isEditing ? 'Salvar alterações' : 'Salvar categoria'}</span>
          {/if}
        </button>

        <button
          id="btnCancelCategory"
          class="btn phaseDrawerCancelBtn"
          type="button"
          disabled={isSaving}
          on:click={handleClose}
        >
          Cancelar
        </button>
      </div>

      <!-- Transferência de Artigos da Categoria -->
      {#if isEditing && linkedPaperCount > 0}
        <div class="categoryPanelTransferCard">
          <div class="transferCardInfo">
            <span class="transferCardTitle">
              <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="16 3 21 3 21 8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
              Transferir artigos desta categoria
            </span>
            <span class="transferCardDesc">
              Esta categoria possui <strong>{linkedPaperCount} {linkedPaperCount === 1 ? 'artigo classificado' : 'artigos classificados'}</strong>. Você pode movê-los para outra categoria do projeto.
            </span>
          </div>
          <button
            type="button"
            class="btn secondary small"
            on:click={handleOpenTransferFromPanel}
          >
            Mover artigos ➔
          </button>
        </div>
      {/if}

      <!-- Zona de Exclusão / Proteção Segura -->
      {#if isEditing}
        <div class="phaseDangerZone">
          <div class="dangerZoneDivider"></div>
          {#if isDefault}
            <div class="dangerZoneLocked" title={deleteTooltip}>
              <span class="lockedIcon">🔒</span>
              <span class="lockedText">
                As categorias padrão (<strong>Incluir</strong>, <strong>Excluir</strong>, <strong>Pendente</strong>) são protegidas e não podem ser excluídas para manter a consistência do fluxo de triagem.
              </span>
            </div>
          {:else if deletionBlockReason}
            <div class="dangerZoneLocked" title={deleteTooltip}>
              <span class="lockedIcon">⚠️</span>
              <span class="lockedText">
                {deletionBlockReason}
              </span>
            </div>
          {:else}
            <div class="dangerZoneContent">
              <div class="dangerZoneText">
                <strong class="dangerZoneTitle">Excluir esta categoria</strong>
                <span class="dangerZoneDesc">
                  Esta categoria personalizada será removida do projeto e de todas as fases associadas.
                </span>
              </div>
              <button
                id="btnDeleteCategory"
                class="btn danger phaseDrawerDeleteBtn"
                type="button"
                disabled={cannotDelete}
                on:click={handleDelete}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir categoria'}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
