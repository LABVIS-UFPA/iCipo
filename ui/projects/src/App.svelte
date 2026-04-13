<script>
  import { onMount } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';
  import { slugify } from '../../../core/utils.mjs';
  import { Project } from '../../../core/entities.mjs';

  // Lista principal de projetos carregados do storage
  let projects = [];

  // Texto usado para filtro de busca
  let filter = '';

  // Controle da UI (sidenav lateral)
  let sidenavOpen = false;

  // Indica se está editando ou criando um projeto
  let editMode = false;

  // Guarda o ID do projeto quando for edição
  let editingProjectID = null;

  // Campos do form
  let projectName = '';
  let projectDescription = '';
  let projectResearchers = '';
  let projectObjective = '';

  // Preview do ID gerado automaticamente
  let projectIdPreview = '';
  let projectIdStatus = '';
  let projectIdStatusColor = 'inherit';

  /**
   * Computed
   * Sempre que "projects" ou "filter" mudam, recalcula a lista filtrada
   */
  $: filteredProjects = projects.filter((p) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;

    return (
      (p.name || '').toLowerCase().includes(query) ||
      (p.id || '').toLowerCase().includes(query)
    );
  });

  /**
   * Sempre que qualquer variável usada dentro dessa função mudar,
   * o Svelte executa automaticamente
   */
  $: updateIdPreview();

  /**
   * Gera o ID do projeto baseado no nome (slug)
   * Também valida se já está em uso
   */
  function updateIdPreview() {
    const name = projectName.trim();
    const base = slugify(name, { separator: '_', fallback: '' });

    // Quando for edição, não altera o ID
    if (editMode && editingProjectID) {
      projectIdPreview = editingProjectID;
      projectIdStatus = '';
      projectIdStatusColor = 'inherit';
      return;
    }

    projectIdPreview = base;

    // Se ainda não tem nome, limpa status
    if (!base) {
      projectIdStatus = '';
      projectIdStatusColor = 'inherit';
      return;
    }

    // Verifica se ID já existe
    const inUse = projects.some((p) => p.id === base);

    projectIdStatus = inUse ? 'em uso' : 'disponível';
    projectIdStatusColor = inUse ? 'crimson' : 'green';
  }

  /**
   * Reseta todos os campos do formulário
   */
  function resetForm() {
    projectName = '';
    projectDescription = '';
    projectResearchers = '';
    projectObjective = '';
    projectIdPreview = '';
    projectIdStatus = '';
    projectIdStatusColor = 'inherit';
  }

  /**
   * Abre o sidenav
   */
  function openSidenav() {
    sidenavOpen = true;
  }

  /**
   * Fecha o sidenav e limpa estado
   */
  function closeSidenav() {
    sidenavOpen = false;
    editMode = false;
    editingProjectID = null;
    resetForm();
  }

  /**
   * Abre modo criação
   */
  function openCreateSidenav() {
    editMode = false;
    editingProjectID = null;
    resetForm();
    openSidenav();
  }

  /**
   * Abre modo edição preenchendo os dados
   */
  function openEditSidenav(project) {
    editMode = true;
    editingProjectID = project.id;

    projectName = project.name || '';
    projectDescription = project.description || '';

    // Converte array -> string separada por vírgula
    projectResearchers = (project.researchers || []).join(', ');

    projectObjective = project.objective || '';

    // Mantém ID fixo
    projectIdPreview = project.id || '';
    projectIdStatus = '';
    projectIdStatusColor = 'inherit';

    openSidenav();
  }

  /**
   * Carrega projetos do storage
   */
  async function loadProjectsFromStorage() {
    try {
      projects = await storage.listProjects();
    } catch (e) {
      console.warn('Failed to load projects from storage', e);
      projects = [];
    }
  }

  /**
   * Carrega um projeto específico para edição
   */
  async function handleEdit(projectId) {
    try {
      const projectData = await storage.loadProject(projectId);
      openEditSidenav(projectData);
    } catch (e) {
      console.warn('loadProject failed', e);
      alert('Falha ao carregar o projeto. Veja console.');
    }
  }

  /**
   * Define projeto como atual e redireciona
   */
  async function handleOpenProject(project) {
    try {
      await storage.openProject(project.id);
      window.location.href = '../dashboard/dashboard.html';
    } catch (e) {
      console.warn('openProject failed', e);
      alert('Falha ao abrir o projeto. Veja console.');
    }
  }

  /**
   * Arquiva projeto (com confirmação)
   */
  async function handleArchive(project) {
    const confirmed = window.confirm(`Arquivar o projeto "${project.name}"?`);
    if (!confirmed) return;

    try {
      await storage.archiveProject(project.id);

      // Remove da lista local (sem reload completo)
      projects = projects.filter((p) => p.id !== project.id);
    } catch (e) {
      console.warn('archiveProject failed', e);
      alert('Falha ao arquivar o projeto. Veja console.');
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

    // Converte string -> array
    p.researchers = researchers.split(',').map((s) => s.trim()).filter(Boolean);

    p.objective = objective;

    await storage.saveProject(new Project(p.id, p));
  }

  /**
   * Cria novo projeto
   */
  async function createNewProject(name, desc, researchers, objective) {
    const suggested = projectIdPreview.trim();

    // Usa slug do nome ou fallback
    const baseId = suggested || slugify(name, { separator: '_', fallback: '' });

    // Se ainda não tiver ID, gera automático
    const finalId = baseId || `p_${Date.now().toString(36)}`;

    // Valida duplicidade
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

  /**
   * Handler principal de salvar
   */
  async function handleSaveProject() {
    const name = projectName.trim();
    const desc = projectDescription.trim();
    const researchers = projectResearchers.trim();
    const objective = projectObjective.trim();

    // Validações básicas
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

      // Recarrega lista após salvar
      await loadProjectsFromStorage();

      closeSidenav();
    } catch (e) {
      console.warn('saveProject failed', e);
      alert('Falha ao salvar o projeto. Veja console.');
    }
  }

  /**
   * Executa ao montar o componente
   */
  onMount(async () => {
    await loadProjectsFromStorage();

    // fallback (parece redundante — pode remover futuramente)
    setTimeout(() => {
      if (!projects.length) {
        projects = [];
      }
    }, 6000);
  });
</script>
