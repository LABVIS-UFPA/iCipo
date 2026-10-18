<script>
  import { onMount, onDestroy } from "svelte";
  import "../../tokens.css";
  import "../dashboard.css";
  import Sidebar from "./components/Sidebar.svelte";
  import Topbar from "./components/Topbar.svelte";
  import TutorialDropdownCard from "./components/TutorialDropdownCard.svelte";
  import PhasesView from "./views/PhasesView.svelte";
  import CategoriesView from "./views/CategoriesView.svelte";
  import PaperHistoryModal from "./components/PaperHistoryModal.svelte";
  import PaperBulkCategoryModal from "./components/PaperBulkCategoryModal.svelte";
  import CategoryMigrationModal from "./components/CategoryMigrationModal.svelte";
  import CategoryTransferModal from "./components/CategoryTransferModal.svelte";
  import CategoryPanel from "./components/CategoryPanel.svelte";
  import PhasePanel from "./components/PhasePanel.svelte";
  import PhaseArchivePanel from "./components/PhaseArchivePanel.svelte";
  import DropNoticeCard from "./components/DropNoticeCard.svelte";
  import DropConfirmCard from "./components/DropConfirmCard.svelte";
  import {
    activeViewStore,
    accessStateStore,
    dashboardIntroRequiredStore,
    phaseCreationRequiredStore,
    categoryCreationRequiredStore,
    isPhasePanelOpenStore,
    isCategoryPanelOpenStore,
    expandedCompletedPhaseStore,
    projectStore,
    activePhaseLabelStore,
    loadDashboardState,
    bindStorageSync,
    unbindStorageSync,
    setActiveView,
    DASHBOARD_VIEWS,
    showNotice
  } from "./dashboardStore.js";

  $: allPhases = Array.isArray($projectStore?.phases) ? $projectStore.phases : [];
  $: activeArchiveLabel = $expandedCompletedPhaseStore;
  $: archivePhaseIndex = allPhases.findIndex((p) => p.label === activeArchiveLabel);
  $: archivePhase = archivePhaseIndex >= 0 ? allPhases[archivePhaseIndex] : null;
  $: isArchivePhaseActive = archivePhase ? ($activePhaseLabelStore === archivePhase.label) : false;

  $: isAnySidePanelOpen = Boolean(
    $isPhasePanelOpenStore ||
    $isCategoryPanelOpenStore ||
    Boolean($expandedCompletedPhaseStore)
  );

  function handleHashChange() {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace('#', '').toLowerCase().trim();
    if (DASHBOARD_VIEWS.includes(hash)) {
      setActiveView(hash);
    }
  }

  let originalAlert = null;

  onMount(async () => {
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", handleHashChange);
      originalAlert = window.alert;
      window.alert = (message) => {
        showNotice(message, 'warning');
      };
    }
    bindStorageSync();
    await loadDashboardState();
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hashchange", handleHashChange);
      if (originalAlert) {
        window.alert = originalAlert;
      }
    }
    unbindStorageSync();
  });
</script>

<svelte:body
  class:dashboardIntroRequired={$dashboardIntroRequiredStore}
  class:phaseCreationRequired={$phaseCreationRequiredStore}
  class:categoryCreationRequired={$categoryCreationRequiredStore}
  class:hasSidePanelOpen={isAnySidePanelOpen}
/>

<div class="app" class:hasSidePanelOpen={isAnySidePanelOpen}>
  <div class="appContentShiftWrapper">
    <Sidebar />

    <main class="main">
      <Topbar />

      <TutorialDropdownCard />

      <div class="viewContainer" class:hidden={$activeViewStore !== 'phases'}>
        <PhasesView />
      </div>

      <div class="viewContainer" class:hidden={$activeViewStore !== 'categories'}>
        <CategoriesView />
      </div>
    </main>
  </div>

  <!-- Abas / Gavetas Laterais com animação de arrastar todo o conteúdo da tela -->
  <CategoryPanel />
  <PhasePanel />
  {#if archivePhase}
    <PhaseArchivePanel
      phase={archivePhase}
      index={archivePhaseIndex}
      totalPhases={allPhases.length}
      isActivePhase={isArchivePhaseActive}
    />
  {/if}

  <!-- Modais Globais (renderizados fora do appContentShiftWrapper para sobrepor gavetas laterais) -->
  <PaperHistoryModal />
  <PaperBulkCategoryModal />
  <CategoryMigrationModal />
  <CategoryTransferModal />

  <!-- Card flutuante de avisos (desce de cima para baixo com z-index máximo) -->
  <DropNoticeCard />
  <DropConfirmCard />

  <div
    id="noActiveProjectNotice"
    class="floatingNotice"
    class:hidden={$accessStateStore !== 'project-required'}
    role="status"
    aria-live="polite"
  >
    <div class="title">Nenhum projeto ativo</div>
    <div>
      Abra um projeto para carregar o dashboard. <a
        href="../projects/projects.html">Ir para projetos</a
      >.
    </div>
  </div>

  <div
    id="serverOfflineNotice"
    class="floatingNotice danger"
    class:hidden={$accessStateStore !== 'offline'}
    role="status"
    aria-live="polite"
  >
    <div class="title">Sem conexão com o servidor</div>
    <div>
      Certifique-se de que o servidor está rodando ou verifique a conexão em <a
        href="../options/options.html">configurações</a
      >.
    </div>
  </div>
</div>

<style>
  .viewContainer {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .viewContainer.hidden {
    display: none !important;
  }

  .viewContainer:not(.hidden) {
    animation: viewContainerSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes viewContainerSlideIn {
    from {
      opacity: 0;
      transform: translateX(18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
