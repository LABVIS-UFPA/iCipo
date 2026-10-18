<script>
  import { activeConfirmStore, closeConfirmDialog } from '../dashboardStore.js';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';

  $: confirmData = $activeConfirmStore;

  let confirmBtnRef = null;

  $: if (confirmData && confirmBtnRef) {
    tick().then(() => {
      confirmBtnRef?.focus();
    });
  }

  function handleCancel() {
    closeConfirmDialog(false);
  }

  function handleConfirm() {
    closeConfirmDialog(true);
  }

  function handleKeydown(event) {
    if (!confirmData) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Enter' && (event.target?.tagName !== 'BUTTON' || event.target === confirmBtnRef)) {
      event.preventDefault();
      handleConfirm();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if confirmData}
  <!-- Backdrop fosco com desfoque elegante para foco total no diálogo -->
  <div
    class="confirmOverlayBackdrop"
    role="presentation"
    transition:fade={{ duration: 200 }}
    on:click={handleCancel}
  ></div>

  <!-- Card flutuante de confirmação que desce suavemente de cima para baixo -->
  <div
    class="dropConfirmContainer"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirmCardHeading"
    aria-describedby="confirmCardDesc"
    transition:fly={{ y: -70, duration: 320, easing: cubicOut }}
  >
    <div class="dropConfirmCard {confirmData.tone || 'danger'}">
      <!-- Linha de realce gradiente no topo -->
      <div class="confirmAccentBar {confirmData.tone || 'danger'}"></div>

      <div class="confirmMainContent">
        <!-- Ícone visual em destaque -->
        <div class="confirmIconCol">
          <div class="confirmIconBadge {confirmData.tone || 'danger'}">
            {#if confirmData.icon === 'trash'}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            {:else if confirmData.icon === 'unmark'}
              <!-- Ícone de desmarcar / retirar artigo da fase -->
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                <line x1="2" y1="2" x2="22" y2="22" stroke="#dc2626" stroke-width="2.5"></line>
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            {/if}
          </div>
        </div>

        <!-- Conteúdo textual formatado -->
        <div class="confirmTextCol">
          <div class="confirmHeaderRow">
            <span class="confirmTag {confirmData.tone || 'danger'}">
              {confirmData.title || 'Aviso do iCipó'}
            </span>
            {#if confirmData.phaseBadge}
              <span class="confirmPhaseBadge" title="Fase vinculada">
                🌿 {confirmData.phaseBadge}
              </span>
            {/if}
          </div>

          <h3 id="confirmCardHeading" class="confirmHeading">
            {confirmData.message}
          </h3>

          {#if confirmData.details}
            <p id="confirmCardDesc" class="confirmDetails">
              {confirmData.details}
            </p>
          {/if}
        </div>

        <!-- Botão fechar (X) -->
        <button
          type="button"
          class="confirmCloseBtn"
          title="Cancelar (Esc)"
          aria-label="Cancelar confirmação"
          on:click={handleCancel}
        >
          ✕
        </button>
      </div>

      <!-- Barra de Ações (Rodapé do Card) -->
      <div class="confirmActionBar">
        <button
          type="button"
          class="btnCancel"
          on:click={handleCancel}
        >
          <span>{confirmData.cancelLabel || 'Cancelar'}</span>
          <kbd class="keyPill">Esc</kbd>
        </button>

        <button
          type="button"
          bind:this={confirmBtnRef}
          class="btnConfirm {confirmData.tone || 'danger'}"
          on:click={handleConfirm}
        >
          <span>{confirmData.confirmLabel || 'Confirmar'}</span>
          <kbd class="keyPill dark">↵ Enter</kbd>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirmOverlayBackdrop {
    position: fixed;
    inset: 0;
    z-index: 999998;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
  }

  .dropConfirmContainer {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    width: min(540px, calc(100vw - 32px));
    pointer-events: auto;
  }

  .dropConfirmCard {
    background: #ffffff;
    border-radius: 16px;
    box-shadow:
      0 25px 50px -12px rgba(15, 23, 42, 0.35),
      0 8px 24px rgba(15, 23, 42, 0.12),
      0 0 0 1px rgba(15, 23, 42, 0.08);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1.5px solid transparent;
  }

  .dropConfirmCard.danger {
    border-color: #fca5a5;
  }

  .dropConfirmCard.warning {
    border-color: #fde68a;
  }

  .confirmAccentBar {
    height: 4px;
    width: 100%;
    flex-shrink: 0;
  }

  .confirmAccentBar.danger {
    background: linear-gradient(90deg, #ef4444, #f87171, #dc2626);
  }

  .confirmAccentBar.warning {
    background: linear-gradient(90deg, #f59e0b, #fbbf24, #d97706);
  }

  .confirmMainContent {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 20px 14px;
  }

  .confirmIconCol {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .confirmIconBadge {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: grid;
    place-items: center;
  }

  .confirmIconBadge.danger {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fecdd3;
  }

  .confirmIconBadge.warning {
    background: #fef3c7;
    color: #d97706;
    border: 1px solid #fde68a;
  }

  .confirmTextCol {
    flex: 1;
    min-width: 0;
  }

  .confirmHeaderRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }

  .confirmTag {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .confirmTag.danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .confirmTag.warning {
    background: #fef3c7;
    color: #92400e;
  }

  .confirmPhaseBadge {
    font-size: 11.5px;
    font-weight: 600;
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
    padding: 2px 8px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .confirmHeading {
    margin: 0 0 6px 0;
    font-size: 15px;
    font-weight: 750;
    line-height: 1.4;
    color: #0f172a;
    letter-spacing: -0.015em;
    word-break: break-word;
  }

  .confirmDetails {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: #475569;
    word-break: break-word;
  }

  .confirmCloseBtn {
    background: transparent;
    border: none;
    font-size: 15px;
    font-weight: 700;
    color: #64748b;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 2px;
    margin-top: -4px;
    transition: all 0.15s ease;
  }

  .confirmCloseBtn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  /* Barra inferior de Ações */
  .confirmActionBar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: #f8fafc;
    border-top: 1px solid #f1f5f9;
  }

  .btnCancel {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #475569;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btnCancel:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }

  .btnConfirm {
    border: none;
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    padding: 7.5px 16px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btnConfirm.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.28);
  }

  .btnConfirm.danger:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.38);
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }

  .btnConfirm.warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.28);
  }

  .btnConfirm.warning:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(245, 158, 11, 0.38);
  }

  .keyPill {
    font-size: 10px;
    font-family: inherit;
    font-weight: 600;
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 1px 5px;
    line-height: 1.2;
  }

  .keyPill.dark {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.35);
  }

  @media (max-width: 640px) {
    .dropConfirmContainer {
      top: 12px;
      width: calc(100vw - 20px);
    }
    .confirmMainContent {
      padding: 14px 16px 12px;
    }
    .confirmHeading {
      font-size: 14px;
    }
    .confirmDetails {
      font-size: 12.5px;
    }
    .confirmActionBar {
      padding: 10px 16px;
    }
  }
</style>
