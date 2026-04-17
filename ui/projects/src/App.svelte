<script>
  import { onMount } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';
  import { slugify } from '../../../core/utils.mjs';
  import { Project } from '../../../core/entities.mjs';

  let projects = [];
  let filter = '';

  let sidenavOpen = false;
  let editMode = false;
  let editingProjectID = null;

  let projectName = '';
  let projectDescription = '';
  let projectResearchers = '';
  let projectObjective = '';

  let projectIdPreview = '';
  let projectIdStatus = '';
  let projectIdStatusColor = 'inherit';
  let connectionIssue = false;

  $: filteredProjects = projects.filter((p) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;

    return (
      (p.name || '').toLowerCase().includes(query) ||
      (p.id || '').toLowerCase().includes(query)
    );
  });

  $: updateIdPreview();

  function updateIdPreview() {
    const name = projectName.trim();
    const base = slugify(name, { separator: '_', fallback: '' });

    if (editMode && editingProjectID) {
      projectIdPreview = editingProjectID;
      projectIdStatus = '';
      projectIdStatusColor = 'inherit';
      return;
    }

    projectIdPreview = base;

    if (!base) {
      projectIdStatus = '';
      projectIdStatusColor = 'inherit';
      return;
    }

    const inUse = projects.some((p) => p.id === base);
    projectIdStatus = inUse ? 'em uso' : 'disponível';
    projectIdStatusColor = inUse ? 'crimson' : 'green';
  }

  function resetForm() {
    projectName = '';
    projectDescription = '';
    projectResearchers = '';
    projectObjective = '';
    projectIdPreview = '';
    projectIdStatus = '';
    projectIdStatusColor = 'inherit';
  }

  function openSidenav() {
    sidenavOpen = true;
  }

  function closeSidenav() {
    sidenavOpen = false;
    editMode = false;
    editingProjectID = null;
    resetForm();
  }

  function openCreateSidenav() {
    editMode = false;
    editingProjectID = null;
    resetForm();
    openSidenav();
  }

  function showPlaceholder(connectionError = false) {
    connectionIssue = connectionError;
  }

  function openEditSidenav(project) {
    editMode = true;
    editingProjectID = project.id;

    projectName = project.name || '';
    projectDescription = project.description || '';
    projectResearchers = (project.researchers || []).join(', ');
    projectObjective = project.objective || '';
    projectIdPreview = project.id || '';
    projectIdStatus = '';
    projectIdStatusColor = 'inherit';

    openSidenav();
  }

  async function loadProjectsFromStorage() {
    try {
      projects = await storage.listProjects();
      connectionIssue = false;
    } catch (e) {
      showPlaceholder(true);
      console.warn('Failed to load projects from storage', e);
      projects = [];
    }
  }

  async function handleEdit(projectId) {
    try {
      const projectData = await storage.loadProject(projectId);
      openEditSidenav(projectData);
    } catch (e) {
      console.warn('loadProject failed', e);
      alert('Falha ao carregar o projeto. Veja console.');
    }
  }

  async function handleOpenProject(project) {
    try {
      await storage.openProject(project.id);
      window.location.href = '../dashboard/dashboard.html';
    } catch (e) {
      console.warn('openProject failed', e);
      alert('Falha ao abrir o projeto. Veja console.');
    }
  }

  async function handleArchive(project) {
    const confirmed = window.confirm(`Arquivar o projeto "${project.name}"?`);
    if (!confirmed) return;

    try {
      await storage.archiveProject(project.id);
      projects = projects.filter((p) => p.id !== project.id);
    } catch (e) {
      console.warn('archiveProject failed', e);
      alert('Falha ao arquivar o projeto. Veja console.');
    }
  }

  async function updateExistingProject(name, desc, researchers, objective) {
    const idx = projects.findIndex((pr) => pr.id === editingProjectID);
    if (idx === -1) return;

    const p = projects[idx];

    p.name = name;
    p.description = desc;
    p.researchers = researchers.split(',').map((s) => s.trim()).filter(Boolean);
    p.objective = objective;

    await storage.saveProject(new Project(p.id, p));
  }

  async function createNewProject(name, desc, researchers, objective) {
    const suggested = projectIdPreview.trim();
    const baseId = suggested || slugify(name, { separator: '_', fallback: '' });
    const finalId = baseId || `p_${Date.now().toString(36)}`;

    const inUse = projects.some((p) => p.id === finalId);
    if (inUse) {
      alert('Erro: ID já em uso. Altere o nome para gerar um ID diferente.');
      return;
    }

    const newProject = {
      id: finalId,
      name,
      description: desc,
      researchers: researchers.split(',').map((s) => s.trim()).filter(Boolean),
      objective,
      isCurrent: false
    };

    await storage.saveProject(new Project(newProject.id, newProject, true));
  }

  async function handleSaveProject() {
    const name = projectName.trim();
    const desc = projectDescription.trim();
    const researchers = projectResearchers.trim();
    const objective = projectObjective.trim();

    if (!name) {
      alert('O nome do projeto é obrigatório.');
      return;
    }

    if (!desc) {
      alert('A descrição é obrigatória.');
      return;
    }

    if (!researchers) {
      alert('Informe ao menos um pesquisador.');
      return;
    }

    try {
      if (editMode && editingProjectID) {
        await updateExistingProject(name, desc, researchers, objective);
      } else {
        await createNewProject(name, desc, researchers, objective);
      }

      await loadProjectsFromStorage();
      closeSidenav();
    } catch (e) {
      console.warn('saveProject failed', e);
      alert('Falha ao salvar o projeto. Veja console.');
    }
  }

  onMount(async () => {
    await loadProjectsFromStorage();
  });
</script>

<div class="layout">
  <header class="topbar">
    <div class="brand">
      <div class="logo">
        <picture>
          <source srcset="/img/icipo_logo[dark].png" media="(prefers-color-scheme: dark)" />
          <img class="brandLogo" src="/img/icipo_logo.png" alt="iCipó" />
        </picture>
      </div>

      <div class="brandText">
        <div class="brandTitle">Meus projetos</div>
        <div class="brandSub">Gerencie projetos — mesma aparência das Configurações</div>
      </div>
    </div>

    <div class="topbarActions">
      <a class="sideLink" href="../options/options.html">configurações</a>
    </div>
  </header>

  <div class="main">
    <main class="workarea noLeftMargin" class:shiftRight={sidenavOpen}>
      <section class="panel active fullHeight" id="panel-projects-dedicated">
        <div class="panelHeader">
          <div>
            <h2>Meus projetos</h2>
            <p>
              Crie, renomeie, remova projetos e marque qual é o atual.
            </p>
          </div>

          <div class="headerActions">
            <div class="alignCenter">
              <button class="btn createGreen" on:click={openCreateSidenav}>
                Novo projeto
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="field minWidth220">
            <label for="filterProjects">Filtrar projetos</label>
            <input
              id="filterProjects"
              type="text"
              bind:value={filter}
              placeholder="Filtrar por nome ou id"
            />
          </div>

          <div class="spacer6"></div>

          <div class="listHead">
            <h3>Projetos</h3>
            <span class="muted">Ações: <b>Editar</b>, <b>Abrir</b>, <b>Arquivar</b>.</span>
          </div>

          <ul class="list">
            {#if filteredProjects.length === 0}
              <li class="placeholderItem">
                <div class="left">
                  <div class="title">
                    {connectionIssue
                      ? 'Erro de conexão com o servidor. Verifique se o servidor está rodando.'
                      : 'Nenhum projeto encontrado'}
                  </div>
                </div>
              </li>
            {:else}
              {#each filteredProjects as project (project.id)}
                <li data-id={project.id}>
                  <div class="left">
                    <div
                      class="pill"
                      style={`background:${project.color || 'transparent'}`}
                    ></div>

                    <div class="projectTexts">
                      <div class="title">{project.name || '—'}</div>
                      <div class="sub">{project.id ? `id: ${project.id}` : ''}</div>
                    </div>
                  </div>

                  <div class="right">
                    <button on:click={() => handleEdit(project.id)}>
                      Editar
                    </button>

                    <button on:click={() => handleOpenProject(project)}>
                      {project.isCurrent ? 'Ver' : 'Abrir'}
                    </button>

                    <button on:click={() => handleArchive(project)}>
                      Arquivar
                    </button>
                  </div>
                </li>
              {/each}
            {/if}
          </ul>
        </div>
      </section>
    </main>

    <aside class="sidenav projectsSidenav" class:open={sidenavOpen} aria-hidden={!sidenavOpen}>
      <h2>{editMode ? 'Edite o projeto' : 'Novo projeto'}</h2>

      <div class="note">Preencha os campos obrigatórios marcados com *</div>

      <div class="formRow formRowStack">
        <label for="projectName">Nome do projeto *</label>
        <input
          id="projectName"
          type="text"
          bind:value={projectName}
          placeholder="Ex.: Revisão Sistemática"
        />
      </div>

      <div class="formRow formRowStack">
        <label for="projectIdPreview">
          ID do projeto <span class="muted" style={`color:${projectIdStatusColor}`}>{projectIdStatus}</span>
        </label>
        <input
          id="projectIdPreview"
          type="text"
          value={projectIdPreview}
          readonly
          placeholder="Pré-visualização do ID"
          disabled
        />
      </div>

      <div class="formRow formRowStack">
        <label for="projectDescription">Descrição *</label>
        <textarea
          id="projectDescription"
          rows="3"
          bind:value={projectDescription}
          placeholder="Breve descrição"
        ></textarea>
      </div>

      <div class="formRow formRowStack">
        <label for="projectResearchers">Pesquisadores * (separados por vírgula)</label>
        <input
          id="projectResearchers"
          type="text"
          bind:value={projectResearchers}
          placeholder="Nome1, Nome2"
        />
      </div>

      <div class="formRow formRowStack">
        <label for="projectObjective">Objetivo</label>
        <textarea
          id="projectObjective"
          rows="2"
          bind:value={projectObjective}
          placeholder="Objetivo do projeto"
        ></textarea>
      </div>

      <div class="formActions">
        <button class="btn" on:click={closeSidenav}>Cancelar</button>
        <button class="btn primary" on:click={handleSaveProject}>
          {editMode ? 'Salvar' : 'Criar projeto'}
        </button>
      </div>
    </aside>
  </div>
</div>

<style>
  .panelHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panelHeader .headerActions {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 100%;
  }

  .btn.createGreen {
    background: #2ea44f;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    min-width: 120px;
  }

  .btn.createGreen:hover {
    filter: brightness(0.95);
  }

  .workarea.noLeftMargin {
    margin-left: 0;
  }

  .panel.fullHeight {
    height: 100%;
  }

  .alignCenter {
    display: flex;
    align-items: center;
  }

  .field.minWidth220 {
    min-width: 220px;
  }

  .spacer6 {
    height: 6px;
  }

  .projectTexts {
    min-width: 0;
  }

  .placeholderItem {
    opacity: 0.8;
  }

  .projectsSidenav {
    height: 100%;
    width: 0;
    transform: scale(0, 1);
    transition: width 0.25s ease;
    overflow: auto;
    display: none;
    flex-direction: column;
  }

  .projectsSidenav.open {
    width: 380px;
    display: flex;
    transform: scale(1, 1);
  }

  .shiftRight {
  }

  .projectsSidenav .formRowStack {
    display: block;
    margin-bottom: 12px;
  }

  .projectsSidenav label {
    display: block;
    font-size: 12px;
    color: #333;
    margin-bottom: 6px;
  }

  .projectsSidenav input[type='text'],
  .projectsSidenav textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .projectsSidenav .formActions {
    text-align: right;
    margin-top: 12px;
  }

  .projectsSidenav h2 {
    color: #303030;
    margin-bottom: 0;
  }

  .projectsSidenav .btn.primary {
    color: #101010;
    border: 1px solid var(--btn);
  }

  .projectsSidenav::-webkit-scrollbar {
    width: 8px;
  }

  .projectsSidenav::-webkit-scrollbar-track {
    background: rgb(255 255 255 / 14%);
    border-radius: 4px;
    margin: 3px 3px 3px 0;
  }

  .projectsSidenav::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: #00000069;
  }

  .projectsSidenav::-webkit-scrollbar-thumb:hover {
    background: var(--btnHover);
  }
</style>