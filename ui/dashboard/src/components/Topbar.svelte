<script>
  import { projectStore, serverStatusStore, openArticleTutorial } from '../dashboardStore.js';
  import { formatResearchers } from '../dashboardHelpers.js';

  $: project = $projectStore || {};
  $: title = project.name || project.title || project.id || 'Projeto';
  $: researchers = formatResearchers(project.researchers || project.researcher);
  $: description = project.description || 'Sem descrição cadastrada.';
  $: isConnected = $serverStatusStore === 'Conectado';
</script>

<header class="topbar">
  <div class="currentProjectBlock">
    <span class="topbarEyebrow">Projeto atual</span>
    <div class="currentProjectPill">
      <strong id="projectTitle">{title}</strong>
      <span class="projectStatus" class:offline={!isConnected}>
        <i></i> {isConnected ? 'Ativo' : 'Offline'}
      </span>
    </div>
    <div class="meta visually-hidden" id="projectMeta">
      {researchers ? `${researchers} — ` : ''}{description}
    </div>
  </div>

  <div class="topbarActions" style="margin-left:auto;display:flex;align-items:center;gap:8px">
    <button
      id="btnOpenTutorial"
      class="btn ghost small"
      type="button"
      title="Abrir o tutorial de triagem e categorias"
      on:click={openArticleTutorial}
    >
      📖 Tutorial
    </button>
  </div>
</header>
