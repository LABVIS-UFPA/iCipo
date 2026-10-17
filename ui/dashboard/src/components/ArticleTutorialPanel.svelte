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
    aria-label="Tutorial · Como funciona a triagem de artigos na fase"
  >
    <div class="sidePanelHeader">
      <div>
        <div class="tutorialEyebrow">Tutorial · Etapa 4 de 4</div>
        <div style="font-weight:900;font-size:16px">Como funciona a triagem de artigos</div>
      </div>
      <button class="btn" on:click={closeArticleTutorial}>Entendi</button>
    </div>

    <div class="sidePanelBody u-scroll-y">
      <p class="articleTutorialIntro">
        Os artigos do seu projeto são organizados e triados diretamente em cada etapa através da gaveta lateral <b>Ver artigos</b>.
      </p>

      <!-- Passo 1 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">1</span>
        <div>
          <strong>Coleta rápida no Google Scholar</strong>
          <span>
            No Google Acadêmico com a extensão ativa, clique com o botão direito sobre qualquer resultado, selecione <b>Marcar link</b> e escolha a categoria inicial para enviar o artigo à fase ativa.
          </span>
        </div>
      </div>

      <!-- Passo 2 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">2</span>
        <div>
          <strong>Acesse os artigos dentro da fase</strong>
          <span>
            Na tela de <b>Fases</b> do Dashboard, clique no botão <b>Ver artigos</b> no cartão da fase ativa para abrir a gaveta lateral de triagem com todos os estudos daquela etapa.
          </span>
        </div>
      </div>

      <!-- Passo 3 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">3</span>
        <div>
          <strong>Alterne entre Cartões e Tabela</strong>
          <span>
            No topo da gaveta de artigos, escolha a visualização em <b>Cartões</b> (detalhes ricos com autores, ano e notas) ou <b>Tabela</b> (linhas compactas para triagem em massa). Sua preferência fica salva automaticamente.
          </span>
        </div>
      </div>

      <!-- Passo 4 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">4</span>
        <div>
          <strong>Categorias Padrão: Incluir, Excluir e Pendente</strong>
          <span>
            O iCipó já vem configurado com as três categorias essenciais:
            <b style="color:#16a34a">Incluir</b> (artigo aprovado que segue para a próxima fase),
            <b style="color:#dc2626">Excluir</b> (artigo descartado da revisão) e
            <b style="color:#d97706">Pendente</b> (aguardando avaliação). Elas alimentam os gráficos e taxas da Visão Geral.
          </span>
        </div>
      </div>

      <!-- Passo 5 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">5</span>
        <div>
          <strong>Categorias personalizadas vinculadas às métricas</strong>
          <span>
            Você pode criar categorias personalizadas (ex.: <i>Fora do Escopo</i>, <i>Estudo Primário</i>) e escolher explicitamente se cada uma estará relacionada nas métricas a <b>Incluir</b>, <b>Excluir</b> ou <b>Pendente</b>.
          </span>
        </div>
      </div>

      <!-- Passo 6 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">6</span>
        <div>
          <strong>Triagem direta com botões de ação</strong>
          <span>
            Em cada artigo, use os botões rápidos <b>✓ Incluir</b>, <b>× Excluir</b> ou <b>⏳ Pendente</b>. Se houver mais de uma categoria personalizada para o mesmo desfecho, você escolhe qual motivo aplicar.
          </span>
        </div>
      </div>

      <!-- Passo 7 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">7</span>
        <div>
          <strong>Busca e filtros inteligentes</strong>
          <span>
            Filtre por desfecho (Incluídos, Excluídos, Pendentes, Herdados) ou pesquise instantaneamente por título, autores, ano, revista e anotações.
          </span>
        </div>
      </div>

      <!-- Passo 8 -->
      <div class="articleTutorialStep">
        <span class="articleTutorialNumber">8</span>
        <div>
          <strong>Desmarcar link vs. Excluir da pesquisa</strong>
          <span>
            Use o botão <b>Remover</b> apenas se marcou um link por engano no navegador e deseja tirá-lo da fase. Para reprovar um artigo por critérios científicos, use <b>× Excluir</b>.
          </span>
        </div>
      </div>

      <div class="articleTutorialTip">
        <strong>Tudo pronto para começar!</strong>
        <span>
          Vá ao Google Scholar para coletar seus estudos ou clique em <b>Ver artigos</b> no cartão da sua fase para experimentar a triagem.
        </span>
      </div>
    </div>
  </div>
{/if}
