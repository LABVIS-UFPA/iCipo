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
          <span>Estruturam o processo de seleção e análise.</span>
        </div>
        <div>
          <strong>Categorias</strong>
          <span>Classificam os artigos em cada etapa.</span>
        </div>
        <div>
          <strong>Visão Geral</strong>
          <span>Resume a distribuição e a evolução dos estudos.</span>
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
