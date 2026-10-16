<script>
  import {
    isBulkCategoryModalOpenStore,
    bulkCategoryModalStore,
    closePaperBulkCategoryModal,
    applyPaperBulkCategoryAction
  } from "../dashboardStore.js";
  import {
    PAPER_BULK_ACTION_COPY,
    normalizeHexColor
  } from "../dashboardHelpers.js";

  $: isOpen = $isBulkCategoryModalOpenStore;
  $: data = $bulkCategoryModalStore;
  $: outcome = data?.outcome || "pending";
  $: categories = Array.isArray(data?.categories) ? data.categories : [];
  $: selectedCount = data?.selectedCount || 0;
  $: copy = PAPER_BULK_ACTION_COPY[outcome] || PAPER_BULK_ACTION_COPY.pending;

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen) {
      closePaperBulkCategoryModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="modal"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="paperBulkCategoryModalTitle"
    aria-describedby="paperBulkCategoryModalDescription"
    on:click|self={closePaperBulkCategoryModal}
    on:keydown|self={(e) => { if (e.key === 'Escape') closePaperBulkCategoryModal(); }}
  >
    <div class="modalCard paperBulkCategoryModalCard">
      <div class="paperBulkCategoryModalHeader">
        <div>
          <div
            id="paperBulkCategoryModalEyebrow"
            class="paperBulkCategoryModalEyebrow paperBulkCategoryModalEyebrow--{outcome}"
          >
            {selectedCount === 1 ? 'Classificação de Artigo' : 'Classificação em Lote'} · {copy.result}
          </div>
          <h3
            id="paperBulkCategoryModalTitle"
            class="paperBulkCategoryModalTitle"
          >
            Escolha a categoria que será aplicada
          </h3>
        </div>
        <button
          class="paperBulkCategoryCloseBtn"
          type="button"
          on:click={closePaperBulkCategoryModal}
          title="Fechar janela (Esc)"
        >
          ✕ Fechar
        </button>
      </div>

      <div
        id="paperBulkCategoryModalDescription"
        class="paperBulkCategoryModalDescription"
      >
        {#if selectedCount === 1}
          <strong>1 artigo</strong> será classificado como <strong>{copy.result.toLowerCase()}</strong>.
        {:else}
          <strong>{selectedCount} artigos</strong> serão classificados como <strong>{copy.result.toLowerCase()}</strong>.
        {/if}
        A categoria escolhida será gravada na fase ativa e alimentará a contagem e relatórios do estudo.
      </div>

      <div
        class="paperBulkCategoryOptions"
      >
        {#each categories as category (category.label)}
          {@const catColor = normalizeHexColor(category.color, '#2563eb')}
          <button
            type="button"
            class="paperBulkCategoryOption"
            style="--option-color: {catColor};"
            on:click={() => applyPaperBulkCategoryAction(category, outcome, data?.targetPhaseLabel)}
          >
            <i
              class="paperBulkCategoryOptionColor"
              style="background-color: {catColor};"
            ></i>
            <span class="paperBulkCategoryOptionText">
              <strong>{category.title || category.label}</strong>
              {#if category.description}
                <small>{category.description}</small>
              {/if}
            </span>
            <span
              class="paperBulkCategoryOptionOutcome paperBulkCategoryOptionOutcome--{outcome}"
            >
              {#if outcome === 'included'}✓ {copy.result}
              {:else if outcome === 'excluded'}× {copy.result}
              {:else}⏳ {copy.result}{/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
