<script>
  import { onMount, onDestroy } from "svelte";
  import "../../tokens.css";
  import "../dashboard.css";
  import Sidebar from "./components/Sidebar.svelte";
  import Topbar from "./components/Topbar.svelte";
  import IntroModal from "./components/IntroModal.svelte";
  import OverviewView from "./views/OverviewView.svelte";
  import PhasesView from "./views/PhasesView.svelte";
  import CategoriesView from "./views/CategoriesView.svelte";
  import PaperHistoryModal from "./components/PaperHistoryModal.svelte";
  import PaperBulkCategoryModal from "./components/PaperBulkCategoryModal.svelte";
  import ArticleTutorialPanel from "./components/ArticleTutorialPanel.svelte";
  import CategoryMigrationModal from "./components/CategoryMigrationModal.svelte";
  import {
    activeViewStore,
    accessStateStore,
    dashboardIntroRequiredStore,
    phaseCreationRequiredStore,
    categoryCreationRequiredStore,
    articleTutorialRequiredStore,
    loadDashboardState,
    bindStorageSync,
    unbindStorageSync,
    setActiveView,
    DASHBOARD_VIEWS
  } from "./dashboardStore.js";

  function handleHashChange() {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace('#', '').toLowerCase().trim();
    if (DASHBOARD_VIEWS.includes(hash)) {
      setActiveView(hash);
    }
  }

  onMount(async () => {
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", handleHashChange);
    }
    bindStorageSync();
    await loadDashboardState();
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hashchange", handleHashChange);
    }
    unbindStorageSync();
  });
</script>

<svelte:body
  class:dashboardIntroRequired={$dashboardIntroRequiredStore}
  class:phaseCreationRequired={$phaseCreationRequiredStore}
  class:categoryCreationRequired={$categoryCreationRequiredStore}
  class:articleTutorialRequired={$articleTutorialRequiredStore}
/>

<div class="app">
  <Sidebar />

  <main class="main">
    <Topbar />

    <IntroModal />

    <div class="viewContainer" class:hidden={$activeViewStore !== 'overview'}>
      <OverviewView />
    </div>


    <div class="viewContainer" class:hidden={$activeViewStore !== 'categories'}>
      <CategoriesView />
    </div>

    <div class="viewContainer" class:hidden={$activeViewStore !== 'phases'}>
      <PhasesView />
    </div>

    <PaperHistoryModal />

    <PaperBulkCategoryModal />

    <ArticleTutorialPanel />

    <CategoryMigrationModal />
  </main>

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
</style>
