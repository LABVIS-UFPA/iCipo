<script>
  import { dashboardIntroRequiredStore, dismissIntroModal } from '../dashboardStore.js';

  function handleBackToProjects() {
    window.location.href = '../projects/projects.html';
  }

  function handleContinue() {
    dismissIntroModal();
  }
</script>

{#if $dashboardIntroRequiredStore}
  <div
    id="dashboardIntroModal"
    class="dashboardIntroModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dashboardIntroTitle"
    aria-describedby="dashboardIntroDescription"
  >
    <div class="dashboardIntroCard">
      <div class="dashboardIntroEyebrow">Tutorial · Etapa 1 de 4</div>
      <div class="dashboardIntroIcon" aria-hidden="true">⌂</div>
      <h2 id="dashboardIntroTitle">Bem-vindo ao dashboard</h2>
      <p id="dashboardIntroDescription">
        Aqui você acompanha o andamento do projeto, organiza as etapas da
        revisão e consulta os artigos marcados durante a pesquisa.
      </p>

      <div
        class="dashboardIntroFeatures"
        aria-label="Recursos principais do dashboard"
      >
        <div>
          <strong>Fases</strong>
          <span>Estruturam as etapas sequenciais da revisão (ex.: Títulos/Resumos e Leitura Completa).</span>
        </div>
        <div>
          <strong>Categorias Padrão & Personalizadas</strong>
          <span>Utilize as categorias padrão (<b>Incluir</b>, <b>Excluir</b> e <b>Pendente</b>) ou crie categorias personalizadas vinculadas a qualquer uma das três métricas.</span>
        </div>
        <div>
          <strong>Visão Geral & Triagem</strong>
          <span>Acesse artigos dentro de cada fase e acompanhe a evolução consolidada dos estudos.</span>
        </div>
      </div>

      <div class="dashboardIntroNextStep">
        <strong>Primeiro passo</strong>
        <span>Crie a primeira fase para definir como os artigos serão avaliados.</span>
      </div>

      <div class="dashboardIntroActions">
        <button
          id="btnDashboardIntroProjects"
          type="button"
          class="btn ghost"
          on:click={handleBackToProjects}
        >
          Voltar aos projetos
        </button>
        <button
          id="btnContinueDashboardIntro"
          type="button"
          class="btn dashboardIntroPrimary"
          on:click={handleContinue}
        >
          Começar
        </button>
      </div>
    </div>
  </div>
{/if}
