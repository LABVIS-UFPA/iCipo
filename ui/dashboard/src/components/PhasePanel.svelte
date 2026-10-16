<script>
  import {
    projectStore,
    papersStore,
    activePhaseLabelStore,
    isPhasePanelOpenStore,
    editingPhaseStore,
    phaseCreationRequiredStore,
    closePhasePanel,
    savePhaseAction,
    deletePhaseAction
  } from '../dashboardStore.js';
  import {
    canDeletePhaseLabel,
    getPhaseStats,
    normalizeCategoryMetricType
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
  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: activePhaseLabel = $activePhaseLabelStore;

  $: isEditing = Boolean(editingPhase && editingPhase.label);
  $: canDelete = isEditing && canDeletePhaseLabel(editingPhase.label, phases, activePhaseLabel);
  $: isActivePhase = isEditing && editingPhase.label === activePhaseLabel;

  // Sync form when editingPhase changes or panel opens
  $: if (isOpen) {
    if (editingPhase) {
      title = editingPhase.title || '';
      description = editingPhase.desc ?? editingPhase.description ?? '';
      selectedCategories = Array.isArray(editingPhase.categories) ? [...editingPhase.categories] : [];
      status = editingPhase.completed || editingPhase.labelStatus === 'done' ? 'done' : 'pending';
    } else {
      title = '';
      description = '';
      selectedCategories = projectCategories.map(c => c.label);
      status = 'pending';
    }
    titleError = '';
    descError = '';
    categoriesError = '';
  }

  function handleClose() {
    if (phaseCreationRequired) {
      window.location.href = '../projects/projects.html';
      return;
    }
    closePhasePanel();
  }

  function toggleCategory(catLabel) {
    if (selectedCategories.includes(catLabel)) {
      selectedCategories = selectedCategories.filter(l => l !== catLabel);
    } else {
      selectedCategories = [...selectedCategories, catLabel];
    }
    if (selectedCategories.length > 0) categoriesError = '';
  }

  function toggleStatus() {
    if (!isActivePhase) return;
    status = status === 'done' ? 'pending' : 'done';
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
      const stats = getPhaseStats(editingPhase, $papersStore);
      if (stats.pending > 0) {
        alert(`Classifique os ${stats.pending} artigo(s) pendente(s) antes de concluir esta fase.`);
        return;
      }
      if (!isActivePhase) {
        alert('Somente a fase ativa pode ser concluída. As fases futuras permanecem planejadas.');
        return;
      }
    }

    const selectedCategoryObjects = projectCategories.filter(cat => selectedCategories.includes(cat.label));
    const inheritanceCategory = selectedCategoryObjects.find(cat => (
      normalizeCategoryMetricType(cat?.metricType, 'pending') === 'pending'
    ));

    const phasePayload = {
      title: cleanTitle,
      description: cleanDesc,
      completed: status === 'done',
      categories: selectedCategories,
      inheritanceCategoryLabel: inheritanceCategory?.label || null,
      criteria: isEditing ? (editingPhase.criteria || []) : []
    };

    isSaving = true;
    try {
      await savePhaseAction(phasePayload, isEditing ? editingPhase.label : null);
      closePhasePanel();
    } catch (err) {
      console.warn('Falha ao salvar fase:', err);
      alert(err?.message || 'Falha ao salvar fase.');
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!isEditing || !canDelete) return;
    if (phases.length <= 1) {
      alert('O projeto deve manter pelo menos uma fase. A primeira fase não pode ser excluída.');
      return;
    }

    if (!confirm('Excluir esta fase? Se for a fase ativa, o sistema irá promover automaticamente a próxima fase disponível.')) {
      return;
    }

    isDeleting = true;
    try {
      await deletePhaseAction(editingPhase.label);
      closePhasePanel();
    } catch (err) {
      console.warn('Falha ao excluir fase:', err);
      alert(err?.message || 'Falha ao excluir fase.');
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
    id="phasePanel"
    class="sidePanel"
    class:open={isOpen}
    class:phaseCreationRequiredPanel={phaseCreationRequired}
    role="dialog"
    aria-labelledby="phasePanelTitle"
  >
    <div class="sidePanelHeader">
      <div id="phasePanelTitle" style="font-weight:900">
        {phaseCreationRequired ? 'Crie a primeira fase' : (isEditing ? 'Editar fase' : 'Nova fase')}
      </div>
      <button id="btnClosePhase" class="btn" on:click={handleClose}>
        {phaseCreationRequired ? 'Voltar aos projetos' : 'Fechar'}
      </button>
    </div>

    <div class="sidePanelBody u-scroll-y">
      {#if phaseCreationRequired}
        <div
          id="phaseRequiredNotice"
          class="phaseRequiredNotice"
          role="alert"
          aria-live="assertive"
        >
          <span class="requiredStepLabel">Tutorial · Etapa 2 de 4</span>
          <strong>Crie a primeira fase para continuar</strong>
          <span>
            Este projeto ainda não possui fases. Preencha os campos
            obrigatórios e salve uma fase para liberar o dashboard.
          </span>
        </div>
      {/if}

      <label class="visually-hidden" for="phaseTitle">Título</label>
      <input
        id="phaseTitle"
        class="input"
        placeholder="Título da fase"
        bind:value={title}
        on:input={() => { if (title.trim()) titleError = ''; }}
      />
      {#if titleError}
        <div id="phaseTitleError" class="fieldError visible" aria-live="polite">{titleError}</div>
      {/if}

      <label class="visually-hidden" for="phaseDesc">Descrição</label>
      <textarea
        id="phaseDesc"
        class="input"
        style="min-height:120px"
        placeholder="Descrição da fase"
        bind:value={description}
        on:input={() => { if (description.trim()) descError = ''; }}
      ></textarea>
      {#if descError}
        <div id="phaseDescError" class="fieldError visible" aria-live="polite">{descError}</div>
      {/if}

      <label for="phaseCategories" class="phaseFieldLabel">
        Categorias usadas nesta fase
      </label>
      <div class="categoryMetricHelp phaseTriageHelp">
        <strong>Controle da triagem:</strong> somente as categorias
        selecionadas aparecem no menu de marcação e somente os links
        classificados com elas são realçados no Scholar. Na fase seguinte, os
        artigos incluídos na fase anterior entram novamente como
        <strong>Pendentes</strong>.
        <span>
          Pendente → fila da triagem · Incluído → selecionado para a próxima
          fase · Excluído → removido da progressão.
        </span>
      </div>

      <div id="phaseCategories" class="categoriesList" aria-live="polite">
        {#if projectCategories.length === 0}
          <div class="muted small" style="padding: 8px 0;">Nenhuma categoria cadastrada no projeto.</div>
        {:else}
          {#each projectCategories as cat (cat.label || cat.id)}
            <label class="categoryCheckboxRow">
              <input
                type="checkbox"
                value={cat.label}
                checked={selectedCategories.includes(cat.label)}
                on:change={() => toggleCategory(cat.label)}
              />
              <span class="categoryColorDot" style="background: {cat.color || '#4CAF50'}"></span>
              <span>{cat.title || cat.label}</span>
            </label>
          {/each}
        {/if}
      </div>
      {#if categoriesError}
        <div id="phaseCategoriesError" class="fieldError visible" aria-live="polite">{categoriesError}</div>
      {/if}

      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <span class="muted">Rótulo:</span>
        <button
          id="btnTogglePhaseStatus"
          class="btn small"
          class:ghost={status === 'pending'}
          type="button"
          disabled={!isActivePhase}
          title={isActivePhase ? 'Concluir a fase ativa e avançar' : (status === 'done' ? 'Fase concluída' : 'Fase planejada')}
          on:click={toggleStatus}
        >
          {status === 'done' ? 'Concluído' : 'Em análise'}
        </button>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button
          id="btnSavePhase"
          class="btn"
          class:ready={title.trim() && description.trim()}
          type="button"
          disabled={isSaving}
          on:click={handleSave}
        >
          {isSaving ? 'Salvando...' : 'Salvar fase'}
        </button>
        {#if isEditing && canDelete}
          <button
            id="btnDeletePhase"
            class="btn danger"
            type="button"
            disabled={isDeleting}
            on:click={handleDelete}
          >
            {isDeleting ? 'Excluindo...' : 'Excluir fase'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
