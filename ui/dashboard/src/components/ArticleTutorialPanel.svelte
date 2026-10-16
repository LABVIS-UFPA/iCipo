<script>
  import {
    articleTutorialOpenStore,
    closeArticleTutorial
  } from "../dashboardStore.js";

  $: isOpen = $articleTutorialOpenStore;

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen) {
      closeArticleTutorial();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <button
    type="button"
    class="sideOverlay open"
    aria-label="Fechar tutorial"
    on:click={closeArticleTutorial}
  ></button>

  <div
    class="sidePanel articleTutorialPanel open"
    aria-hidden="false"
    role="dialog"
    aria-label="Tutorial · Como funciona a aba Artigos"
  >
    <div class="sidePanelHeader">
      <div>
        <div class="tutorialEyebrow">Tutorial · Etapa 4 de 4</div>
        <div style="font-weight:900">Como funciona a aba Artigos</div>
      </div>
      <button class="btn" on:click={closeArticleTutorial}>Entendi</button>
    </div>
    <div class="sidePanelBody u-scroll-y">
      <p class="articleTutorialIntro">
        Esta aba concentra os artigos marcados para o projeto e permite
        revisar rapidamente os dados coletados.
      </p>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">1</span>
        <div>
          <strong>Adicione artigos pelo navegador</strong>
          <span>No Google Scholar, clique com o botão direito em um resultado,
            escolha “Marcar link” e selecione uma categoria.</span>
        </div>
      </div>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">2</span>
        <div>
          <strong>Pesquise os artigos</strong>
          <span>Use a busca para localizar títulos, autores, anos, tags e
            categorias.</span>
        </div>
      </div>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">3</span>
        <div>
          <strong>Confira ano, categoria e resultado</strong>
          <span>A categoria registra o motivo detalhado; o sistema identifica
            duplicatas automaticamente pelo link.</span>
        </div>
      </div>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">4</span>
        <div>
          <strong>Abra a fonte original</strong>
          <span>Use o botão da coluna Link para acessar a página do artigo e
            consultar o conteúdo completo.</span>
        </div>
      </div>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">5</span>
        <div>
          <strong>Classifique vários artigos de uma vez</strong>
          <span>Selecione os artigos pela caixa lateral e use “Incluir”,
            “Remover” ou “Pendente”. A ação aplica uma categoria ativa com o
            resultado correspondente e atualiza as métricas da fase.</span>
        </div>
      </div>

      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">6</span>
        <div>
          <strong>Retire marcações quando necessário</strong>
          <span>Use “Remover marcados” apenas para retirar os registros da fase
            ativa. Essa ação é diferente de classificá-los como removidos da
            triagem.</span>
        </div>
      </div>

      <div class="articleTutorialTip">
        <strong>Próximo passo</strong>
        <span>Abra o Google Scholar, marque um artigo em uma categoria e volte a
          esta tela para acompanhar a coleta.</span>
      </div>
    </div>
  </div>
{/if}
