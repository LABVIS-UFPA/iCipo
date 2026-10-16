<script>
  import { projectStore, serverStatusStore } from '../dashboardStore.js';
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
</header>
