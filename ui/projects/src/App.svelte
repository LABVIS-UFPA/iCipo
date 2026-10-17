<script>
  import { onMount } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';
  import { slugify } from '../../../core/utils.mjs';
  import { Project, DEFAULT_PROJECT_CATEGORIES } from '../../../core/entities.mjs';
  import '../../tokens.css';

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

    const collision = projects.some((p) => p.id === base);
    if (collision) {
      projectIdStatus = ' • ID já em uso';
      projectIdStatusColor = '#b42318';
    } else {
      projectIdStatus = ' • ID disponível';
      projectIdStatusColor = '#16784a';
    }
  }

  async function loadProjects() {
    try {
      const activeProj = await storage.getActiveProject().catch(() => null);
      const activeID = activeProj?.id || activeProj?.data?.id;

      const res = await storage.listProjects();
      const list = res?.data || res || [];

      projects = (Array.isArray(list) ? list : []).map((p) => ({
        ...p,
        isCurrent: Boolean(activeID && p.id === activeID)
      }));
      connectionIssue = false;
    } catch (err) {
      console.error('Falha ao carregar lista de projetos:', err);
      projects = [];
      connectionIssue = true;
    }
  }

  function openCreateSidenav() {
    editMode = false;
    editingProjectID = null;
    projectName = '';
    projectDescription = '';
    projectResearchers = '';
    projectObjective = '';
    sidenavOpen = true;
  }

  async function handleEdit(projectID) {
    try {
      const p = await storage.loadProject(projectID);
      const data = p?.data || p;
      if (!data) return;

      editMode = true;
      editingProjectID = data.id;
      projectName = data.name || '';
      projectDescription = data.description || '';
      projectResearchers = Array.isArray(data.researchers)
        ? data.researchers.join(', ')
        : (data.researchers || '');
      projectObjective = data.objective || '';

      sidenavOpen = true;
    } catch (err) {
      alert(`Erro ao carregar dados do projeto para edição: ${err.message}`);
    }
  }

  function closeSidenav() {
    sidenavOpen = false;
  }

  async function handleSaveProject() {
    const name = projectName.trim();
    const desc = projectDescription.trim();
    const researchersStr = projectResearchers.trim();
    const obj = projectObjective.trim();

    if (!name || !desc || !researchersStr) {
      alert('Preencha os campos obrigatórios (*)');
      return;
    }

    let targetID = editMode ? editingProjectID : projectIdPreview;
    if (!targetID) {
      alert('Não foi possível gerar um ID válido para este projeto.');
      return;
    }

    if (!editMode && projects.some((p) => p.id === targetID)) {
      alert('O ID gerado já está em uso por outro projeto. Altere o nome.');
      return;
    }

    const researchersArray = researchersStr
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      if (editMode) {
        const existing = await storage.loadProject(targetID);
        const currentData = existing?.data || existing;
        const updated = new Project({
          ...currentData,
          name,
          description: desc,
          researchers: researchersArray,
          objective: obj
        });
        await storage.saveProject(updated);
      } else {
        const newProj = new Project({
          id: targetID,
          name,
          description: desc,
          researchers: researchersArray,
          objective: obj,
          categories: DEFAULT_PROJECT_CATEGORIES.map((c) => ({ ...c }))
        });
        await storage.saveProject(newProj);
      }

      closeSidenav();
      await loadProjects();
    } catch (err) {
      alert(`Falha ao salvar projeto: ${err.message}`);
    }
  }

  async function handleOpenProject(p) {
    try {
      await storage.openProject(p.id);
      window.location.href = '../dashboard/dashboard.html';
    } catch (err) {
      alert(`Falha ao abrir projeto: ${err.message}`);
    }
  }

  async function handleArchive(p) {
    if (!confirm(`Deseja realmente arquivar o projeto "${p.name || p.id}"?`)) {
      return;
    }
    try {
      await storage.archiveProject(p.id);
      await loadProjects();
    } catch (err) {
      alert(`Falha ao arquivar: ${err.message}`);
    }
  }

  onMount(() => {
    loadProjects();
  });
</script>

<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="logo">
        <picture>
          <source srcset="/img/icipo_logo[dark].png" media="(prefers-color-scheme: dark)" />
          <img class="brandLogo" src="/img/icipo_logo[dark].png" alt="iCipó" />
        </picture>
        <span class="brandFallback">iCipó</span>
      </div>

      <div class="brandText">
        <h1 class="brandTitle">Meus projetos</h1>
        <p class="brandSub">Gerencie e acesse seus estudos RSL</p>
      </div>
    </div>

    <div class="topbarActions">
      <a class="sideLink optionsLink" href="../options/options.html">
        <span class="navIcon" aria-hidden="true">
          <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </span>
        <span>Configurações</span>
      </a>
    </div>

    <div class="sidebarBottom">
      <a class="sideLink dashboardLink" href="../dashboard/dashboard.html">
        <span class="navIcon" aria-hidden="true">
          <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1.5"/>
            <rect x="14" y="3" width="7" height="5" rx="1.5"/>
            <rect x="14" y="12" width="7" height="9" rx="1.5"/>
            <rect x="3" y="16" width="7" height="5" rx="1.5"/>
          </svg>
        </span>
        <span>Voltar ao dashboard</span>
      </a>
    </div>
  </aside>

  <div class="main">
    <main class="workarea noLeftMargin">
      <section class="panel active fullHeight" id="panel-projects-dedicated">
        <div class="panelHeader">
          <div>
            <div class="viewTitleWithBadge">
              <span class="viewTitleIconBadge" aria-hidden="true">
                <svg class="academicSvg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                  <path d="M6 6h10M6 10h10M6 14h6"/>
                </svg>
              </span>
              <h2>Meus projetos</h2>
            </div>
            <p>
              Crie, gerencie, consulte ou arquive seus projetos de revisão e snowballing.
            </p>
          </div>

          <div class="headerActions">
            <button class="btn btn-primary createGreen" on:click={openCreateSidenav}>
              <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Novo projeto</span>
            </button>
          </div>
        </div>

        <div class="card">
          <div class="searchRow">
            <div class="field">
              <label for="filterProjects">Filtrar projetos</label>
              <div class="searchInputWrap">
                <span class="searchIcon" aria-hidden="true">
                  <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <input
                  id="filterProjects"
                  type="text"
                  bind:value={filter}
                  placeholder="Filtrar por nome ou ID do projeto…"
                />
              </div>
            </div>
          </div>

          <div class="listHead">
            <div class="listHeadTitle">
              <h3>Projetos cadastrados</h3>
              <span class="badgeCount">{filteredProjects.length}</span>
            </div>
            <span class="muted">Ações rápidas para abrir, editar ou arquivar estudos.</span>
          </div>

          <ul class="list" aria-label="Lista de projetos">
            {#if filteredProjects.length === 0}
              <li class="placeholderItem">
                <div class="placeholderContent">
                  <span class="placeholderIcon" aria-hidden="true">
                    <svg class="academicSvg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green);">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </span>
                  <div class="title">
                    {connectionIssue
                      ? 'Erro de conexão com o servidor local. Verifique se o server está rodando.'
                      : 'Nenhum projeto encontrado.'}
                  </div>
                  {#if !connectionIssue}
                    <button class="btn btn-primary" on:click={openCreateSidenav}>
                      Criar primeiro projeto
                    </button>
                  {/if}
                </div>
              </li>
            {:else}
              {#each filteredProjects as project (project.id)}
                <li data-id={project.id}>
                  <div class="left">
                    <div
                      class="pill"
                      style={`background:${project.color || '#2eae6c'}`}
                      aria-hidden="true"
                    ></div>

                    <div class="projectTexts">
                      <div class="titleRow">
                        <span class="title">{project.name || 'Projeto sem nome'}</span>
                        {#if project.isCurrent}
                          <span class="currentBadge">Ativo</span>
                        {/if}
                      </div>
                      <div class="sub">
                        <span>ID: <code>{project.id}</code></span>
                        {#if project.researchers && project.researchers.length}
                          <span class="researchers">· {Array.isArray(project.researchers) ? project.researchers.join(', ') : project.researchers}</span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <div class="right">
                    <button class="btn btnAction btnEdit" on:click={() => handleEdit(project.id)} title="Editar dados do projeto">
                      <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      <span>Editar</span>
                    </button>

                    <button class="btn btnAction btnOpen" class:btnCurrent={project.isCurrent} on:click={() => handleOpenProject(project)} title="Abrir projeto no dashboard">
                      <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                      <span>{project.isCurrent ? 'Ver ativo' : 'Abrir'}</span>
                    </button>

                    <button class="btn btnAction btnArchive" on:click={() => handleArchive(project)} title="Arquivar projeto">
                      <svg class="academicSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="21 8 21 21 3 21 3 8"></polyline>
                        <rect x="1" y="3" width="22" height="5"></rect>
                        <line x1="10" y1="12" x2="14" y2="12"></line>
                      </svg>
                      <span>Arquivar</span>
                    </button>
                  </div>
                </li>
              {/each}
            {/if}
          </ul>
        </div>
      </section>
    </main>

    <!-- Backdrop escuro para fechar o sidenav -->
    <div
      class="sideOverlay"
      class:open={sidenavOpen}
      on:click={closeSidenav}
      aria-hidden={!sidenavOpen}
    ></div>

    <!-- Sidenav de Criação / Edição de Projeto -->
    <aside
      class="sidenav projectsSidenav"
      class:open={sidenavOpen}
      aria-hidden={!sidenavOpen}
    >
      <div class="sidenavHeader">
        <div>
          <span class="sidenavEyebrow">{editMode ? 'MODIFICAÇÃO' : 'NOVO CADASTRO'}</span>
          <h2>{editMode ? 'Editar projeto' : 'Novo projeto'}</h2>
        </div>
        <button class="closeBtn" on:click={closeSidenav} aria-label="Fechar painel">✕</button>
      </div>

      <div class="note">Preencha os campos obrigatórios identificados com asterisco (*).</div>

      <div class="formContent">
        <div class="formRow formRowStack">
          <label for="projectName">Nome do projeto *</label>
          <input
            id="projectName"
            type="text"
            bind:value={projectName}
            placeholder="Ex.: Revisão Sistemática de IA"
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
            placeholder="Identificador gerado automaticamente"
            disabled
          />
        </div>

        <div class="formRow formRowStack">
          <label for="projectDescription">Descrição *</label>
          <textarea
            id="projectDescription"
            rows="3"
            bind:value={projectDescription}
            placeholder="Breve descrição dos objetivos e escopo do estudo…"
          ></textarea>
        </div>

        <div class="formRow formRowStack">
          <label for="projectResearchers">Pesquisadores * (separados por vírgula)</label>
          <input
            id="projectResearchers"
            type="text"
            bind:value={projectResearchers}
            placeholder="Ex.: Alice Silva, Roberto Souza"
          />
        </div>

        <div class="formRow formRowStack">
          <label for="projectObjective">Objetivo principal</label>
          <textarea
            id="projectObjective"
            rows="2"
            bind:value={projectObjective}
            placeholder="Meta ou questão de pesquisa central…"
          ></textarea>
        </div>
      </div>

      <div class="formActions">
        <button class="btn btnCancel" on:click={closeSidenav}>Cancelar</button>
        <button class="btn btn-primary btnSave" on:click={handleSaveProject}>
          {editMode ? 'Salvar alterações' : 'Criar projeto'}
        </button>
      </div>
    </aside>
  </div>
</div>

<style>
  :global(*){box-sizing:border-box}
  :global(html),:global(body),:global(#app){width:100%;height:100%;margin:0;overflow:hidden}
  :global(body){
    font-family:var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif);
    background:var(--workspace, #f5f7fa);
    color:var(--text-primary, #172033);
    -webkit-font-smoothing:antialiased;
  }
  :global(button),:global(input),:global(textarea){font:inherit}
  :global(button),:global(a){-webkit-tap-highlight-color:transparent}

  .layout{
    --sidebar:var(--sidebar-bg, #071827);
    --sidebar2:var(--sidebar-bg-2, #0b2032);
    --workspace:var(--workspace, #f5f7fa);
    --surface:var(--surface, #ffffff);
    --text:var(--text-primary, #172033);
    --muted:var(--text-muted, #69758a);
    --border:var(--border, #e1e6ed);
    --borderStrong:var(--border-strong, #d5dce6);
    --green:var(--green, #2eae6c);
    --greenDark:var(--green-dark, #238d57);
    --red:var(--red, #e5484d);
    display:grid;
    grid-template-columns:224px minmax(0,1fr);
    grid-template-rows:100vh;
    width:100%;
    height:100vh;
    max-height:100vh;
    overflow:hidden;
    background:var(--workspace);
  }

  /* Barra lateral */
  .sidebar{
    height:100vh;
    max-height:100vh;
    position:sticky;
    top:0;
    bottom:0;
    min-width:0;
    min-height:0;
    display:flex;
    flex-direction:column;
    color:#ffffff;
    background:linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar2) 58%, #0a1b2a 100%);
    border-right:1px solid rgba(255,255,255,.08);
    box-shadow:10px 0 34px rgba(8,24,39,.08);
    overflow-y:auto;
    overflow-x:hidden;
    z-index:20;
  }
  .brand{
    display:flex;
    flex-direction:column;
    align-items:stretch;
  }
  .logo{
    min-height:72px;
    display:flex;
    align-items:center;
    gap:10px;
    padding:18px 20px;
    border-bottom:1px solid rgba(255,255,255,.08);
  }
  .logo picture{display:block;width:92px;height:34px}
  .brandLogo{display:block;width:92px!important;height:34px!important;max-width:92px;object-fit:contain;object-position:left center}
  .brandFallback{display:none;font-size:18px;font-weight:800;color:#fff}
  .brandText{padding:18px 20px 14px}
  .brandTitle{
    margin:0;
    color:#ffffff;
    font-size:18px;
    font-weight:750;
    letter-spacing:-.02em;
  }
  .brandSub{
    margin:5px 0 0;
    color:rgba(225,235,245,.68);
    font-size:12px;
    line-height:1.45;
  }
  .topbarActions{
    display:flex;
    flex-direction:column;
    gap:7px;
    padding:4px 13px 14px;
  }
  .sideLink{
    min-height:48px;
    display:flex;
    align-items:center;
    gap:11px;
    padding:8px 12px;
    border:1px solid transparent;
    border-radius:9px;
    background:transparent;
    color:rgba(245,248,252,.90);
    text-decoration:none;
    font-size:13px;
    font-weight:700;
    transition:background .15s ease,border-color .15s ease;
  }
  .sideLink .navIcon{
    width:30px;
    height:30px;
    display:grid;
    place-items:center;
    flex:0 0 auto;
    border-radius:8px;
    background:rgba(255,255,255,.07);
    font-size:15px;
    line-height:1;
  }
  .sideLink:hover{background:rgba(255,255,255,.065)}
  .dashboardLink{
    border-color:rgba(73,190,129,.22);
    background:rgba(46,174,108,.12);
  }
  .dashboardLink:hover{
    border-color:rgba(73,190,129,.38);
    background:rgba(46,174,108,.22);
  }
  .sidebarBottom{
    margin-top:auto;
    padding:14px 13px;
    border-top:1px solid rgba(255,255,255,.10);
  }
  .sidebarBottom .dashboardLink{
    width:100%;
  }

  /* Conteúdo Principal */
  .main{
    height:100vh;
    max-height:100vh;
    min-width:0;
    min-height:0;
    display:flex;
    flex-direction:column;
    position:relative;
    overflow:hidden;
    background:var(--workspace);
  }
  .workarea{
    min-width:0;
    min-height:0;
    flex:1 1 auto;
    overflow-y:auto;
    overflow-x:hidden;
    padding:28px 32px 56px;
    max-width:1400px;
    width:100%;
    margin:0 auto;
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
    margin-bottom:22px;
  }
  .panelHeader h2{
    margin:0;
    color:#101828;
    font-size:24px;
    line-height:1.2;
    letter-spacing:-.025em;
    font-weight:800;
  }
  .panelHeader p{margin:5px 0 0;color:var(--muted);font-size:13px}
  .headerActions{display:flex;align-items:center;gap:8px}

  /* Botões */
  .btn{
    min-height:40px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    padding:9px 16px;
    border:1px solid var(--borderStrong);
    border-radius:8px;
    background:#ffffff;
    color:#273142;
    font-size:12.5px;
    font-weight:700;
    cursor:pointer;
    box-shadow:0 1px 2px rgba(16,24,40,.03);
    transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease;
  }
  .btn:hover{background:#f7f9fc;border-color:#cbd3de;transform:translateY(-1px)}
  .btn:active{transform:translateY(0)}
  .btn.btn-primary,.btn.createGreen{
    border-color:var(--green);
    background:linear-gradient(180deg,#35b675,#29a365);
    color:#ffffff;
    box-shadow:0 4px 14px rgba(46,174,108,.22);
  }
  .btn.btn-primary:hover,.btn.createGreen:hover{
    background:linear-gradient(180deg,#31ad6e,#248f58);
    border-color:var(--greenDark);
    box-shadow:0 6px 18px rgba(46,174,108,.32);
  }
  .btn.createGreen{min-width:130px}

  .btnAction{
    min-height:34px;
    padding:6px 13px;
    font-size:12px;
  }
  .btnOpen{
    border-color:var(--green);
    background:var(--green);
    color:#ffffff;
    box-shadow:0 2px 6px rgba(46,174,108,.20);
  }
  .btnOpen:hover{
    background:var(--greenDark);
    border-color:var(--greenDark);
    color:#ffffff;
  }
  .btnCurrent{
    background:#168455;
    border-color:#168455;
  }
  .btnArchive:hover{
    border-color:#f0c9cc;
    background:#fff5f5;
    color:var(--red);
  }

  /* Card e Filtros */
  .card{
    padding:20px;
    border:1px solid var(--border);
    border-radius:11px;
    background:var(--surface);
    box-shadow:0 2px 8px rgba(16,24,40,.035);
  }
  .searchRow{
    margin-bottom:16px;
  }
  .field{width:100%}
  .field label{
    display:block;
    margin-bottom:7px;
    color:#344054;
    font-size:12px;
    font-weight:750;
  }
  .searchInputWrap{
    position:relative;
    width:100%;
    max-width:540px;
    display:flex;
    align-items:center;
  }
  .searchIcon{
    position:absolute;
    left:12px;
    font-size:13px;
    color:#8a95a5;
    pointer-events:none;
  }
  .searchInputWrap input{
    width:100%;
    min-height:40px;
    padding:9px 12px 9px 34px;
    border:1px solid var(--borderStrong);
    border-radius:8px;
    background:#fafbfd;
    color:var(--text);
    outline:0;
    font-size:13px;
    transition:border-color .15s ease,box-shadow .15s ease,background .15s ease;
  }
  .searchInputWrap input:focus{
    border-color:#2eae6c;
    box-shadow:0 0 0 3px rgba(46,174,108,.15);
    background:#fff;
  }

  .listHead{
    min-height:50px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    padding:12px 0;
    border-top:1px solid #edf0f4;
  }
  .listHeadTitle{
    display:flex;
    align-items:center;
    gap:9px;
  }
  .listHead h3{margin:0;color:#172033;font-size:15px;font-weight:750}
  .badgeCount{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:22px;
    height:22px;
    padding:0 7px;
    border-radius:999px;
    background:#eaf8f0;
    color:#16784a;
    font-size:11px;
    font-weight:800;
  }
  .muted{color:#7a8596;font-size:11.5px}

  /* Lista de Projetos */
  .list{
    margin:0;
    padding:0;
    overflow:hidden;
    list-style:none;
    border:1px solid #e5e9ef;
    border-radius:9px;
  }
  .list>li{
    min-height:74px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    padding:14px 18px;
    border-bottom:1px solid #edf0f4;
    background:#fff;
    transition:background .15s ease;
  }
  .list>li:last-child{border-bottom:0}
  .list>li:hover{background:#fbfcfd}
  .list .left{min-width:0;display:flex;align-items:center;gap:14px;flex:1}
  .pill{
    width:38px!important;
    height:38px!important;
    flex:0 0 auto;
    border-radius:9px!important;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);
  }
  .projectTexts{min-width:0;display:flex;flex-direction:column;gap:3px;flex:1}
  .titleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .title{
    color:#172033;
    font-size:14px;
    font-weight:750;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .currentBadge{
    display:inline-flex;
    align-items:center;
    padding:2px 7px;
    border-radius:999px;
    background:#eaf8f0;
    border:1px solid #bfe4ce;
    color:#16784a;
    font-size:10px;
    font-weight:800;
    text-transform:uppercase;
    letter-spacing:.04em;
  }
  .sub{color:#8a95a5;font-size:11.5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .sub code{font-family:var(--font-mono, monospace);background:#f1f4f8;padding:1px 5px;border-radius:4px;color:#475467;font-size:11px}
  .researchers{color:#64748b}

  .right{flex:0 0 auto;display:flex;align-items:center;gap:8px}

  /* Placeholder de lista vazia */
  .placeholderItem{
    min-height:220px!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    text-align:center;
    padding:32px 20px;
  }
  .placeholderContent{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:10px;
    max-width:380px;
  }
  .placeholderIcon{
    font-size:32px;
    opacity:0.6;
  }
  .placeholderItem .title{
    white-space:normal;
    color:#69758a;
    font-size:13px;
    font-weight:600;
    line-height:1.5;
  }

  /* Overlay de Backdrop */
  .sideOverlay{
    position:fixed;
    inset:0;
    z-index:40;
    background:rgba(5, 15, 28, 0.65);
    backdrop-filter:blur(4px);
    opacity:0;
    pointer-events:none;
    transition:opacity .24s ease;
  }
  .sideOverlay.open{
    opacity:1;
    pointer-events:auto;
  }

  /* Painel lateral (Sidenav) */
  .sidenav.projectsSidenav{
    position:fixed;
    top:0;
    right:0;
    bottom:0;
    z-index:50;
    width:min(440px, 94vw)!important;
    height:100%;
    display:flex!important;
    flex-direction:column;
    padding:24px;
    overflow-y:auto;
    border-left:1px solid #e1e6ed;
    background:#ffffff;
    box-shadow:-18px 0 48px rgba(5,17,29,.20);
    transform:translateX(105%)!important;
    visibility:hidden;
    transition:transform .24s cubic-bezier(0.4, 0, 0.2, 1), visibility .24s ease;
  }
  .sidenav.projectsSidenav.open{
    transform:translateX(0)!important;
    visibility:visible;
  }
  .sidenavHeader{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    margin-bottom:8px;
  }
  .sidenavEyebrow{
    display:block;
    margin-bottom:4px;
    color:#2b9e65;
    font-size:10px;
    font-weight:850;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .projectsSidenav h2{margin:0;color:#101828;font-size:20px;letter-spacing:-.025em;font-weight:800}
  .closeBtn{
    width:32px;
    height:32px;
    display:grid;
    place-items:center;
    border-radius:6px;
    background:#f1f4f8;
    color:#475467;
    font-size:13px;
    cursor:pointer;
    border:0;
    transition:background .15s ease;
  }
  .closeBtn:hover{background:#e2e8f0;color:#0f172a}
  .projectsSidenav .note{margin:4px 0 20px;color:var(--muted);font-size:12px}

  .formContent{
    display:flex;
    flex-direction:column;
    gap:14px;
    flex:1;
  }
  .formRowStack{display:flex;flex-direction:column;gap:6px}
  .projectsSidenav label{
    display:block;
    color:#344054;
    font-size:12px;
    font-weight:750;
  }
  .projectsSidenav input[type=text],.projectsSidenav textarea{
    width:100%;
    border:1px solid #d8dee7;
    border-radius:8px;
    background:#fff;
    color:#172033;
    outline:0;
    font-size:13px;
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .projectsSidenav input[type=text]{min-height:40px;padding:9px 12px}
  .projectsSidenav textarea{min-height:86px;padding:10px 12px;resize:vertical;line-height:1.45}
  .projectsSidenav input:focus,.projectsSidenav textarea:focus{
    border-color:#2eae6c;
    box-shadow:0 0 0 3px rgba(46,174,108,.16);
  }
  .projectsSidenav input:disabled{background:#f3f5f8;color:#778294;cursor:not-allowed}
  .formActions{
    position:sticky;
    bottom:-24px;
    display:flex;
    justify-content:flex-end;
    gap:10px;
    margin:24px -24px -24px;
    padding:16px 24px;
    border-top:1px solid #e6eaf0;
    background:#fafbfd;
  }

  /* =========================================================
     RESPONSIVIDADE MULTITELA
     ========================================================= */

  @media(max-width:980px){
    .layout{grid-template-columns:200px minmax(0,1fr)}
    .workarea{padding:24px 20px 32px}
  }

  @media(max-width:768px){
    :global(html),:global(body),:global(#app){overflow:auto}
    .layout{display:block;height:auto;min-height:100vh}
    .sidebar{min-height:auto;position:relative}
    .brand{flex-direction:row;align-items:center}
    .logo{min-height:58px;padding:12px 16px;border-bottom:0}
    .brandText{display:none}
    .topbarActions{
      flex-direction:row;
      margin-left:auto;
      padding:10px 12px;
      gap:8px;
    }
    .sideLink{min-height:38px;padding:6px 10px;font-size:12px}
    .sidebarBottom{
      margin-top:0;
      padding:10px 12px 10px 0;
      border-top:0;
    }
    .sidebarBottom .dashboardLink{
      width:auto;
    }
    .main{min-height:calc(100vh - 80px)}
    .workarea{overflow:visible;padding:18px 14px 30px}
    .panelHeader{align-items:flex-start}
    .panelHeader h2{font-size:20px}
    .card{padding:16px 14px}
    .listHead{align-items:flex-start;flex-direction:column;gap:6px}
  }

  @media(max-width:640px){
    .list>li{
      align-items:flex-start;
      flex-direction:column;
      gap:12px;
      padding:14px;
    }
    .list .left{width:100%}
    .right{
      width:100%;
      display:grid;
      grid-template-columns:1fr 1fr 1fr;
      gap:6px;
    }
    .btnAction{
      width:100%;
      min-width:0;
      padding-inline:6px;
      text-align:center;
    }
    .sidenav.projectsSidenav{
      width:100%!important;
      max-width:100vw!important;
      border-radius:0;
      padding:18px 16px;
    }
    .formActions{
      margin:20px -16px -18px;
      padding:14px 16px;
    }
  }

  @media(max-width:520px){
    .panelHeader{flex-direction:column;gap:12px}
    .headerActions,.btn.createGreen{width:100%}
    .searchInputWrap{max-width:100%}
  }
</style>