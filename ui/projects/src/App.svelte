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

  $: {
    projectName;
    projects;
    editMode;
    editingProjectID;
    updateIdPreview();
  }

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

    if (!projectData) {
      console.warn(`Projeto com id "${projectId}" não encontrado`);
      alert('Projeto não encontrado.');
      return;
    }

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
        <div class="brandSub">Gerencie projetos</div>
      </div>
    </div>

    <div class="topbarActions">
      <a class="sideLink optionsLink" href="../options/options.html">
        Configurações
      </a>
    </div>

    <div class="sidebarBottom">
      <a class="sideLink dashboardLink" href="../dashboard/dashboard.html">
        Voltar ao dashboard
      </a>
    </div>
  </header>

  <div class="main">
    <main class="workarea noLeftMargin">
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

:global(*){box-sizing:border-box}
:global(html),:global(body),:global(#app){width:100%;height:100%;margin:0;overflow:hidden}
:global(body){
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",Helvetica,Arial,sans-serif;
  background:#f5f7fa;
  color:#172033;
}
:global(button),:global(input),:global(textarea){font:inherit}
:global(button),:global(a){-webkit-tap-highlight-color:transparent}

.layout{
  --sidebar:#071827;
  --sidebar2:#0b2032;
  --workspace:#f5f7fa;
  --surface:#fff;
  --text:#172033;
  --muted:#69758a;
  --border:#e1e6ed;
  --borderStrong:#d5dce6;
  --green:#2eae6c;
  --greenDark:#238d57;
  --red:#d9474d;
  display:grid;
  grid-template-columns:224px minmax(0,1fr);
  width:100%;
  height:100%;
  background:var(--workspace);
}

/* Barra lateral */
.topbar{
  min-width:0;
  min-height:0;
  display:flex;
  flex-direction:column;
  color:#fff;
  background:linear-gradient(180deg,var(--sidebar) 0%,var(--sidebar2) 58%,#0a1b2a 100%);
  border-right:1px solid rgba(255,255,255,.08);
  box-shadow:10px 0 34px rgba(8,24,39,.08);
  z-index:2;
}
.brand{
  display:flex;
  flex-direction:column;
  align-items:stretch;
}
.logo{
  min-height:62px;
  display:flex;
  align-items:center;
  padding:14px 18px;
  border-bottom:1px solid rgba(255,255,255,.08);
}
.logo picture{display:block;width:92px;height:34px}
.brandLogo{display:block;width:92px!important;height:34px!important;max-width:92px;object-fit:contain;object-position:left center}
.brandText{padding:22px 18px 16px}
.brandTitle{
  margin:0;
  color:#fff;
  font-size:19px;
  font-weight:750;
  letter-spacing:-.025em;
}
.brandSub{
  margin-top:7px;
  color:rgba(225,235,245,.66);
  font-size:11.5px;
  line-height:1.45;
}
.topbarActions{
  display:flex;
  flex-direction:column;
  gap:7px;
  padding:4px 13px 14px;
}
.sideLink{
  min-height:56px;
  display:flex;
  align-items:center;
  gap:11px;
  padding:9px 11px;
  border:1px solid transparent;
  border-radius:9px;
  background:transparent;
  color:rgba(245,248,252,.90);
  text-decoration:none;
  font-size:12.5px;
  font-weight:700;
  transition:background .15s ease,border-color .15s ease;
}
.sideLink::before{
  width:31px;
  height:31px;
  display:grid;
  place-items:center;
  flex:0 0 auto;
  border-radius:9px;
  background:rgba(255,255,255,.07);
  font-size:16px;
  line-height:1;
}
.dashboardLink::before{content:"⌂"}
.optionsLink::before{content:"⚙"}
.sideLink:hover{background:rgba(255,255,255,.065)}
.dashboardLink{
  border-color:rgba(73,190,129,.20);
  background:rgba(46,174,108,.12);
}
.dashboardLink:hover{
  border-color:rgba(73,190,129,.34);
  background:rgba(46,174,108,.20);
}
.sidebarBottom{
  margin-top:auto;
  padding:14px;
  border-top:1px solid rgba(255,255,255,.10);
}
.sidebarBottom .dashboardLink{
  width:100%;
}

/* Conteúdo */
.main{
  min-width:0;
  min-height:0;
  display:flex;
  position:relative;
  background:var(--workspace);
}
.workarea{
  min-width:0;
  min-height:0;
  flex:1;
  overflow-y:auto;
  padding:30px 32px 38px;
  scrollbar-width:thin;
  scrollbar-color:#c8d0db transparent;
}
.workarea::-webkit-scrollbar{width:8px}
.workarea::-webkit-scrollbar-thumb{background:#c8d0db;border-radius:999px}
.panel{display:none}
.panel.active{display:block}
.panelHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:22px;
  margin-bottom:20px;
}
.panelHeader h2{
  margin:0;
  color:#101828;
  font-size:25px;
  line-height:1.15;
  letter-spacing:-.025em;
}
.panelHeader p{margin:6px 0 0;color:var(--muted);font-size:12px}
.headerActions{display:flex;align-items:center;gap:8px}
.alignCenter{display:flex;align-items:center}

.btn,
.right button{
  min-height:38px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  padding:9px 13px;
  border:1px solid var(--borderStrong);
  border-radius:8px;
  background:#fff;
  color:#273142;
  font-size:10.5px;
  font-weight:750;
  cursor:pointer;
  box-shadow:0 1px 2px rgba(16,24,40,.03);
  transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease;
}
.btn:hover,.right button:hover{background:#f7f9fc;border-color:#cbd3de}
.btn:active,.right button:active{transform:translateY(1px)}
.btn.createGreen,.btn.primary,.right button:nth-child(2){
  border-color:#26945d;
  background:linear-gradient(180deg,#35b675,#29a365);
  color:#fff;
  box-shadow:0 7px 16px rgba(46,174,108,.16);
}
.btn.createGreen:hover,.btn.primary:hover,.right button:nth-child(2):hover{
  border-color:#238c57;
  background:linear-gradient(180deg,#31ad6e,#248f58);
}
.btn.createGreen{min-width:126px}
.right button:last-child:hover{border-color:#f0c9cc;background:#fff5f5;color:var(--red)}

.card{
  padding:18px;
  border:1px solid var(--border);
  border-radius:11px;
  background:var(--surface);
  box-shadow:0 2px 8px rgba(16,24,40,.035);
}
.field{min-width:220px}
.field label{
  display:block;
  margin-bottom:7px;
  color:#344054;
  font-size:10.5px;
  font-weight:750;
}
.field input{
  width:min(420px,100%);
  min-height:40px;
  padding:9px 11px;
  border:1px solid var(--borderStrong);
  border-radius:8px;
  background:#fafbfd;
  color:var(--text);
  outline:0;
  font-size:11px;
}
.field input:focus{border-color:#55a67c;box-shadow:0 0 0 3px rgba(46,174,108,.10);background:#fff}
.spacer6{height:14px}
.listHead{
  min-height:52px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:12px 0;
  border-top:1px solid #edf0f4;
}
.listHead h3{margin:0;color:#172033;font-size:13px}
.muted{color:#7a8596;font-size:9.5px}
.list{
  margin:0;
  padding:0;
  overflow:hidden;
  list-style:none;
  border:1px solid #e5e9ef;
  border-radius:9px;
}
.list>li{
  min-height:76px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  padding:14px 16px;
  border-bottom:1px solid #edf0f4;
  background:#fff;
  transition:background .15s ease;
}
.list>li:last-child{border-bottom:0}
.list>li:hover{background:#fbfcfd}
.list .left{min-width:0;display:flex;align-items:center;gap:12px}
.pill{
  width:39px!important;
  height:39px!important;
  flex:0 0 auto;
  border-radius:10px!important;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.05);
}
.projectTexts{min-width:0}
.title{
  color:#172033;
  font-size:12.5px;
  font-weight:750;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.sub{margin-top:4px;color:#8a95a5;font-size:9.5px;word-break:break-all}
.right{flex:0 0 auto;display:flex;align-items:center;gap:7px}
.placeholderItem{min-height:220px!important;justify-content:center!important;text-align:center}
.placeholderItem .left{justify-content:center}
.placeholderItem .title{white-space:normal;color:#69758a;font-weight:650}

/* Painel lateral */
.sidenav.projectsSidenav{
  position:fixed;
  top:0;
  right:0;
  z-index:31;
  width:min(430px,94vw)!important;
  height:100%;
  display:flex!important;
  flex-direction:column;
  padding:23px 24px 18px;
  overflow-y:auto;
  border-left:1px solid #e1e6ed;
  background:#fff;
  box-shadow:-18px 0 48px rgba(5,17,29,.20);
  transform:translateX(105%)!important;
  visibility:hidden;
  transition:transform .24s ease,visibility .24s ease;
}
.sidenav.projectsSidenav.open{transform:translateX(0)!important;visibility:visible}
.sidenav.projectsSidenav::before{
  content:"NOVO CADASTRO";
  display:block;
  margin-bottom:5px;
  color:#2b9e65;
  font-size:8.5px;
  font-weight:850;
  letter-spacing:.08em;
}
.projectsSidenav h2{margin:0;color:#101828;font-size:20px;letter-spacing:-.025em}
.projectsSidenav .note{margin:6px 0 20px;color:var(--muted);font-size:10px}
.formRowStack{display:block;margin-bottom:17px}
.projectsSidenav label{
  display:block;
  margin-bottom:7px;
  color:#344054;
  font-size:10.5px;
  font-weight:750;
}
.projectsSidenav input[type=text],.projectsSidenav textarea{
  width:100%;
  border:1px solid #d8dee7;
  border-radius:8px;
  background:#fff;
  color:#172033;
  outline:0;
  font-size:11px;
  transition:border-color .15s ease,box-shadow .15s ease;
}
.projectsSidenav input[type=text]{min-height:40px;padding:9px 11px}
.projectsSidenav textarea{min-height:84px;padding:10px 11px;resize:vertical;line-height:1.45}
.projectsSidenav input:focus,.projectsSidenav textarea:focus{border-color:#56a980;box-shadow:0 0 0 3px rgba(46,174,108,.10)}
.projectsSidenav input:disabled{background:#f3f5f8;color:#778294;cursor:not-allowed}
.formActions{
  position:sticky;
  bottom:-18px;
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin:auto -24px -18px;
  padding:15px 24px;
  border-top:1px solid #e6eaf0;
  background:#fafbfd;
}
.projectsSidenav::-webkit-scrollbar{width:8px}
.projectsSidenav::-webkit-scrollbar-thumb{background:#c8d0db;border-radius:999px}

@media(max-width:900px){
  .layout{grid-template-columns:190px minmax(0,1fr)}
  .workarea{padding:24px 20px 32px}
  .list>li{align-items:flex-start;flex-direction:column}
  .right{width:100%;justify-content:flex-end}
}
@media(max-width:720px){
  :global(html),:global(body),:global(#app){overflow:auto}
  .layout{display:block;height:auto;min-height:100vh}
  .topbar{min-height:auto}
  .brand{flex-direction:row;align-items:center}
  .logo{min-height:56px;border-bottom:0}
  .brandText{display:none}
  .topbarActions{margin-left:auto;padding:10px}
  .sideLink{min-height:40px;padding:6px 9px}
  .sideLink::before{width:26px;height:26px}
  .sidebarBottom{margin-top:0;padding:0 10px 10px;border-top:0}
  .main{min-height:calc(100vh - 116px)}
  .workarea{overflow:visible;padding:18px 14px 28px}
  .panelHeader{align-items:flex-start}
  .panelHeader h2{font-size:22px}
  .card{padding:14px}
  .listHead{align-items:flex-start;flex-direction:column}
}
@media(max-width:520px){
  .panelHeader{flex-direction:column}
  .headerActions,.btn.createGreen{width:100%}
  .right{display:grid;grid-template-columns:1fr 1fr 1fr}
  .right button{min-width:0;padding-inline:8px}
}

</style>