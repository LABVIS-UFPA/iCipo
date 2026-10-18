<script>
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    isPhasePanelOpenStore,
    editingPhaseStore,
    phaseCreationRequiredStore,
    closePhasePanel,
    savePhaseAction,
    deletePhaseAction,
    showNotice,
    showConfirmDialog
  } from '../dashboardStore.js';
  import {
    canDeletePhaseLabel,
    getPhaseStats,
    normalizeCategoryMetricType,
    inferMetricTypeFromCategory,
    isPhaseCompleted,
    isDefaultCategory
  } from '../dashboardHelpers.js';

  let title = '';
  let description = '';
  let selectedCategories = [];
  let status = 'pending'; // 'pending' | 'done'
  let titleError = '';
  let descError = '';
  let categoriesError = '';
  let isSaving = false;
  let isDeleting = false;

  $: isOpen = $isPhasePanelOpenStore;
  $: editingPhase = $editingPhaseStore;
  $: phaseCreationRequired = $phaseCreationRequiredStore;
  $: project = $projectStore || {};
  $: projectCategories = Array.isArray(project.categories) ? project.categories : [];
  $: defaultCategoryLabels = projectCategories
    .filter(c => isDefaultCategory(c.label))
    .map(c => c.label);
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: activePhaseLabel = $activePhaseLabelStore;

  $: isEditing = Boolean(editingPhase && editingPhase.label);
  $: phaseIndex = isEditing ? phases.findIndex(p => p.label === editingPhase?.label) : -1;
  $: isActivePhase = isEditing && editingPhase.label === activePhaseLabel;
  $: isCompleted = isEditing && isPhaseCompleted(editingPhase);
  $: isPlannedPhase = isEditing && !isCompleted && !isActivePhase;
  $: canDelete = isEditing && canDeletePhaseLabel(editingPhase.label, phases, activePhaseLabel);
  $: stats = isEditing && editingPhase ? getPhaseStats(editingPhase, $papersStore) : null;
  $: pendingCount = stats ? stats.pending : 0;

  let lastOpenedEditingPhase = undefined;
  let wasOpen = false;

  // Sincroniza formulário quando o painel abre ou editingPhase muda
  $: if (isOpen && (!wasOpen || editingPhase !== lastOpenedEditingPhase)) {
    wasOpen = true;
    lastOpenedEditingPhase = editingPhase;
    if (editingPhase) {
      title = editingPhase.title || '';
      description = editingPhase.desc ?? editingPhase.description ?? '';
      const existingCats = Array.isArray(editingPhase.categories) ? editingPhase.categories : [];
      selectedCategories = existingCats.length > 0 ? [...existingCats] : (defaultCategoryLabels.length ? [...defaultCategoryLabels] : projectCategories.map(c => c.label));
      status = isPhaseCompleted(editingPhase) ? 'done' : 'pending';
    } else {
      title = '';
      description = '';
      selectedCategories = defaultCategoryLabels.length ? [...defaultCategoryLabels] : projectCategories.map(c => c.label);
      status = 'pending';
    }
    titleError = '';
    descError = '';
    categoriesError = '';
  }

  $: if (!isOpen) {
    wasOpen = false;
    lastOpenedEditingPhase = undefined;
  }
  function handleClose() {
    closePhasePanel();
  }

  async function handleCloseWithAutoSave() {
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();

    // Se os campos obrigatórios estiverem preenchidos, salva automaticamente ao clicar fora
    if (cleanTitle && cleanDesc) {
      try {
        await handleSave();
        return;
      } catch (err) {
        console.warn('Falha no auto-save ao fechar:', err);
      }
    }

    closePhasePanel();
  }

  function toggleCategory(catLabel) {
    if (selectedCategories.includes(catLabel)) {
      if (selectedCategories.length <= 1) {
        showNotice('A fase deve conter pelo menos uma categoria ativa.', 'warning');
        return;
      }
      selectedCategories = selectedCategories.filter(l => l !== catLabel);
    } else {
      selectedCategories = [...selectedCategories, catLabel];
    }
    categoriesError = '';
  }


  function handleSetStatus(newStatus) {
    if (!isActivePhase && !isCompleted) return;
    if (newStatus === 'done' && pendingCount > 0) {
      showNotice(`Você possui ${pendingCount} artigo(s) pendente(s) nesta etapa. Conclua a classificação de todos os artigos antes de finalizar a fase.`, 'warning');
      return;
    }
    status = newStatus;
  }

  async function handleKeydown(event) {
    if (!isOpen) return;
    if (event.key === 'Escape' && !phaseCreationRequired) {
      await handleCloseWithAutoSave();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      await handleSave();
    }
  }

  async function handleSave() {
    titleError = '';
    descError = '';
    categoriesError = '';

    const cleanTitle = title.trim();
    const cleanDesc = description.trim();

    if (!cleanTitle) {
      titleError = 'Preencha o título da fase.';
    }
    if (!cleanDesc) {
      descError = 'Preencha a descrição da fase.';
    }
    if (!cleanTitle || !cleanDesc) return;

    if (projectCategories.length > 0 && selectedCategories.length === 0) {
      categoriesError = 'Selecione pelo menos uma categoria para esta fase.';
      return;
    }

    if (isEditing && status === 'done') {
      const currentStats = getPhaseStats(editingPhase, $papersStore);
      if (currentStats.pending > 0) {
        showNotice(`Classifique os ${currentStats.pending} artigo(s) pendente(s) antes de concluir esta fase.`, 'warning');
        return;
      }
      if (!isActivePhase && !isCompleted) {
        showNotice('Somente a fase ativa pode ser concluída. As fases futuras permanecem planejadas.', 'warning');
        return;
      }
    }

    if (selectedCategories.length === 0) {
      categoriesError = 'Selecione pelo menos uma categoria ativa para a fase.';
      return;
    }

    const selectedCategoryObjects = projectCategories.filter(cat => selectedCategories.includes(cat.label));
    const inheritanceCategory = selectedCategoryObjects.find(cat => (
      normalizeCategoryMetricType(cat?.metricType, 'pending') === 'pending'
    ));

    const allCategoriesToSave = [...new Set(selectedCategories)];

    const phasePayload = {
      title: cleanTitle,
      description: cleanDesc,
      completed: status === 'done',
      categories: allCategoriesToSave,
      inheritanceCategoryLabel: inheritanceCategory?.label || null,
      criteria: isEditing ? (editingPhase.criteria || []) : []
    };

    isSaving = true;
    try {
      await savePhaseAction(phasePayload, isEditing ? editingPhase.label : null);
      closePhasePanel();
    } catch (err) {
      console.warn('Falha ao salvar fase:', err);
      showNotice(err?.message || 'Falha ao salvar fase.', 'error');
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!isEditing || !canDelete) return;
    if (phases.length <= 1) {
      showNotice('O projeto deve manter pelo menos uma fase. A primeira fase não pode ser excluída.', 'warning');
      return;
    }

    const phaseTitle = editingPhase?.title || editingPhase?.label || 'esta fase';
    const confirmed = await showConfirmDialog({
      title: "Confirmar Exclusão de Fase",
      message: `Excluir a fase “${phaseTitle}”?`,
      details: "Se for a fase ativa, o sistema irá promover automaticamente a próxima fase disponível para dar continuidade ao estudo.",
      phaseBadge: phaseTitle,
      confirmLabel: "Excluir Fase",
      cancelLabel: "Cancelar",
      tone: "danger",
      icon: "trash"
    });
    if (!confirmed) {
      return;
    }

    isDeleting = true;
    try {
      await deletePhaseAction(editingPhase.label);
      closePhasePanel();
    } catch (err) {
      console.warn('Falha ao excluir fase:', err);
      showNotice(err?.message || 'Falha ao excluir fase.', 'error');
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
    transition:fade={{ duration: 320 }}
  ></div>

  <div
    id="phasePanel"
    class="sidePanel phaseDrawerPanel open"
    class:phaseCreationRequiredPanel={phaseCreationRequired}
    role="dialog"
    aria-labelledby="phasePanelTitle"
    transition:fly={{ x: 650, duration: 400, opacity: 1, easing: cubicOut }}
  >
    <!-- Header com título, etapa e badges de status -->
    <div class="sidePanelHeader phaseDrawerHeader">
      <div class="phaseDrawerHeaderInfo">
        {#if isEditing && phaseIndex >= 0}
          <div class="phaseDrawerStepRow">
            <span class="phaseDrawerStepPill">Etapa {phaseIndex + 1} de {phases.length}</span>
            {#if isCompleted}
              <span class="statusBadge badgeDone">✓ Concluída</span>
            {:else if isActivePhase}
              <span class="statusBadge badgeActive"><span class="pulsePoint"></span> Fase Ativa</span>
            {:else}
              <span class="statusBadge badgePlanned">⏱ Planejada</span>
            {/if}
          </div>
        {/if}
        <h2 id="phasePanelTitle" class="phaseDrawerTitle">
          {isEditing ? 'Editar Fase' : 'Nova Fase'}
        </h2>
        <span class="phaseDrawerSubtitle">
          {#if isEditing}
            Configure o nome, critérios e diretrizes desta etapa do estudo.
          {:else}
            Adicione uma nova etapa à esteira de revisão do seu projeto.
          {/if}
        </span>
      </div>

      <button
        id="btnClosePhase"
        class="btn phaseDrawerCloseBtn"
        type="button"
        on:click={handleCloseWithAutoSave}
        title="Fechar painel (Esc)"
        aria-label="Fechar painel"
      >
        ✕
      </button>
    </div>

    <div class="sidePanelBody u-scroll-y phaseDrawerBody">


      <!-- Campo Título -->
      <div class="phaseDrawerFieldGroup">
        <label for="phaseTitle" class="phaseDrawerLabel">
          Título da fase <span class="requiredAsterisk" aria-hidden="true">*</span>
        </label>
        <div class="phaseDrawerFieldHint">
          Ex.: Triagem de Títulos e Resumos, Leitura Completa de Textos, Extração de Dados.
        </div>
        <input
          id="phaseTitle"
          class="input phaseDrawerInput"
          placeholder="Ex.: Triagem de Títulos e Resumos (ou Leitura Completa...)"
          bind:value={title}
          on:input={() => { if (title.trim()) titleError = ''; }}
        />
        {#if titleError}
          <div id="phaseTitleError" class="fieldError visible" aria-live="polite">{titleError}</div>
        {/if}
      </div>

      <!-- Campo Descrição -->
      <div class="phaseDrawerFieldGroup">
        <label for="phaseDesc" class="phaseDrawerLabel">
          Descrição e Diretrizes de Elegibilidade <span class="requiredAsterisk" aria-hidden="true">*</span>
        </label>
        <div class="phaseDrawerFieldHint">
          Detalhe os critérios de inclusão/exclusão e objetivos que os pesquisadores devem seguir.
        </div>
        <textarea
          id="phaseDesc"
          class="input phaseDrawerTextarea"
          rows="4"
          placeholder="Ex.: Nesta fase os pesquisadores devem avaliar apenas título e resumo dos artigos..."
          bind:value={description}
          on:input={() => { if (description.trim()) descError = ''; }}
        ></textarea>
        {#if descError}
          <div id="phaseDescError" class="fieldError visible" aria-live="polite">{descError}</div>
        {/if}
      </div>

      <!-- Categorias Ativas na Fase -->
      <div class="phaseDrawerFieldGroup">
        <span class="phaseDrawerLabel">
          Categorias Ativas nesta Fase
        </span>
        <div class="phaseDrawerFieldHint">
          Marque ou desmarque as categorias para controlar quais links marcados serão destacados no navegador nesta fase.
        </div>

        <div id="phaseCategoriesList" class="phaseDrawerCategoryList" aria-live="polite">
          {#if projectCategories.length === 0}
            <div class="phaseNoCategoriesNote">
              <span>⚠️ Nenhuma categoria cadastrada no projeto.</span>
              <span class="subNote">Crie categorias no painel de Categorias para associá-las às fases.</span>
            </div>
          {:else}
            {#each projectCategories as cat (cat.label || cat.id)}
              {@const isDefault = isDefaultCategory(cat.label)}
              {@const isChecked = selectedCategories.includes(cat.label)}
              {@const normMetric = normalizeCategoryMetricType(cat.metricType, 'pending')}
              <label
                class="phaseCategoryCardRow"
                class:selected={isChecked}
                class:isDefaultRow={isDefault}
                title={isChecked ? 'Categoria ativa nesta fase (links marcados serão destacados no navegador)' : 'Categoria desmarcada nesta fase (links não serão destacados no navegador)'}
              >
                <div class="categoryCheckCol">
                  <input
                    type="checkbox"
                    value={cat.label}
                    checked={isChecked}
                    on:change={() => toggleCategory(cat.label)}
                  />
                  <span
                    class="categoryCircleDot"
                    style="background: {cat.color || '#2eae6c'}"
                    aria-hidden="true"
                  ></span>
                </div>

                <div class="categoryDetailsCol">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="categoryName">{cat.title || cat.label}</span>
                    {#if isDefault}
                      <span class="defaultCategoryPhaseTag" style="background: rgba(37,99,235,0.08); color: #2563eb; font-weight:600;">Padrão</span>
                    {/if}
                  </div>
                  {#if cat.description}
                    <span class="categorySubDesc">{cat.description}</span>
                  {/if}
                </div>

                <div class="categoryMetricCol">
                  {#if normMetric === 'included'}
                    <span class="categoryMetricBadge metricIncluded" title="Artigos com esta categoria avançam para a próxima fase">
                      Incluído
                    </span>
                  {:else if normMetric === 'excluded'}
                    <span class="categoryMetricBadge metricExcluded" title="Artigos com esta categoria são excluídos da revisão">
                      Excluído
                    </span>
                  {:else}
                    <span class="categoryMetricBadge metricPending" title="Artigos com esta categoria permanecem pendentes">
                      Pendente
                    </span>
                  {/if}
                </div>
              </label>
            {/each}
          {/if}
        </div>
        {#if categoriesError}
          <div id="phaseCategoriesError" class="fieldError visible" aria-live="polite">{categoriesError}</div>
        {/if}
      </div>

      {#if isEditing}
        <!-- Ciclo e Status da Fase -->
        <div class="phaseDrawerFieldGroup">
          <span class="phaseDrawerLabel">Ciclo e Status da Fase</span>
          
          {#if isActivePhase}
            <div class="phaseLifecycleBox activeCycle">
              <div class="lifecycleBoxHeader">
                <span class="lifecycleBadge activeBadge">🟢 Fase Ativa no Momento</span>
                <span class="lifecycleHint">Fase em execução pelos pesquisadores</span>
              </div>
              <p class="lifecycleDesc">
                As ações de triagem no Google Scholar e na tabela de artigos estão sendo computadas nesta fase.
              </p>

              <div class="statusSelectorRow">
                <button
                  type="button"
                  class="statusOptionBtn"
                  class:selected={status === 'pending'}
                  on:click={() => handleSetStatus('pending')}
                >
                  <div class="statusOptionRadio" class:checked={status === 'pending'}></div>
                  <div class="statusOptionText">
                    <strong>Em Andamento</strong>
                    <span>Triagem em execução pela equipe</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="statusOptionBtn"
                  class:selected={status === 'done'}
                  on:click={() => handleSetStatus('done')}
                  title={pendingCount > 0 ? `Bloqueado: existem ${pendingCount} artigos pendentes que precisam ser classificados` : 'Concluir esta fase e avançar para a próxima'}
                >
                  <div class="statusOptionRadio" class:checked={status === 'done'}></div>
                  <div class="statusOptionText">
                    <strong>Concluir Fase e Avançar</strong>
                    <span>Finaliza etapa e libera a próxima fase</span>
                  </div>
                </button>
              </div>

              {#if pendingCount > 0 && status === 'pending'}
                <div class="lifecyclePendingWarning">
                  <span class="warningIcon">ℹ️</span>
                  <span>
                    Para concluir esta fase, você precisará classificar os <strong>{pendingCount}</strong> artigos pendentes.
                  </span>
                </div>
              {/if}
            </div>
          {:else if isCompleted}
            <div class="phaseLifecycleBox completedCycle">
              <div class="lifecycleBoxHeader">
                <span class="lifecycleBadge completedBadge">✓ Fase Concluída</span>
                <span class="lifecycleHint">Fase protegida</span>
              </div>
              <p class="lifecycleDesc">
                Esta fase foi finalizada com êxito. Seus artigos aprovados foram herdados pela fase seguinte. Para alterar a triagem de artigos ou os critérios, você pode reabri-la a qualquer momento.
              </p>

              <div class="statusSelectorRow">
                <button
                  type="button"
                  class="statusOptionBtn"
                  class:selected={status === 'done'}
                  on:click={() => handleSetStatus('done')}
                >
                  <div class="statusOptionRadio" class:checked={status === 'done'}></div>
                  <div class="statusOptionText">
                    <strong>Manter Concluída</strong>
                    <span>Fase finalizada e protegida</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="statusOptionBtn"
                  class:selected={status === 'pending'}
                  on:click={() => handleSetStatus('pending')}
                >
                  <div class="statusOptionRadio" class:checked={status === 'pending'}></div>
                  <div class="statusOptionText">
                    <strong>Reabrir Fase</strong>
                    <span>Torna esta fase ativa novamente para triagem</span>
                  </div>
                </button>
              </div>

              {#if status === 'pending'}
                <div class="lifecyclePendingWarning" style="background:#f0fdf4;border-color:#86efac;color:#15803d">
                  <span class="warningIcon">🟢</span>
                  <span>
                    Ao salvar, esta fase será <strong>reaberta como fase ativa</strong> e a triagem de artigos poderá ser continuada normalmente.
                  </span>
                </div>
              {/if}
            </div>
          {:else if isPlannedPhase}
            <div class="phaseLifecycleBox plannedCycle">
              <div class="lifecycleBoxHeader">
                <span class="lifecycleBadge plannedBadge">⏱ Fase Planejada</span>
              </div>
              <p class="lifecycleDesc">
                Esta etapa aguarda a conclusão da fase ativa atual. Assim que os artigos da fase anterior forem concluídos, esta fase será ativada automaticamente no fluxo contínuo.
              </p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Botões de Ação Principais -->
      <div class="phaseDrawerActionsRow">
        <button
          id="btnSavePhase"
          class="btn phaseDrawerPrimaryBtn"
          class:ready={title.trim() && description.trim()}
          type="button"
          disabled={isSaving}
          on:click={handleSave}
          title="Salvar alterações (Ctrl+Enter)"
        >
          {#if isSaving}
            <span class="savingSpinner" aria-hidden="true"></span>
            <span>Salvando...</span>
          {:else}
            <span>{isEditing ? 'Salvar alterações' : 'Salvar nova fase'}</span>
          {/if}
        </button>

        <button
          id="btnCancelPhase"
          class="btn phaseDrawerCancelBtn"
          type="button"
          disabled={isSaving}
          on:click={handleClose}
        >
          Cancelar
        </button>
      </div>

      <!-- Zona de Exclusão Segura -->
      {#if isEditing}
        <div class="phaseDangerZone">
          <div class="dangerZoneDivider"></div>
          {#if canDelete}
            <div class="dangerZoneContent">
              <div class="dangerZoneText">
                <strong class="dangerZoneTitle">Excluir esta fase</strong>
                <span class="dangerZoneDesc">
                  Esta ação removerá a fase do projeto. Se for a fase ativa, o sistema promoverá a próxima fase disponível.
                </span>
              </div>
              <button
                id="btnDeletePhase"
                class="btn danger phaseDrawerDeleteBtn"
                type="button"
                disabled={isDeleting || isSaving}
                on:click={handleDelete}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir fase'}
              </button>
            </div>
          {:else}
            <div class="dangerZoneLocked">
              <span class="lockedIcon">🔒</span>
              <span class="lockedText">
                {#if phases.length <= 1}
                  A primeira fase do projeto é obrigatória e não pode ser excluída.
                {:else if isCompleted}
                  Fases concluídas estão protegidas contra exclusão para garantir a rastreabilidade do estudo.
                {:else}
                  Fases anteriores à fase ativa não podem ser excluídas.
                {/if}
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
