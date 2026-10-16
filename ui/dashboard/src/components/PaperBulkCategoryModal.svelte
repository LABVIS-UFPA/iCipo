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
            class="paperBulkCategoryModalEyebrow"
          >
            Classificação em lote · {copy.result}
          </div>
          <div
            id="paperBulkCategoryModalTitle"
            class="paperBulkCategoryModalTitle"
          >
            Escolha a categoria que será aplicada
          </div>
        </div>
        <button
          class="btn"
          type="button"
          on:click={closePaperBulkCategoryModal}
        >
          Fechar
        </button>
      </div>

      <p
        id="paperBulkCategoryModalDescription"
        class="paperBulkCategoryModalDescription"
      >
        {selectedCount} artigo{selectedCount === 1 ? "" : "s"}
        será{selectedCount === 1 ? "" : "ão"}
        classificado{selectedCount === 1 ? "" : "s"} como
        {copy.result.toLowerCase()}. A categoria escolhida será gravada na fase
        ativa e alimentará a respectiva contagem.
      </p>

      <div
        class="paperBulkCategoryOptions"
      >
        {#each categories as category (category.label)}
          <button
            type="button"
            class="paperBulkCategoryOption"
            on:click={() => applyPaperBulkCategoryAction(category, outcome)}
          >
            <i
              class="paperBulkCategoryOptionColor"
              style="background-color: {normalizeHexColor(category.color, '#A5ADBA')};"
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
              {copy.result}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
