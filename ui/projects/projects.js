import { storage } from '../../infrastructure/storage.mjs';
import { slugify } from '../../core/utils.mjs';
import { Project } from '../../core/entities.mjs';

/* ==========================================================================
   projects.js - Gerenciamento de Projetos SVAT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ==========================================================================
     SEÇÃO 1: SELEÇÃO DE ELEMENTOS DOM
     ========================================================================== */
  const elements = {
    // Filtro e botões principais
    filterInput: document.getElementById('newProjectName'),
    openCreateBtn: document.getElementById('openCreateBtn'),
    
    // Sidebar de criação/edição
    createSidenav: document.getElementById('createSidenav'),
    createSidenavTitle: null, // Será definido após verificação
    createConfirmBtn: document.getElementById('createProjectConfirmBtn'),
    cancelCreateBtn: document.getElementById('cancelCreateBtn'),
    
    // Campos do formulário
    projectNameInput: document.getElementById('projectName'),
    projectDescriptionInput: document.getElementById('projectDescription'),
    projectResearchersInput: document.getElementById('projectResearchers'),
    projectObjectiveInput: document.getElementById('projectObjective'),
    projectIdPreview: document.getElementById('projectIdPreview'),
    projectIdStatus: document.getElementById('projectIdStatus'),
    
    // Lista de projetos e área de trabalho
    projectList: document.getElementById('projectList'),
    workarea: document.querySelector('.workarea'),
  };

  // Configura título da sidebar após garantir que o elemento existe
  if (elements.createSidenav) {
    elements.createSidenavTitle = elements.createSidenav.querySelector('h2');
  }

  /* ==========================================================================
     SEÇÃO 2: ESTADO GLOBAL
     ========================================================================== */
  let projects = [];
  let editMode = false;
  let editingProjectID = null;

  /* ==========================================================================
     SEÇÃO 3: FUNÇÕES UTILITÁRIAS
     ========================================================================== */

  /**
   * Exibe mensagem de placeholder quando não há projetos
   */
  function showPlaceholder() {
    if (!elements.projectList) return;
    
    elements.projectList.innerHTML = '';
    const li = document.createElement('li');
    li.style.opacity = '0.8';
    li.innerHTML = '<div class="left"><div class="title">Nenhum projeto encontrado</div></div>';
    elements.projectList.appendChild(li);
  }

  /**
   * Abre o sidenav (sidebar de criação/edição)
   */
  function openSidenav() {
    if (!elements.createSidenav || !elements.workarea) return;
    
    elements.createSidenav.classList.add('open');
    elements.workarea.classList.add('shiftRight');
    elements.createSidenav.setAttribute('aria-hidden', 'false');
  }

  /**
   * Fecha o sidenav e limpa os campos
   */
  function closeSidenav() {
    if (!elements.createSidenav || !elements.workarea) return;
    
    elements.createSidenav.classList.remove('open');
    elements.workarea.classList.remove('shiftRight');
    elements.createSidenav.setAttribute('aria-hidden', 'true');
    
    // Limpa campos
    if (elements.projectNameInput) elements.projectNameInput.value = '';
    if (elements.projectDescriptionInput) elements.projectDescriptionInput.value = '';
    if (elements.projectResearchersInput) elements.projectResearchersInput.value = '';
    if (elements.projectObjectiveInput) elements.projectObjectiveInput.value = '';
    if (elements.projectIdPreview) elements.projectIdPreview.value = '';
    if (elements.projectIdStatus) elements.projectIdStatus.textContent = '';
  }

  /**
   * Atualiza a prévia do ID baseado no nome do projeto
   */
  function updateIdPreview() {
    if (!elements.projectIdPreview || !elements.projectIdStatus) return;
    
    const name = (elements.projectNameInput?.value || '').trim();
    const base = slugify(name, { separator: '_', fallback: '' });
    
    elements.projectIdPreview.value = base;
    
    if (!base) {
      elements.projectIdStatus.textContent = '';
      return;
    }
    
    const inUse = projects.some((p) => p.id === base && (!editingProjectID || p.id !== editingProjectID));
    elements.projectIdStatus.textContent = inUse ? 'em uso' : 'disponível';
    elements.projectIdStatus.style.color = inUse ? 'crimson' : 'green';
  }

  /**
   * Garante que o ID seja único adicionando sufixo numérico se necessário
   * @param {string} base - ID base
   * @returns {string} ID único
   */
  function ensureUniqueId(base) {
    let id = base;
    let counter = 1;
    
    while (projects.some((p) => p.id === id)) {
      id = `${base}_${counter++}`;
    }
    
    return id;
  }

  /* ==========================================================================
     SEÇÃO 4: CRIAÇÃO DE ELEMENTOS DE PROJETO
     ========================================================================== */

  /**
   * Cria um item de projeto na lista
   * @param {Object} project - Dados do projeto
   * @returns {HTMLElement} Elemento li do projeto
   */
  function createProjectItem(project) {
    const li = document.createElement('li');
    li.dataset.id = project.id || '';

    const left = createLeftSection(project);
    const right = createRightSection(project, li);

    li.appendChild(left);
    li.appendChild(right);
    
    return li;
  }

  /**
   * Cria a seção esquerda do item de projeto
   * @param {Object} project - Dados do projeto
   * @returns {HTMLElement} Div left
   */
  function createLeftSection(project) {
    const left = document.createElement('div');
    left.className = 'left';

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.style.background = project.color || 'transparent';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = project.name || '—';

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = project.id ? `id: ${project.id}` : '';

    left.appendChild(pill);
    left.appendChild(title);
    left.appendChild(sub);

    return left;
  }

  /**
   * Cria a seção direita do item de projeto com botões de ação
   * @param {Object} project - Dados do projeto
   * @param {HTMLElement} li - Elemento li pai (para remoção)
   * @returns {HTMLElement} Div right
   */
  function createRightSection(project, li) {
    const right = document.createElement('div');
    right.className = 'right';

    const btnRename = createEditButton(project);
    const btnSet = createOpenButton(project);
    const btnRemove = createArchiveButton(project, li);

    right.appendChild(btnRename);
    right.appendChild(btnSet);
    right.appendChild(btnRemove);

    return right;
  }

  /**
   * Cria botão de edição
   * @param {Object} project - Dados do projeto
   * @returns {HTMLElement} Botão
   */
  function createEditButton(project) {
    const btn = document.createElement('button');
    btn.textContent = 'Editar';
    
    btn.addEventListener('click', async () => {
      const projectData = await storage.loadProject(project.id);
      openEditSidenav(projectData);
    });
    
    return btn;
  }

  /**
   * Cria botão de abertura do projeto
   * @param {Object} project - Dados do projeto
   * @returns {HTMLElement} Botão
   */
  function createOpenButton(project) {
    const btn = document.createElement('button');
    btn.textContent = project.isCurrent ? 'Ver' : 'Abrir';
    
    btn.addEventListener('click', async () => {
      try {
        await storage.openProject(project.id);
        window.location.href = '../dashboard/dashboard.html';
      } catch (e) {
        console.warn('openProject failed', e);
        alert('Falha ao abrir o projeto. Veja console.');
      }
    });
    
    return btn;
  }

  /**
   * Cria botão de arquivamento
   * @param {Object} project - Dados do projeto
   * @param {HTMLElement} li - Elemento li a ser removido
   * @returns {HTMLElement} Botão
   */
  function createArchiveButton(project, li) {
    const btn = document.createElement('button');
    btn.textContent = 'Arquivar';
    
    btn.addEventListener('click', async () => {
      if (!confirm(`Arquivar o projeto "${project.name}"?`)) return;
      
      projects = projects.filter((x) => x.id !== project.id);
      
      try { 
        await storage.archiveProject(project.id); 
      } catch (e) { 
        console.warn('archiveProject failed', e); 
      }
      
      li.remove();
      
      if (!elements.projectList?.children.length) {
        showPlaceholder();
      }
    });
    
    return btn;
  }

  /* ==========================================================================
     SEÇÃO 5: RENDERIZAÇÃO DA LISTA DE PROJETOS
     ========================================================================== */

  /**
   * Renderiza a lista de projetos com filtro opcional
   * @param {string} filter - Texto para filtrar projetos
   */
  function renderProjects(filter = '') {
    if (!elements.projectList) return;
    
    const query = (filter || '').toLowerCase();
    elements.projectList.innerHTML = '';
    
    const filteredItems = projects.filter((p) => {
      if (!query) return true;
      return (p.name || '').toLowerCase().includes(query) || 
             (p.id || '').toLowerCase().includes(query);
    });
    
    if (!filteredItems.length) {
      showPlaceholder();
      return;
    }
    
    for (const project of filteredItems) {
      elements.projectList.appendChild(createProjectItem(project));
    }
  }

  /* ==========================================================================
     SEÇÃO 6: GERENCIAMENTO DO SIDENAV (CRIAÇÃO/EDIÇÃO)
     ========================================================================== */

  /**
   * Abre o sidenav no modo de edição com dados do projeto
   * @param {Object} project - Dados do projeto a ser editado
   */
  function openEditSidenav(project) {
    editMode = true;
    editingProjectID = project.id;
    
    if (elements.projectNameInput) elements.projectNameInput.value = project.name || '';
    if (elements.projectIdPreview) elements.projectIdPreview.value = project.id || '';
    if (elements.projectIdStatus) {
      elements.projectIdStatus.textContent = '';
      elements.projectIdStatus.style.color = 'inherit';
    }
    if (elements.projectDescriptionInput) elements.projectDescriptionInput.value = project.description || '';
    if (elements.projectResearchersInput) {
      elements.projectResearchersInput.value = (project.researchers || []).join(', ');
    }
    if (elements.projectObjectiveInput) elements.projectObjectiveInput.value = project.objective || '';
    
    if (elements.createConfirmBtn) elements.createConfirmBtn.textContent = 'Salvar';
    if (elements.createSidenavTitle) elements.createSidenavTitle.textContent = 'Edite o projeto';
    
    openSidenav();
  }

  /**
   * Abre o sidenav no modo de criação com campos limpos
   */
  function openCreateSidenav() {
    editMode = false;
    editingProjectID = null;
    
    // Limpa campos
    if (elements.projectNameInput) elements.projectNameInput.value = '';
    if (elements.projectIdPreview) elements.projectIdPreview.value = '';
    if (elements.projectIdStatus) elements.projectIdStatus.textContent = '';
    if (elements.projectDescriptionInput) elements.projectDescriptionInput.value = '';
    if (elements.projectResearchersInput) elements.projectResearchersInput.value = '';
    if (elements.projectObjectiveInput) elements.projectObjectiveInput.value = '';
    
    if (elements.createConfirmBtn) elements.createConfirmBtn.textContent = 'Criar projeto';
    if (elements.createSidenavTitle) elements.createSidenavTitle.textContent = 'Criar projeto';
    
    openSidenav();
  }

  /**
   * Processa o salvamento do projeto (criação ou edição)
   */
  async function handleSaveProject() {
    const name = (elements.projectNameInput?.value || '').trim();
    const desc = (elements.projectDescriptionInput?.value || '').trim();
    const researchers = (elements.projectResearchersInput?.value || '').trim();
    
    if (!name) return alert('O nome do projeto é obrigatório.');
    if (!desc) return alert('A descrição é obrigatória.');
    if (!researchers) return alert('Informe ao menos um pesquisador.');

    const objective = (elements.projectObjectiveInput?.value || '').trim();

    try {
      if (editMode && editingProjectID) {
        await updateExistingProject(name, desc, researchers, objective);
      } else {
        await createNewProject(name, desc, researchers, objective);
      }
      
      // Reseta modo de edição e atualiza UI
      editMode = false;
      editingProjectID = null;
      if (elements.createConfirmBtn) elements.createConfirmBtn.textContent = 'Criar projeto';
      
      closeSidenav();
      await loadProjectsFromStorage();
    } catch (e) {
      console.warn('saveProject failed', e);
      alert('Falha ao salvar o projeto. Veja console.');
    }
  }

  /**
   * Atualiza projeto existente
   */
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

  /**
   * Cria novo projeto
   */
  async function createNewProject(name, desc, researchers, objective) {
    const suggested = elements.projectIdPreview?.value?.trim() || '';
    const baseId = suggested || slugify(name, { separator: '_', fallback: '' });
    const finalId = baseId || `p_${Date.now().toString(36)}`;
    
    const inUse = projects.some((p) => p.id === finalId);
    if (inUse) {
      return alert('Erro: ID já em uso. Altere o nome para gerar um ID diferente.');
    }
    
    const newProject = {
      id: finalId,
      name,
      description: desc,
      researchers: researchers.split(',').map((s) => s.trim()).filter(Boolean),
      objective,
      isCurrent: false,
    };
    
    await storage.saveProject(new Project(newProject.id, newProject, true));
    projects.push(newProject);
  }

  /* ==========================================================================
     SEÇÃO 7: CARREGAMENTO DE DADOS DO STORAGE
     ========================================================================== */

  /**
   * Carrega projetos do storage
   */
  async function loadProjectsFromStorage() {
    try {
      projects = await storage.listProjects();
      renderProjects(elements.filterInput?.value || '');
    } catch (e) {
      console.warn('Failed to load projects from storage', e);
    }
  }

  /* ==========================================================================
     SEÇÃO 8: CONFIGURAÇÃO DE EVENT LISTENERS
     ========================================================================== */

  /**
   * Configura todos os event listeners
   */
  function setupEventListeners() {
    // Filtro de projetos
    if (elements.filterInput) {
      elements.filterInput.addEventListener('input', () => {
        renderProjects(elements.filterInput?.value || '');
      });
    }

    // Botão de criar novo projeto
    if (elements.openCreateBtn) {
      elements.openCreateBtn.addEventListener('click', openCreateSidenav);
    }

    // Botão de cancelar criação/edição
    if (elements.cancelCreateBtn) {
      elements.cancelCreateBtn.addEventListener('click', closeSidenav);
    }

    // Botão de confirmar criação/edição
    if (elements.createConfirmBtn) {
      elements.createConfirmBtn.addEventListener('click', handleSaveProject);
    }

    // Atualização de preview do ID
    if (elements.projectNameInput) {
      elements.projectNameInput.addEventListener('input', updateIdPreview);
    }
  }

  /* ==========================================================================
     SEÇÃO 9: INICIALIZAÇÃO
     ========================================================================== */

  /**
   * Inicializa a aplicação
   */
  async function init() {
    // Configura event listeners
    setupEventListeners();
    
    // Carrega projetos
    await loadProjectsFromStorage();
    
    // Placeholder de segurança (caso o carregamento falhe)
    setTimeout(() => {
      if (!projects.length && elements.projectList) {
        showPlaceholder();
      }
    }, 6000);
  }

  // Inicia a aplicação
  init();
});