<script>
  import {
    isHistoryModalOpenStore,
    historyModalPaperStore,
    closeHistoryModal,
    papersStore,
    activePhaseLabelStore,
    paperSearchQueryStore
  } from "../dashboardStore.js";
  import {
    fmtDate,
    paperBelongsToPhase
  } from "../dashboardHelpers.js";

  $: isOpen = $isHistoryModalOpenStore;
  $: paper = $historyModalPaperStore;

  $: historyList = (() => {
    if (!paper || !Array.isArray(paper.history)) return [];
    return [...paper.history].sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  })();

  $: parentPaperId = paper?.parentPaperId || null;

  $: childPapers = (() => {
    if (!paper?.id && paper?.id !== 0) return [];
    const activePhase = $activePhaseLabelStore || "";
    return ($papersStore || []).filter((p) => {
      if (String(p.parentPaperId) !== String(paper.id)) return false;
      if (!paperBelongsToPhase(p, activePhase)) return false;
      return true;
    });
  })();

  function navigateToParent() {
    if (parentPaperId) {
      paperSearchQueryStore.set(`id:${parentPaperId}`);
      closeHistoryModal();
    }
  }

  function navigateToChildren() {
    if (paper?.id || paper?.id === 0) {
      paperSearchQueryStore.set(`parent:${paper.id}`);
      closeHistoryModal();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen) {
      closeHistoryModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && paper}
  <div
    class="modal"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="historyModalTitle"
    on:click|self={closeHistoryModal}
    on:keydown|self={(e) => { if (e.key === 'Escape') closeHistoryModal(); }}
  >
    <div class="modalCard">
      <div
        class="row"
        style="justify-content:space-between;align-items:center;"
      >
        <div style="font-weight:900" id="historyModalTitle">
          Histórico: {(paper.title || paper.url || paper.id || "").slice(0, 90)}
        </div>
        <button class="btn" on:click={closeHistoryModal}>Fechar</button>
      </div>

      {#if parentPaperId || childPapers.length > 0}
        <div
          style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;"
        >
          {#if parentPaperId}
            <button
              type="button"
              class="btn small"
              on:click={navigateToParent}
            >
              Ver artigo pai
            </button>
          {/if}

          {#if childPapers.length > 0}
            <button
              type="button"
              class="btn small"
              on:click={navigateToChildren}
            >
              Ver artigos filhos ({childPapers.length})
            </button>
          {/if}
        </div>
      {/if}

      <div class="tableWrap" style="margin-top:10px;">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 140px;">Quando</th>
              <th style="width: 130px;">Ação</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {#each historyList as h (h.ts + (h.action || ""))}
              <tr>
                <td>{fmtDate(h.ts)}</td>
                <td><span class="pill">{h.action || "-"}</span></td>
                <td style="color:#444; font-family: monospace; font-size: 11px;">
                  {JSON.stringify(h.details || {})}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="3" style="color:#666; text-align: center; padding: 18px;">
                  Sem histórico para este artigo ainda.
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
