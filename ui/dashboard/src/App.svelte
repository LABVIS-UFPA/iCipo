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
  import PapersView from "./views/PapersView.svelte";
  import PaperHistoryModal from "./components/PaperHistoryModal.svelte";
  import PaperBulkCategoryModal from "./components/PaperBulkCategoryModal.svelte";
  import ArticleTutorialPanel from "./components/ArticleTutorialPanel.svelte";
  import {
    activeViewStore,
    accessStateStore,
    loadDashboardState,
    bindStorageSync,
    unbindStorageSync
  } from "./dashboardStore.js";

  onMount(async () => {
    bindStorageSync();
    await loadDashboardState();
  });

  onDestroy(() => {
    unbindStorageSync();
  });
</script>

<div class="app">
  <Sidebar />

  <main class="main">
    <Topbar />

    <IntroModal />

    <div class:hidden={$activeViewStore !== 'overview'}>
      <OverviewView />
    </div>

    <div class:hidden={$activeViewStore !== 'papers'}>
      <PapersView />
    </div>

    <div class:hidden={$activeViewStore !== 'categories'}>
      <CategoriesView />
    </div>

    <div class:hidden={$activeViewStore !== 'phases'}>
      <PhasesView />
    </div>

    <PaperHistoryModal />

    <PaperBulkCategoryModal />

    <ArticleTutorialPanel />
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
