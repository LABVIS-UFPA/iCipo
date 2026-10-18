<script>
  import {
    projectStore,
    tutorialStageStore,
    isTutorialOpenStore,
    openCategoryPanel,
    openPhasePanel,
    advanceTutorialToCategories,
    advanceTutorialToPhases,
    advanceTutorialToScholar,
    completeTutorialAction,
    closeGuidedTutorial,
    setActiveView,
  } from "../dashboardStore.js";
  import { isDefaultCategory } from "../dashboardHelpers.js";

  $: project = $projectStore || {};
  $: stage = $tutorialStageStore || "overview";
  $: isOpen = $isTutorialOpenStore;
  $: isCompleted = stage === "complete";

  // State checks for requirements
  $: categories = Array.isArray(project.categories) ? project.categories : [];
  $: customCategories = categories.filter((c) => !isDefaultCategory(c.label));
  $: hasCustomCategory = customCategories.length > 0;
  $: customCategoryNames = customCategories
    .map((c) => c.title || c.label)
    .join(", ");

  $: phases = Array.isArray(project.phases) ? project.phases : [];
  $: hasPhases = phases.length > 0;
  $: firstPhase = phases[0] || null;

  // Controlled step for completed/review mode
  let selectedReviewStep = null;
  $: activeStep =
    isCompleted && selectedReviewStep
      ? selectedReviewStep
      : stage === "complete"
        ? "overview"
        : stage;

  let isClosing = false;

  function handleSelectStep(step) {
    if (isCompleted) {
      selectedReviewStep = step;
      if (step !== "scholar" && step !== "overview") {
        setActiveView(step);
      }
    }
  }

  function handleAdvanceCategories() {
    advanceTutorialToCategories();
    selectedReviewStep = "categories";
  }

  function handleOpenCategoryDrawer() {
    openCategoryPanel(null);
  }

  function handleAdvancePhases() {
    advanceTutorialToPhases();
    selectedReviewStep = "phases";
  }

  function handleOpenPhaseDrawer() {
    openPhasePanel(null);
  }

  function handleAdvanceScholar() {
    advanceTutorialToScholar();
    selectedReviewStep = "scholar";
  }

  function handleCompleteTutorial() {
    if (!hasPhases) return;
    triggerCloseAnimation(() => {
      completeTutorialAction();
      selectedReviewStep = null;
    });
  }

  function handleCloseCard() {
    if (!isCompleted) return;
    triggerCloseAnimation(() => {
      closeGuidedTutorial();
      selectedReviewStep = null;
    });
  }

  function triggerCloseAnimation(callback) {
    isClosing = true;
    setTimeout(() => {
      isClosing = false;
      if (typeof callback === "function") callback();
    }, 320);
  }
</script>

{#if isOpen}
  <!-- Backdrop sutil para foco visual -->
  <div
    class="tutorialOverlayBackdrop"
    class:closing={isClosing}
    on:click={isCompleted ? handleCloseCard : undefined}
    aria-hidden="true"
  ></div>

  <!-- Card dropdown com animação de descida -->
  <aside
    id="tutorialDropdownCard"
    class="tutorialDropdownCard"
    class:closing={isClosing}
    role="region"
    aria-labelledby="tutorialCardHeading"
  >
    <!-- Barra superior do card: Stepper de progresso & Controle -->
    <div class="tutorialHeaderBar">
      <div class="tutorialStepper">
        <button
          type="button"
          class="tutorialStepTab"
          class:active={activeStep === "overview"}
          class:done={isCompleted ||
            stage === "categories" ||
            stage === "phases" ||
            stage === "scholar"}
          on:click={() => handleSelectStep("overview")}
          disabled={!isCompleted}
        >
          <span class="stepBadgeNumber">1</span>
          <span class="stepBadgeLabel">Visão Geral</span>
          {#if isCompleted || stage === "categories" || stage === "phases" || stage === "scholar"}
            <span class="stepCheckmark" aria-hidden="true">✓</span>
          {/if}
        </button>

        <span class="stepperDivider" aria-hidden="true">➔</span>

        <button
          type="button"
          class="tutorialStepTab"
          class:active={activeStep === "categories"}
          class:done={isCompleted || stage === "phases" || stage === "scholar" || hasCustomCategory}
          on:click={() => handleSelectStep("categories")}
          disabled={!isCompleted}
        >
          <span class="stepBadgeNumber">2</span>
          <span class="stepBadgeLabel">Categorias</span>
          {#if isCompleted || stage === "phases" || stage === "scholar" || hasCustomCategory}
            <span class="stepCheckmark" aria-hidden="true">✓</span>
          {/if}
        </button>

        <span class="stepperDivider" aria-hidden="true">➔</span>

        <button
          type="button"
          class="tutorialStepTab"
          class:active={activeStep === "phases"}
          class:done={isCompleted || stage === "scholar" || hasPhases}
          class:attention={activeStep === "phases" && !hasPhases}
          on:click={() => handleSelectStep("phases")}
          disabled={!isCompleted}
        >
          <span class="stepBadgeNumber">3</span>
          <span class="stepBadgeLabel">Fases</span>
          {#if hasPhases || stage === "scholar" || isCompleted}
            <span class="stepCheckmark" aria-hidden="true">✓</span>
          {:else if activeStep === "phases"}
            <span class="stepRequiredBadge">Obrigatório</span>
          {/if}
        </button>

        <span class="stepperDivider" aria-hidden="true">➔</span>

        <button
          type="button"
          class="tutorialStepTab"
          class:active={activeStep === "scholar"}
          class:done={isCompleted}
          on:click={() => handleSelectStep("scholar")}
          disabled={!isCompleted}
        >
          <span class="stepBadgeNumber">4</span>
          <span class="stepBadgeLabel">Google Scholar</span>
          {#if isCompleted}
            <span class="stepCheckmark" aria-hidden="true">✓</span>
          {/if}
        </button>
      </div>

      <div class="tutorialHeaderControls">
        {#if isCompleted}
          <span class="tutorialCompletePill">✓ Tutorial Concluído</span>
          <button
            type="button"
            class="tutorialCloseBtn"
            title="Fechar card do tutorial"
            aria-label="Fechar tutorial"
            on:click={handleCloseCard}
          >
            ✕
          </button>
        {:else}
          <span class="tutorialMandatoryPill">Configuração Inicial Guiada</span>
        {/if}
      </div>
    </div>

    <!-- Conteúdo Dinâmico por Etapa -->
    <div class="tutorialBodyContent">
      {#if activeStep === "overview"}
        <!-- ETAPA 1: VISÃO DA FERRAMENTA & VISÃO GERAL -->
        <div class="tutorialStepPane" id="tutorialPaneOverview">
          <div class="tutorialStepMeta">
            <span class="tutorialStepTag"
              >Etapa 1 de 4 · Apresentação do Sistema</span
            >
            <span class="tutorialToolBrand">🌿 iCipó (LABVIS-UFPA)</span>
          </div>

          <h2 id="tutorialCardHeading" class="tutorialStepTitle">
            Para que serve o iCipó
          </h2>

          <div class="tutorialTextHighlight">
            <p>
              O <strong>iCipó</strong> é um assistente acadêmico avançado
              projetado para apoiar pesquisadores durante a condução de
              <strong>Revisões Sistemáticas da Literatura (RSL)</strong>
              e procedimentos rigorosos de <strong>Snowballing</strong> (<em
                >backward</em
              >
              e <em>forward</em>, segundo as diretrizes de Wohlin).
            </p>
            <p>
              Integrado diretamente ao navegador e ao <strong
                >Google Scholar</strong
              >, o iCipó permite triar, anotar e categorizar artigos sem a
              necessidade de planilhas manuais dispersas, eliminando
              redundâncias e mantendo a rastreabilidade metodológica integral.
            </p>
          </div>

          <!-- CARD DE AVISO / PREPARAÇÃO DAS ETAPAS ESSENCIAIS -->
          <div class="tutorialAlertBox info tutorialPrepBox" role="status">
            <div class="alertBoxIcon">⚙️</div>
            <div class="alertBoxContent">
              <div class="scholarBadgeRow" style="margin-bottom: 6px;">
                <span class="scholarPillBadge">Fluxo Prático de Coleta</span>
                <span class="scholarLiveBadge">● Google Scholar + iCipó</span>
              </div>
              <strong style="color: #0f172a; font-size: 14px;">Configurações essenciais antes de iniciar sua pesquisa</strong>
              <p style="margin: 6px 0 0 0; color: #334155; font-size: 13px; line-height: 1.55;">
                Mas antes de começar sua pesquisa, precisamos configurar algumas coisas essenciais: primeiro revisaremos as <b>Categorias</b> e em seguida criaremos as <b>Fases</b> do seu estudo.
              </p>
              <p style="margin: 6px 0 0 0; color: #475569; font-size: 12.5px;">
                Ao concluir essas etapas essenciais, você verá o guia completo de como marcar artigos diretamente no Google Acadêmico com o botão direito do mouse!
              </p>
            </div>
          </div>

          <!-- Próximo Passo & Ações -->
          <div class="tutorialFooterActions" style="justify-content: flex-end;">
            <button
              id="btnTutorialAdvanceToCategories"
              type="button"
              class="btn tutorialBtnPrimary"
              on:click={handleAdvanceCategories}
            >
              <span>Avançar para Categorias ➔</span>
            </button>
          </div>
        </div>
      {:else if activeStep === "categories"}
        <!-- ETAPA 2: CATEGORIAS (PADRÃO DISPONÍVEIS & PERSONALIZADAS OPCIONAIS) -->
        <div class="tutorialStepPane" id="tutorialPaneCategories">
          <div class="tutorialStepMeta">
            <span class="tutorialStepTag"
              >Etapa 2 de 4 · Categorização Semântica</span
            >
            <span class="tutorialRequirementStatus ready"
              >✓ Categorias prontas</span
            >
          </div>

          <h2 id="tutorialCardHeading" class="tutorialStepTitle">
            Categorias da Pesquisa & Critérios de Elegibilidade
          </h2>

          <div class="tutorialTextHighlight">
            <p>
              As <strong>categorias</strong> definem os motivos e os desfechos
              científicos de cada artigo triado. O iCipó já inclui
              automaticamente <strong>3 categorias padrão</strong> (<b
                >Incluir</b
              >, <b>Excluir</b> e <b>Pendente</b>) ativas em todas as etapas da
              revisão.
            </p>
            <p>
              Você pode <strong
                >criar categorias personalizadas se quiser</strong
              >
              para enriquecer os critérios específicos da sua pesquisa (ex.:
              metodologia, intervenção ou motivo de descarte),
              <strong>ou pode usar somente as categorias padrão</strong>.
            </p>
          </div>

          <!-- Caixa informativa sobre Categorias -->
          {#if !hasCustomCategory}
            <div
              class="tutorialAlertBox info"
              role="status"
              style="border-color: rgba(40, 120, 232, 0.28); background: rgba(40, 120, 232, 0.05);"
            >
              <div class="alertBoxIcon">🏷️</div>
              <div class="alertBoxContent">
                <strong>Categorias padrão ativas no seu projeto</strong>
                <p>
                  As categorias <b>Incluir</b>, <b>Excluir</b> e <b>Pendente</b>
                  já estão disponíveis e vinculadas. Você pode criar categorias personalizadas
                  adicionais para os seus próprios critérios, ou prosseguir normalmente
                  utilizando somente as padrão.
                </p>
                <div class="alertBoxActions">
                  <button
                    id="btnTutorialCreateCustomCategory"
                    type="button"
                    class="btn tutorialBtnAction"
                    on:click={handleOpenCategoryDrawer}
                  >
                    <svg
                      class="academicSvg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>+ Criar Categoria Personalizada (Opcional)</span>
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <div class="tutorialAlertBox success" role="status">
              <div class="alertBoxIcon">✅</div>
              <div class="alertBoxContent">
                <strong>Categoria(s) personalizada(s) configurada(s)</strong>
                <p>
                  Você configurou categoria(s) personalizada(s) no estudo: <b
                    >{customCategoryNames}</b
                  >. Elas já estão disponíveis para uso e você pode criar outras
                  se desejar.
                </p>
                <div class="alertBoxActions">
                  <button
                    type="button"
                    class="btn ghost small"
                    on:click={handleOpenCategoryDrawer}
                  >
                    + Criar outra categoria
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Próximo Passo & Ações -->
          <div class="tutorialFooterActions" style="justify-content: flex-end;">
            <button
              id="btnTutorialAdvanceToPhases"
              type="button"
              class="btn tutorialBtnPrimary"
              title="Avançar para as Fases do Estudo"
              on:click={handleAdvancePhases}
            >
              <span>Avançar para Fases ➔</span>
            </button>
          </div>
        </div>
      {:else if activeStep === "phases"}
        <!-- ETAPA 3: FASES & OBRIGA A CRIAR A PRIMEIRA FASE -->
        <div class="tutorialStepPane" id="tutorialPanePhases">
          <div class="tutorialStepMeta">
            <span class="tutorialStepTag"
              >Etapa 3 de 4 · Esteira Metodológica</span
            >
            {#if hasPhases}
              <span class="tutorialRequirementStatus ready"
                >✓ Requisito atendido</span
              >
            {:else}
              <span class="tutorialRequirementStatus pending"
                >⚠️ Criação Obrigatória</span
              >
            {/if}
          </div>

          <h2 id="tutorialCardHeading" class="tutorialStepTitle">
            Fases do Estudo & Herança Científica
          </h2>

          <div class="tutorialTextHighlight">
            <p>
              As <strong>Fases</strong> estruturam a progressão sequencial da
              sua Revisão Sistemática (ex.:
              <em>1. Triagem de Título e Resumo</em>
              ➔ <em>2. Leitura Completa</em> ➔ <em>3. Snowballing</em>).
            </p>
            <p>
              No iCipó, a progressão obedece à regra de <strong
                >herança protegida</strong
              >: artigos aceitos com desfecho de <b>Inclusão</b> na fase ativa
              avançam automaticamente para a próxima fase. Para que a extensão
              no Google Scholar saiba para onde enviar seus estudos marcados,
              <strong>é obrigatório criar a primeira fase do estudo</strong>.
            </p>
          </div>

          <!-- Caixa de Status da Obrigação -->
          {#if !hasPhases}
            <div class="tutorialAlertBox warning" role="alert">
              <div class="alertBoxIcon">⚠️</div>
              <div class="alertBoxContent">
                <strong
                  >Ação Obrigatória: Crie a primeira fase da pesquisa</strong
                >
                <p>
                  O projeto ainda não possui nenhuma fase cadastrada. Clique no
                  botão abaixo para definir o título (ex.: <em
                    >"Triagem Inicial de Título e Resumo"</em
                  >), descrição e categorias ativas.
                </p>
                <div class="alertBoxActions">
                  <button
                    id="btnTutorialCreateFirstPhase"
                    type="button"
                    class="btn tutorialBtnAction"
                    on:click={handleOpenPhaseDrawer}
                  >
                    <svg
                      class="academicSvg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>+ Criar Primeira Fase</span>
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <div class="tutorialAlertBox success" role="status">
              <div class="alertBoxIcon">🎉</div>
              <div class="alertBoxContent">
                <strong
                  >Primeira fase configurada com sucesso!</strong
                >
                <p>
                  Sua esteira metodológica já possui uma etapa ativa. Agora vamos para a próxima etapa aprender como marcar os artigos no Google Scholar!
                </p>
                <div class="alertBoxActions">
                  <button
                    type="button"
                    class="btn ghost small"
                    on:click={handleOpenPhaseDrawer}
                  >
                    + Criar outra fase
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Próximo Passo & Ações -->
          <div class="tutorialFooterActions" style="justify-content: flex-end;">
            {#if !hasPhases}
              <div class="nextStepHint">
                <strong style="color: #b45309;">Configuração pendente</strong>
                <span
                  >Cadastre a primeira fase para avançar para as instruções de coleta no Scholar.</span
                >
              </div>
            {/if}

            <button
              id="btnTutorialAdvanceToScholar"
              type="button"
              class="btn tutorialBtnPrimary"
              class:disabled={!hasPhases}
              disabled={!hasPhases}
              title={!hasPhases
                ? "Crie a primeira fase para avançar"
                : "Avançar para as instruções do Google Scholar"}
              on:click={handleAdvanceScholar}
            >
              <span>Avançar para Como Coletar no Scholar ➔</span>
            </button>
          </div>
        </div>
      {:else if activeStep === "scholar"}
        <!-- ETAPA 4: COMO COLETAR NO GOOGLE SCHOLAR -->
        <div class="tutorialStepPane" id="tutorialPaneScholar">
          <div class="tutorialStepMeta">
            <span class="tutorialStepTag"
              >Etapa 4 de 4 · Coleta & Triagem no Google Scholar</span
            >
            <span class="tutorialRequirementStatus ready"
              >✓ Tudo pronto para a pesquisa</span
            >
          </div>

          <h2 id="tutorialCardHeading" class="tutorialStepTitle">
            Como marcar artigos no Google Acadêmico (Scholar)
          </h2>

          <div class="tutorialTextHighlight">
            <p>
              A triagem é realizada durante suas buscas no <strong>Google Scholar</strong> através do menu do mouse:
            </p>
          </div>

          <!-- FLUXO VISUAL MODERNO: MARCAÇÃO NO GOOGLE SCHOLAR (4 PASSOS) -->
          <div class="scholarHeroWorkflow">
            <div class="scholarHeroHeader">
              <div class="scholarIconWrapper">
                <svg class="academicSvg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <div class="scholarHeroTitleWrap">
                <div class="scholarBadgeRow">
                  <span class="scholarPillBadge">Fluxo Prático de Coleta</span>
                  <span class="scholarLiveBadge">● Google Scholar + iCipó</span>
                </div>
                <h3 class="scholarHeroTitle">Como marcar artigos no Google Acadêmico (Scholar)</h3>
                <p class="scholarHeroSubtitle">
                  A triagem é realizada durante suas buscas no Google Scholar através do menu do mouse:
                </p>
              </div>
            </div>

            <!-- Grid com 4 Passos Modernos e Conectores Elegantes -->
            <div class="scholarCardsFlow">
              <!-- PASSO 1 -->
              <div class="scholarCardStep">
                <div class="cardStepHeader">
                  <span class="cardStepNumber">1</span>
                  <span class="cardStepTag">Pesquisa</span>
                </div>
                <div class="cardStepIconRow">
                  <div class="stepVisualIcon blue">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                </div>
                <h4 class="cardStepTitle">Acesse o Google Scholar</h4>
                <p class="cardStepDesc">
                  Pesquise os artigos acadêmicos normalmente no navegador.
                </p>
                <div class="cardStepFooter">
                  <span class="stepMetaPill">scholar.google.com</span>
                </div>
              </div>

              <!-- CONECTOR 1 -->
              <div class="scholarFlowConnector" aria-hidden="true">
                <div class="connectorCircle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </div>

              <!-- PASSO 2 (DESTAQUE MOUSE) -->
              <div class="scholarCardStep cardStepFeatured">
                <div class="cardStepHeader">
                  <span class="cardStepNumber highlight">2</span>
                  <span class="cardStepTag featured">Ação do Mouse</span>
                </div>
                <div class="cardStepIconRow">
                  <div class="stepVisualIcon green">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="7"></rect>
                      <path d="M12 2v6"></path>
                      <path d="M12 2h7" stroke="#16a34a" stroke-width="2.5"></path>
                    </svg>
                  </div>
                </div>
                <h4 class="cardStepTitle">Botão Direito no Link ➔ iCipó</h4>
                <p class="cardStepDesc">
                  Clique com o <b>botão direito do mouse</b> sobre o link do artigo e selecione <b>iCipó</b>.
                </p>
                <div class="miniContextMock">
                  <span class="miniContextItem">🖱️ Botão direito no link</span>
                  <span class="miniContextSub">➔ <b>iCipó</b> ▶</span>
                </div>
              </div>

              <!-- CONECTOR 2 -->
              <div class="scholarFlowConnector" aria-hidden="true">
                <div class="connectorCircle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </div>

              <!-- PASSO 3 -->
              <div class="scholarCardStep">
                <div class="cardStepHeader">
                  <span class="cardStepNumber">3</span>
                  <span class="cardStepTag">Classificação</span>
                </div>
                <div class="cardStepIconRow">
                  <div class="stepVisualIcon purple">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                      <line x1="7" y1="7" x2="7.01" y2="7"></line>
                    </svg>
                  </div>
                </div>
                <h4 class="cardStepTitle">Escolha a Categoria</h4>
                <p class="cardStepDesc">
                  Clique na categoria desejada. O artigo é salvo no Dashboard automaticamente!
                </p>
                <div class="miniCategoryPills">
                  <span class="miniCatPill include">✓ Incluir</span>
                  <span class="miniCatPill exclude">✕ Excluir</span>
                  <span class="miniCatPill pending">⏳ Pendente</span>
                </div>
              </div>

              <!-- CONECTOR 3 -->
              <div class="scholarFlowConnector" aria-hidden="true">
                <div class="connectorCircle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </div>

              <!-- PASSO 4: PRONTO PARA REVISÃO -->
              <div class="scholarCardStep cardStepSuccess">
                <div class="cardStepHeader">
                  <span class="cardStepNumber success">4</span>
                  <span class="cardStepTag success">Revisão</span>
                </div>
                <div class="cardStepIconRow">
                  <div class="stepVisualIcon emerald">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                </div>
                <h4 class="cardStepTitle">Inicie sua Revisão</h4>
                <p class="cardStepDesc">
                  Já está tudo pronto para você ir ao <b>Google Scholar</b> marcar os artigos e iniciar sua revisão!
                </p>
                <div class="miniReadyBanner">
                  <span class="miniReadyPulse" aria-hidden="true"></span>
                  <span class="miniReadyText">Pronto para triagem!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Próximo Passo & Ações Finais -->
          <div class="tutorialFooterActions" style="justify-content: flex-end;">
            <button
              id="btnTutorialComplete"
              type="button"
              class="btn tutorialBtnPrimary tutorialBtnSuccess"
              title="Concluir tutorial e iniciar o projeto"
              on:click={handleCompleteTutorial}
            >
              <span>Concluir Tutorial e Iniciar Revisão ✓</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  /* ==========================================================================
     Tutorial Dropdown Card — Descida suave de cima para baixo
     ========================================================================== */
  .tutorialOverlayBackdrop {
    position: fixed;
    inset: 0;
    z-index: 140;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(5px);
    opacity: 1;
    transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tutorialOverlayBackdrop.closing {
    opacity: 0;
    pointer-events: none;
  }

  .tutorialDropdownCard {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    z-index: 150;
    width: min(840px, calc(100vw - 32px));
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    background: #ffffff;
    border: 1.5px solid rgba(34, 197, 94, 0.3);
    border-radius: 20px;
    box-shadow:
      0 24px 60px -12px rgba(15, 23, 42, 0.35),
      0 0 0 1px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    animation: tutorialDropIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .tutorialDropdownCard.closing {
    animation: tutorialDropOut 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes tutorialDropIn {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(-120%);
    }
    65% {
      opacity: 1;
      transform: translateX(-50%) translateY(8px);
    }
    85% {
      transform: translateX(-50%) translateY(-3px);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes tutorialDropOut {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-120%);
    }
  }

  /* Barra de cabeçalho e Stepper */
  .tutorialHeaderBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 22px;
    background: linear-gradient(
      135deg,
      rgba(240, 253, 244, 0.8),
      rgba(248, 250, 252, 0.95)
    );
    border-bottom: 1px solid rgba(226, 232, 240, 0.9);
    border-top-left-radius: 19px;
    border-top-right-radius: 19px;
    flex-wrap: wrap;
  }

  .tutorialStepper {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tutorialStepTab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 30px;
    font-size: 12.5px;
    font-weight: 700;
    color: #475569;
    cursor: default;
    transition: all 0.2s ease;
  }

  .tutorialStepTab:not(:disabled) {
    cursor: pointer;
  }

  .tutorialStepTab:not(:disabled):hover {
    border-color: #22c55e;
    color: #15803d;
  }

  .tutorialStepTab.active {
    background: #15803d;
    border-color: #15803d;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(21, 128, 61, 0.25);
  }

  .tutorialStepTab.done:not(.active) {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.35);
    color: #166534;
  }

  .tutorialStepTab.attention:not(.active) {
    border-color: #f59e0b;
    color: #b45309;
    background: rgba(245, 158, 11, 0.08);
  }

  .stepBadgeNumber {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 800;
    background: rgba(0, 0, 0, 0.08);
  }

  .tutorialStepTab.active .stepBadgeNumber {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
  }

  .stepCheckmark {
    font-weight: 900;
    color: #16a34a;
  }

  .tutorialStepTab.active .stepCheckmark {
    color: #ffffff;
  }

  .stepRequiredBadge {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    padding: 2px 6px;
    background: #fef3c7;
    color: #b45309;
    border-radius: 12px;
  }

  .stepperDivider {
    color: #94a3b8;
    font-size: 11px;
  }

  .tutorialHeaderControls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tutorialMandatoryPill {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    background: rgba(22, 101, 52, 0.1);
    color: #166534;
    border-radius: 20px;
    border: 1px solid rgba(22, 101, 52, 0.2);
  }

  .tutorialCompletePill {
    font-size: 11px;
    font-weight: 800;
    padding: 4px 10px;
    background: #dcfce7;
    color: #15803d;
    border-radius: 20px;
  }

  .tutorialCloseBtn {
    background: transparent;
    border: none;
    font-size: 16px;
    font-weight: 700;
    color: #64748b;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tutorialCloseBtn:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  /* Corpo do card */
  .tutorialBodyContent {
    padding: 24px 26px 22px;
    overflow-y: auto;
  }

  .tutorialStepMeta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .tutorialStepTag {
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #166534;
    background: rgba(34, 197, 94, 0.12);
    padding: 3px 9px;
    border-radius: 6px;
  }

  .tutorialToolBrand {
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
  }

  .tutorialRequirementStatus {
    font-size: 11.5px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 6px;
  }

  .tutorialRequirementStatus.pending {
    background: #fef3c7;
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .tutorialRequirementStatus.ready {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .tutorialStepTitle {
    margin: 0 0 14px 0;
    font-size: 21px;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.3;
  }

  .tutorialTextHighlight {
    font-size: 14px;
    line-height: 1.6;
    color: #334155;
    margin-bottom: 20px;
  }

  .tutorialTextHighlight p {
    margin: 0 0 10px 0;
  }

  .tutorialTextHighlight p:last-child {
    margin-bottom: 0;
  }

  /* ==========================================================================
     Fluxo Visual: Marcação no Google Scholar (Cards Interativos & Estilizados)
     ========================================================================== */
  .scholarHeroWorkflow {
    background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px 22px;
    margin-bottom: 24px;
    box-shadow: 0 4px 18px -4px rgba(15, 23, 42, 0.06);
    position: relative;
    overflow: hidden;
  }

  .scholarHeroWorkflow::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #2563eb, #16a34a, #9333ea);
  }

  .scholarHeroHeader {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 18px;
  }

  .scholarIconWrapper {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    color: #2563eb;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.15);
  }

  .scholarHeroTitleWrap {
    flex: 1;
    min-width: 0;
  }

  .scholarBadgeRow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .scholarPillBadge {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    background: #e0e7ff;
    color: #4338ca;
    border-radius: 6px;
  }

  .scholarLiveBadge {
    font-size: 11px;
    font-weight: 700;
    color: #15803d;
    background: #dcfce7;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .scholarHeroTitle {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 4px 0;
    line-height: 1.3;
  }

  .scholarHeroSubtitle {
    font-size: 13px;
    color: #475569;
    margin: 0;
    line-height: 1.5;
  }

  /* Grid com os 4 cards do fluxo */
  .scholarCardsFlow {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 8px;
    margin-top: 14px;
  }

  .scholarCardStep {
    flex: 1;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 15px 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
    position: relative;
  }

  .scholarCardStep:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
    border-color: #cbd5e1;
  }

  .scholarCardStep.cardStepFeatured {
    background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
    border: 1.5px solid #86efac;
    box-shadow: 0 4px 16px -2px rgba(34, 197, 94, 0.15);
  }

  .scholarCardStep.cardStepFeatured:hover {
    border-color: #22c55e;
    box-shadow: 0 8px 24px -4px rgba(34, 197, 94, 0.25);
  }

  .cardStepHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .cardStepNumber {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #f1f5f9;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
    display: grid;
    place-items: center;
  }

  .cardStepNumber.highlight {
    background: #16a34a;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(22, 163, 74, 0.35);
  }

  .cardStepTag {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
  }

  .cardStepTag.featured {
    color: #16a34a;
    font-weight: 800;
  }

  .cardStepIconRow {
    margin-bottom: 10px;
    display: flex;
    align-items: center;
  }

  .stepVisualIcon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: grid;
    place-items: center;
  }

  .stepVisualIcon.blue {
    background: #eff6ff;
    color: #2563eb;
  }

  .stepVisualIcon.green {
    background: #dcfce7;
    color: #16a34a;
  }

  .stepVisualIcon.purple {
    background: #f3e8ff;
    color: #9333ea;
  }

  .stepVisualIcon.emerald {
    background: #dcfce7;
    color: #16a34a;
  }

  .scholarCardStep.cardStepSuccess {
    background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
    border: 1.5px solid #86efac;
    box-shadow: 0 4px 16px -2px rgba(34, 197, 94, 0.15);
  }

  .scholarCardStep.cardStepSuccess:hover {
    border-color: #22c55e;
    box-shadow: 0 8px 24px -4px rgba(34, 197, 94, 0.25);
  }

  .cardStepNumber.success {
    background: #16a34a;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(22, 163, 74, 0.35);
  }

  .cardStepTag.success {
    color: #16a34a;
    font-weight: 800;
  }

  /* Banner de sucesso / pronto (Passo 4) */
  .miniReadyBanner {
    background: #0f172a;
    color: #f8fafc;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: auto;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
  }

  .miniReadyPulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
    flex-shrink: 0;
  }

  .miniReadyText {
    color: #86efac;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: -0.01em;
  }

  .cardStepTitle {
    font-size: 13.5px;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 6px 0;
    line-height: 1.35;
  }

  .cardStepDesc {
    font-size: 12px;
    line-height: 1.5;
    color: #475569;
    margin: 0 0 12px 0;
    flex-grow: 1;
  }

  .cardStepFooter {
    margin-top: auto;
  }

  .stepMetaPill {
    display: inline-block;
    font-size: 11px;
    font-family: monospace;
    font-weight: 600;
    color: #2563eb;
    background: #eff6ff;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid #bfdbfe;
  }

  /* Conectores com seta circular entre os passos */
  .scholarFlowConnector {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0 2px;
  }

  .connectorCircle {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #64748b;
    display: grid;
    place-items: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }

  /* Mockup de Menu de Contexto (Passo 2) */
  .miniContextMock {
    background: #0f172a;
    color: #f8fafc;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
    margin-top: auto;
  }

  .miniContextItem {
    opacity: 0.85;
    font-size: 11px;
  }

  .miniContextSub {
    color: #4ade80;
    font-weight: 700;
    padding-left: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Pílulas de categorias (Passo 3) */
  .miniCategoryPills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: auto;
  }

  .miniCatPill {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .miniCatPill.include {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #86efac;
  }

  .miniCatPill.exclude {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fca5a5;
  }

  .miniCatPill.pending {
    background: #fef3c7;
    color: #b45309;
    border: 1px solid #fde68a;
  }

  @media (max-width: 768px) {
    .scholarCardsFlow {
      flex-direction: column;
    }
    .scholarFlowConnector {
      transform: rotate(90deg);
      padding: 6px 0;
    }
  }

  /* Caixas de Alerta / Obrigação (Etapas 2 e 3) */
  .tutorialAlertBox {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 14px;
    margin-bottom: 22px;
  }

  .tutorialAlertBox.warning {
    background: linear-gradient(
      135deg,
      rgba(254, 243, 199, 0.6),
      rgba(255, 251, 235, 0.9)
    );
    border: 1.5px solid rgba(245, 158, 11, 0.4);
  }

  .tutorialAlertBox.success {
    background: linear-gradient(
      135deg,
      rgba(220, 252, 231, 0.6),
      rgba(240, 253, 244, 0.95)
    );
    border: 1.5px solid rgba(34, 197, 94, 0.4);
  }

  .tutorialAlertBox.info {
    background: linear-gradient(
      135deg,
      rgba(239, 246, 255, 0.7),
      rgba(248, 250, 252, 0.95)
    );
    border: 1.5px solid rgba(59, 130, 246, 0.35);
  }

  .tutorialPrepBox {
    background: linear-gradient(
      145deg,
      rgba(240, 249, 255, 0.8),
      rgba(248, 250, 252, 0.95)
    );
    border: 1.5px solid rgba(14, 165, 233, 0.35);
    box-shadow: 0 4px 16px -2px rgba(14, 165, 233, 0.08);
  }

  .alertBoxIcon {
    font-size: 24px;
    line-height: 1;
    flex-shrink: 0;
  }

  .alertBoxContent strong {
    display: block;
    font-size: 14.5px;
    color: #1e293b;
    margin-bottom: 6px;
  }

  .alertBoxContent p {
    margin: 0 0 12px 0;
    font-size: 13px;
    line-height: 1.5;
    color: #475569;
  }

  .alertBoxActions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* Botão de ação direta dentro do alerta */
  .tutorialBtnAction {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    background: #0f172a;
    border: 1px solid #0f172a;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tutorialBtnAction:hover {
    background: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
  }

  /* Rodapé do card */
  .tutorialFooterActions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 18px;
    border-top: 1px solid #e2e8f0;
    flex-wrap: wrap;
  }

  .nextStepHint {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nextStepHint strong {
    font-size: 13px;
    color: #1e293b;
  }

  .nextStepHint span {
    font-size: 12px;
    color: #64748b;
  }

  .tutorialBtnPrimary {
    padding: 11px 22px;
    font-size: 13.5px;
    font-weight: 800;
    color: #ffffff;
    background: #16a34a;
    border: 1px solid #15803d;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.3);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .tutorialBtnPrimary:hover:not(:disabled) {
    background: #15803d;
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(21, 128, 61, 0.4);
  }

  .tutorialBtnPrimary.disabled,
  .tutorialBtnPrimary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #94a3b8;
    border-color: #94a3b8;
    box-shadow: none;
    transform: none;
  }

  .tutorialBtnSuccess {
    background: #059669;
    border-color: #047857;
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
  }

  .tutorialBtnSuccess:hover:not(:disabled) {
    background: #047857;
  }

  @media (max-width: 640px) {
    .tutorialDropdownCard {
      top: 10px;
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
    }
    .tutorialHeaderBar {
      padding: 12px 14px;
    }
    .tutorialBodyContent {
      padding: 16px 16px 18px;
    }
    .tutorialFooterActions {
      flex-direction: column;
      align-items: stretch;
    }
    .tutorialBtnPrimary {
      width: 100%;
      justify-content: center;
    }
  }
</style>
