<script>
  import { activeNoticeStore, closeNotice } from '../dashboardStore.js';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  $: notice = $activeNoticeStore;

  let isHovered = false;
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && notice) closeNotice(); }} />

{#if notice}
  <!-- Card flutuante de aviso que desce suavemente de cima para baixo -->
  <div
    class="dropNoticeContainer"
    role="alert"
    aria-live="assertive"
    transition:fly={{ y: -70, duration: 320, easing: cubicOut }}
    on:mouseenter={() => { isHovered = true; }}
    on:mouseleave={() => { isHovered = false; }}
  >
    <div class="dropNoticeCard {notice.type || 'warning'}">
      <div class="noticeAccentBar {notice.type || 'warning'}"></div>

      <div class="noticeMainContent">
        <div class="noticeIconCol">
          {#if notice.type === 'error'}
            <div class="noticeIconBadge error" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
          {:else if notice.type === 'success'}
            <div class="noticeIconBadge success" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          {:else if notice.type === 'info'}
            <div class="noticeIconBadge info" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </div>
          {:else}
            <!-- default: warning -->
            <div class="noticeIconBadge warning" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
          {/if}
        </div>

        <div class="noticeTextCol">
          <div class="noticeHeaderRow">
            <span class="noticeTitle">
              {#if notice.type === 'error'}
                Não foi possível prosseguir
              {:else if notice.type === 'success'}
                Ação concluída
              {:else if notice.type === 'info'}
                Informação da Pesquisa
              {:else}
                Aviso do iCipó
              {/if}
            </span>
          </div>
          <p class="noticeMessage">{notice.message}</p>
        </div>

        <button
          type="button"
          class="noticeCloseBtn"
          title="Fechar aviso (Esc)"
          aria-label="Fechar aviso"
          on:click={closeNotice}
        >
          ✕
        </button>
      </div>

      {#if notice.duration > 0}
        <div class="noticeProgressTrack">
          <div
            class="noticeProgressBar {notice.type || 'warning'}"
            style="animation-duration: {notice.duration}ms; animation-play-state: {isHovered ? 'paused' : 'running'};"
          ></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dropNoticeContainer {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    width: min(520px, calc(100vw - 32px));
    pointer-events: auto;
  }

  .dropNoticeCard {
    background: #ffffff;
    border-radius: 14px;
    box-shadow:
      0 20px 45px -10px rgba(15, 23, 42, 0.28),
      0 4px 12px rgba(15, 23, 42, 0.08),
      0 0 0 1px rgba(15, 23, 42, 0.08);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    border: 1.5px solid transparent;
  }

  .dropNoticeCard.warning {
    border-color: #fde68a;
  }

  .dropNoticeCard.error {
    border-color: #fca5a5;
  }

  .dropNoticeCard.success {
    border-color: #86efac;
  }

  .dropNoticeCard.info {
    border-color: #bfdbfe;
  }

  .noticeAccentBar {
    height: 3.5px;
    width: 100%;
    flex-shrink: 0;
  }

  .noticeAccentBar.warning {
    background: linear-gradient(90deg, #f59e0b, #fbbf24, #d97706);
  }

  .noticeAccentBar.error {
    background: linear-gradient(90deg, #ef4444, #f87171, #dc2626);
  }

  .noticeAccentBar.success {
    background: linear-gradient(90deg, #10b981, #34d399, #059669);
  }

  .noticeAccentBar.info {
    background: linear-gradient(90deg, #3b82f6, #60a5fa, #2563eb);
  }

  .noticeMainContent {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px 13px;
  }

  .noticeIconCol {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .noticeIconBadge {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
  }

  .noticeIconBadge.warning {
    background: #fef3c7;
    color: #d97706;
    border: 1px solid #fde68a;
  }

  .noticeIconBadge.error {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .noticeIconBadge.success {
    background: #dcfce7;
    color: #16a34a;
    border: 1px solid #86efac;
  }

  .noticeIconBadge.info {
    background: #eff6ff;
    color: #2563eb;
    border: 1px solid #bfdbfe;
  }

  .noticeTextCol {
    flex: 1;
    min-width: 0;
  }

  .noticeHeaderRow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
  }

  .noticeTitle {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .noticeMessage {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #334155;
    font-weight: 500;
    word-break: break-word;
  }

  .noticeCloseBtn {
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
    margin-top: -2px;
    transition: all 0.15s ease;
  }

  .noticeCloseBtn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .noticeProgressTrack {
    height: 3px;
    background: #f1f5f9;
    width: 100%;
    overflow: hidden;
  }

  .noticeProgressBar {
    height: 100%;
    width: 100%;
    transform-origin: left;
    animation: shrinkProgress linear forwards;
  }

  .noticeProgressBar.warning {
    background: #f59e0b;
  }

  .noticeProgressBar.error {
    background: #ef4444;
  }

  .noticeProgressBar.success {
    background: #10b981;
  }

  .noticeProgressBar.info {
    background: #3b82f6;
  }

  @keyframes shrinkProgress {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  @media (max-width: 640px) {
    .dropNoticeContainer {
      top: 12px;
      width: calc(100vw - 24px);
    }
    .noticeMainContent {
      padding: 12px 14px;
    }
    .noticeMessage {
      font-size: 12.5px;
    }
  }
</style>
