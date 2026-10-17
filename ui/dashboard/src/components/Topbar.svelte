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
      <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green); margin-right: 2px;" aria-hidden="true">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
        <path d="M6 6h10M6 10h10M6 14h6"/>
      </svg>
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
      <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
      <span>Tutorial</span>
    </button>
  </div>
</header>
