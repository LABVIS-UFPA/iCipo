<script>
  import { onMount, onDestroy } from 'svelte';
  import { storage } from '../../../infrastructure/storage.mjs';
  import '../options.css';

  let activeTab = 'panel-backup';
  let extensionActive = true;
  let extensionBusy = false;
  let uploadFileName = 'Nenhum arquivo escolhido';

  // Server state
  let serverUrl = 'ws://localhost';
  let serverPort = '8080';
  let serverStatus = 'Desconectado';
  let serverMessages = [];
  let serverLogEl;

  function setTab(tabId) {
    activeTab = tabId;
    try {
      localStorage.setItem('icipo_options_tab', tabId);
    } catch {}
    try {
      if (history && history.replaceState) history.replaceState(null, '', `#${tabId}`);
      else location.hash = `#${tabId}`;
    } catch {}
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function loadExtensionState() {
    extensionBusy = true;
    try {
      const response = await sendRuntimeMessage({ action: 'getExtensionState' });
      if (response && response.ok) {
        extensionActive = response.active !== false;
      } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['active'], (data) => {
          extensionActive = data?.active !== false;
        });
      }
    } catch (e) {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['active'], (data) => {
          extensionActive = data?.active !== false;
        });
      }
    } finally {
      extensionBusy = false;
    }
  }

  async function toggleExtension() {
    if (extensionBusy) return;
    const nextActive = !extensionActive;
    extensionBusy = true;
    try {
      const response = await sendRuntimeMessage({ action: 'setExtensionActive', active: nextActive });
      if (response && response.ok) {
        extensionActive = response.active !== false;
      } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ active: nextActive }, () => {
          extensionActive = nextActive;
        });
      } else {
        extensionActive = nextActive;
      }
    } catch (e) {
      console.warn('Erro ao alterar estado da extensão:', e);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ active: nextActive }, () => {
          extensionActive = nextActive;
        });
      } else {
        extensionActive = nextActive;
      }
    } finally {
      extensionBusy = false;
    }
  }

  function downloadBackup() {
    storage.get(null).then((data) => {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'storage_backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch((err) => {
      alert('Erro ao exportar backup: ' + err);
    });
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    uploadFileName = file?.name || 'Nenhum arquivo escolhido';
    if (!file) return;

    if (!confirm('Tem certeza de que deseja fazer upload deste arquivo? Isso pode sobrescrever os dados existentes.')) {
      event.target.value = '';
      uploadFileName = 'Nenhum arquivo escolhido';
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const jsonData = JSON.parse(e.target.result);
        storage.set(jsonData).then(() => {
          alert('Dados carregados no storage com sucesso!');
        }).catch((err) => {
          alert('Erro ao salvar dados: ' + err);
        });
      } catch (err) {
        alert('Erro ao processar o JSON: ' + err);
      }
    };
    reader.readAsText(file);
  }

  function refreshServerState() {
    sendRuntimeMessage({ action: 'socket_get_state' }).then((resp) => {
      if (resp && resp.ok) {
        if (resp.url) serverUrl = resp.url;
        if (resp.port) serverPort = resp.port;
        serverStatus = resp.status || 'Desconectado';
        serverMessages = Array.isArray(resp.messages) ? resp.messages : [];
        scrollLogToBottom();
      }
    }).catch(() => {});
  }

  function connectOrDisconnect() {
    const url = serverUrl?.trim();
    const port = String(serverPort || '').trim();

    if (serverStatus === 'Conectado') {
      sendRuntimeMessage({ action: 'socket_disconnect' }).catch(() => {});
    } else {
      sendRuntimeMessage({ action: 'socket_connect', url, port }).catch(() => {});
    }
  }

  function sendPing() {
    sendRuntimeMessage({ action: 'socket_send', data: 'ping' }).then((resp) => {
      if (!resp || !resp.ok) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get({ server_messages: [] }, (res) => {
            const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
            msgs.push({ time: Date.now(), data: '⚠️ Socket não conectado (ping falhou)' });
            chrome.storage.local.set({ server_messages: msgs.slice(-500) });
          });
        }
      }
    }).catch(() => {});
  }

  function clearServerLog() {
    if (!confirm('Limpar log do servidor?')) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ server_messages: [] }, () => {
        serverMessages = [];
      });
    } else {
      serverMessages = [];
    }
  }

  function scrollLogToBottom() {
    setTimeout(() => {
      if (serverLogEl) {
        serverLogEl.scrollTop = serverLogEl.scrollHeight;
      }
    }, 10);
  }

  function navigateToDashboard() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      window.location.href = chrome.runtime.getURL('ui/dashboard/dashboard.html');
    } else {
      window.location.href = '../dashboard/dashboard.html';
    }
  }

  function navigateToProjects() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      window.location.href = chrome.runtime.getURL('ui/projects/projects.html');
    } else {
      window.location.href = '../projects/projects.html';
    }
  }


  let storageListener;
  let onVisibilityChange;
  let onFocus;

  onMount(() => {
    let initialTab = null;
    if (location.hash) {
      const hash = location.hash.replace('#', '');
      if (['panel-backup', 'panel-server', 'panel-danger'].includes(hash)) {
        initialTab = hash;
      }
    }
    if (!initialTab) {
      try {
        const saved = localStorage.getItem('icipo_options_tab');
        if (['panel-backup', 'panel-server', 'panel-danger'].includes(saved)) {
          initialTab = saved;
        }
      } catch {}
    }
    if (initialTab) {
      activeTab = initialTab;
    }

    loadExtensionState();
    refreshServerState();

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      storageListener = (changes, areaName) => {
        if (areaName === 'local' && changes.active) {
          extensionActive = changes.active.newValue !== false;
        }
        if (changes.server_status) {
          serverStatus = changes.server_status.newValue;
        }
        if (changes.server_messages) {
          serverMessages = Array.isArray(changes.server_messages.newValue) ? changes.server_messages.newValue : [];
          scrollLogToBottom();
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
    }

    onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshServerState();
    };
    onFocus = () => refreshServerState();

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
  });

  onDestroy(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged && storageListener) {
      chrome.storage.onChanged.removeListener(storageListener);
    }
    if (onVisibilityChange) window.removeEventListener('visibilitychange', onVisibilityChange);
    if (onFocus) window.removeEventListener('focus', onFocus);
  });
</script>

<div class="settingsApp">
  <aside class="settingsSidebar">
    <div class="brandModern">
      <picture class="brandPicture">
        <img class="brandLogo" src="/img/icipo_logo[dark].png" alt="iCipó" />
      </picture>
    </div>

    <div class="sidebarIntro">
      <span class="sidebarEyebrow">Central de controle</span>
      <strong>Configurações</strong>
      <p>Gerencie a conexão do iCipó.</p>
    </div>

    <nav class="settingsNav" aria-label="Navegação das configurações">
      <button
        class="sideItem"
        class:active={activeTab === 'panel-backup'}
        type="button"
        on:click={() => setTab('panel-backup')}
      >
        <span class="navIcon" aria-hidden="true">
          <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </span>
        <span class="navText">
          <strong>Backup</strong>
          <small>Exportar e restaurar dados</small>
        </span>
      </button>

      <button
        class="sideItem"
        class:active={activeTab === 'panel-server'}
        type="button"
        on:click={() => setTab('panel-server')}
      >
        <span class="navIcon" aria-hidden="true">
          <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
        </span>
        <span class="navText">
          <strong>Servidor</strong>
          <small>Conexão WebSocket local</small>
        </span>
      </button>
    </nav>

    <div class="sidebarBottom">
      <div class="extensionStateCard">
        <div class="extensionStateTop">
          <span class="statusDot" class:active={extensionActive} aria-hidden="true"></span>
          <div>
            <strong>{extensionActive ? 'Extensão ativada' : 'Extensão desativada'}</strong>
            <small>Disponibilidade no navegador</small>
          </div>
        </div>
        <label class="switchControl" for="checkOnOff" class:isBusy={extensionBusy}>
          <input
            type="checkbox"
            id="checkOnOff"
            checked={extensionActive}
            disabled={extensionBusy}
            on:change={toggleExtension}
          />
          <span class="switchTrack" aria-hidden="true"><span></span></span>
          <span>{extensionActive ? 'Desligar extensão' : 'Ativar extensão'}</span>
        </label>
      </div>

      <div class="sidebarNavActions">
        <button class="sidebarBack dashboardReturnButton" type="button" on:click={navigateToDashboard}>
          <span class="dashboardReturnIcon" aria-hidden="true">
            <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
          </span>
          <span>Voltar ao dashboard</span>
        </button>
        <button class="sidebarBack projectsReturnButton" type="button" on:click={navigateToProjects}>
          <span class="dashboardReturnIcon" aria-hidden="true">
            <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10M6 14h6"/>
            </svg>
          </span>
          <span>Meus projetos</span>
        </button>
      </div>
    </div>
  </aside>

  <main class="settingsMain">
    <header class="settingsTopbar">
      <div>
        <span class="topbarEyebrow">iCipó</span>
        <strong>Configurações da extensão</strong>
      </div>
    </header>

    <div class="settingsWorkspace">
      <section class="pageHeading">
        <div>
          <h1>Configurações</h1>
          <p>Controle seus backups e a comunicação com o servidor local.</p>
        </div>
        <div class="securityBadge">
          <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div>
            <strong>Dados no seu dispositivo</strong>
            <small>As configurações ficam armazenadas localmente.</small>
          </div>
        </div>
      </section>

      <!-- PAINEL BACKUP -->
      <section class="panel" class:active={activeTab === 'panel-backup'} id="panel-backup">
        <div class="panelHeader">
          <div class="panelTitleIcon" aria-hidden="true">
            <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h2>Backup do armazenamento</h2>
            <p>Exporte uma cópia de segurança ou restaure os dados da extensão.</p>
          </div>
        </div>

        <div class="settingsGrid backupGrid">
          <article class="settingsCard actionCard">
            <div class="cardIcon cardIconGreen" aria-hidden="true">
              <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div class="cardContent">
              <span class="cardEyebrow">Exportação</span>
              <h3>Baixar backup</h3>
              <p>Gere um arquivo JSON com os dados atualmente salvos na extensão.</p>
            </div>
            <button class="btn primary" type="button" on:click={downloadBackup}>
              <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Baixar arquivo JSON</span>
            </button>
          </article>

          <article class="settingsCard actionCard">
            <div class="cardIcon cardIconPurple" aria-hidden="true">
              <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div class="cardContent">
              <span class="cardEyebrow">Restauração</span>
              <h3>Importar backup</h3>
              <p>Selecione um arquivo JSON. A importação pode substituir dados existentes.</p>
            </div>
            <label class="filePicker" for="uploadStorage">
              <span class="filePickerIcon" aria-hidden="true">
                <svg class="academicSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
              <span><strong>Selecionar arquivo</strong><small>{uploadFileName}</small></span>
              <input id="uploadStorage" type="file" accept=".json,application/json" on:change={handleFileUpload} />
            </label>
          </article>
        </div>

        <aside class="infoCallout">
          <span class="calloutIcon" aria-hidden="true">
            <svg class="academicSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
          <div>
            <strong>Antes de restaurar</strong>
            <p>Faça um backup atual. Após uma restauração, recarregue as páginas abertas para atualizar as informações exibidas.</p>
          </div>
        </aside>
      </section>

      <!-- PAINEL SERVIDOR -->
      <section class="panel" class:active={activeTab === 'panel-server'} id="panel-server">
        <div class="panelHeader">
          <div class="panelTitleIcon" aria-hidden="true">
            <svg class="academicSvg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div>
            <h2>Servidor WebSocket</h2>
            <p>Configure a comunicação entre a extensão e o servidor local do projeto.</p>
          </div>
        </div>

        <div class="settingsCard serverConnectionCard">
          <div class="serverCardHeader">
            <div>
              <span class="cardEyebrow">Conexão local</span>
              <h3>Endereço do servidor</h3>
            </div>
            <div class="serverStatusPill" class:connected={serverStatus === 'Conectado'}>
              <span></span><b>{serverStatus}</b>
            </div>
          </div>

          <div class="connectionForm">
            <div class="field fieldUrl">
              <label for="serverUrl">URL</label>
              <div class="inputShell">
                <span aria-hidden="true">
                  <svg class="academicSvg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </span>
                <input type="text" id="serverUrl" bind:value={serverUrl} placeholder="ws://localhost" autocomplete="off" />
              </div>
              <small>Use o protocolo <code>ws://</code> para conexões locais.</small>
            </div>

            <div class="field fieldPort">
              <label for="serverPort">Porta</label>
              <div class="inputShell">
                <span aria-hidden="true" style="font-weight:750;font-size:13px">#</span>
                <input type="number" id="serverPort" bind:value={serverPort} placeholder="8080" min="1" max="65535" />
              </div>
              <small>Porta padrão do projeto: 8080.</small>
            </div>
          </div>

          <div class="connectionActions">
            <button class="btn primary" type="button" on:click={connectOrDisconnect}>
              {serverStatus === 'Conectado' ? 'Desconectar' : 'Conectar'}
            </button>
            <button class="btn secondary" type="button" on:click={sendPing}>
              <svg class="academicSvg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="22 2 11 13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              <span>Enviar ping</span>
            </button>
            <span class="connectionHint">As últimas 500 mensagens são mantidas no armazenamento local.</span>
          </div>
        </div>

        <div class="settingsCard logCard">
          <div class="logHeader">
            <div>
              <span class="cardEyebrow">Diagnóstico</span>
              <h3>Log de comunicação</h3>
            </div>
            <button class="btn tertiary small" type="button" on:click={clearServerLog}>Limpar log</button>
          </div>
          <pre bind:this={serverLogEl} class="serverLog" aria-live="polite">{#each serverMessages as m}[{new Date(m.time).toLocaleTimeString()}] {m.data}
{/each}</pre>
          {#if serverMessages.length === 0}
            <div class="emptyLogHint">As mensagens da conexão aparecerão aqui.</div>
          {/if}
        </div>
      </section>
    </div>
  </main>
</div>
