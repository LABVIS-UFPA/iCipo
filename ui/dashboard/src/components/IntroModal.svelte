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
          <span>Estruturam as etapas sequenciais da revisão. As categorias padrão vêm <b>ativadas por padrão</b> em todas as fases para triagem imediata.</span>
        </div>
        <div>
          <strong>Categorias Padrão & Personalizadas</strong>
          <span>As 3 categorias padrão (<b>Incluir</b>, <b>Excluir</b> e <b>Pendente</b>) já vêm ativadas por padrão em todas as fases. Você também pode criar categorias personalizadas adicionais vinculadas a qualquer uma das três métricas.</span>
        </div>
        <div>
          <strong>Visão Geral & Triagem</strong>
          <span>Acesse artigos dentro de cada fase e acompanhe a evolução consolidada dos estudos.</span>
        </div>
      </div>

      <div class="dashboardIntroNextStep">
        <strong>Primeiro passo</strong>
        <span>Crie a primeira fase para iniciar. As categorias padrão já estarão ativadas por padrão para você começar a triagem.</span>
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
