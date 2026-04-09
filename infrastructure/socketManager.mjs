

// Registra o ouvinte de erro APENAS UMA VEZ na inicialização do script (Regra do Manifest V3)
if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('error', (ev) => {
    try {
      const msg = ev && (ev.message || (ev.error && ev.error.message)) || '';
      if (typeof msg === 'string' && msg.includes('WebSocket connection to')) {
        ev.stopImmediatePropagation && ev.stopImmediatePropagation();
        ev.preventDefault && ev.preventDefault();
      }
    } catch (err) {}
  }, true);
}





// Socket manager: exporta uma instância compartilhada do WebsocketManager
class WebsocketManager {
  constructor() {
    this.socket = null;
    this._closedFinalized = false;
    this.onOpenListeners = [];
    this.tryAutoConnect();
    this.autoConnectionTime = 100;
    this.responseHandlers = {};
    // Variável global para o supressor saber qual URL ignorar
    this.currentConnectingUrl = "";
  }

  buildWsUrl(url, port) {
    let u = (url || "").trim();
    let p = (port || "").toString().trim();
    if (!u) u = "ws://localhost";
    if (!p) p = "8080";
    if (!/^wss?:\/\//i.test(u)) u = "ws://" + u;
    u = u.replace(/\/+$/g, "");
    if (/:(\d+)$/.test(u)) return u;
    return `${u}:${p}`;
  }

  setStatus(status) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ server_status: status });
    }
  }

  appendLog(msg) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get({ server_messages: [] }, (res) => {
        const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
        msgs.push({ time: Date.now(), data: msg });
        chrome.storage.local.set({ server_messages: msgs.slice(-500) });
      });
    } else {
      // Fallback amigável para quando rodar no Node.js ou testes
      console.log(`[WS Log]: ${msg}`); 
    }
  }

  finalizeClose(logMsg = "🔌 Conexão encerrada", statusText = "Desconectado") {
    if (this._closedFinalized) return;
    this._closedFinalized = true;
    try { this.socket = null; } catch (e) { this.socket = null; }
    this.setStatus(statusText);
    this.appendLog(logMsg);
  }

  disconnect() {
    try { if (this.socket) this.socket.close(); } catch (e) {}
    this.finalizeClose("🔌 Desconectado", "Desconectado");
  }

  buildProbeUrl(wsUrl) {
    return wsUrl.replace(/^wss?:\/\//i, (m) => m.toLowerCase().startsWith("wss") ? "https://" : "http://");
  }

  async isServerAvailable(wsUrl, timeoutMs = 1500) {
    const probeUrl = this.buildProbeUrl(wsUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // Qualquer resposta HTTP — inclusive 426 Upgrade Required de servidor WS-only —
      // confirma que a porta está ativa. Só cai em catch quando há falha de rede.
      await fetch(probeUrl, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
      return true;
    } catch {
      return false; // ERR_CONNECTION_REFUSED, timeout, etc.
    } finally {
      clearTimeout(timer);
    }
  }

  async connect(url, port) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.appendLog("Já está conectado.");
      return;
    }

    const fullUrl = this.buildWsUrl(url, port);

    const up = await this.isServerAvailable(fullUrl);
    if (!up) {
      this.setStatus("Desconectado");
      this.appendLog("Servidor indisponível em " + fullUrl + ". Tentando novamente em breve...");
      setTimeout(() => this.tryAutoConnect(), this.autoConnectionTime);
      this.autoConnectionTime *= 2;
      if (this.autoConnectionTime > 60000) this.autoConnectionTime = 60000;
      return;
    }

    this.setStatus("Conectando...");
    this.appendLog("Conectando em " + fullUrl);
    this._closedFinalized = false;

    // Atualiza a URL global para o nosso supressor silenciar os erros no console
    this.currentConnectingUrl = fullUrl;

    try {
      this.socket = new WebSocket(fullUrl);
    } catch (e) {
      this.setStatus("Erro");
      this.appendLog("Erro ao criar WebSocket: " + (e?.message || e));
      this.socket = null;
      this._closedFinalized = true;
      this.currentConnectingUrl = ""; // Limpa a URL global em caso de falha na criação do WebSocket
      return;
    }

    this.socket.onopen = () => {
      this.setStatus("Conectado");
      this.appendLog("✅ Conectado");
      this.autoConnectionTime = 100;
      this.currentConnectingUrl = ""; // Limpa a URL global para não silenciar erros de conexões futuras
      
      // Trigger all registered open listeners
      this.onOpenListeners.forEach(callback => {
        try {
          callback();
        } catch (e) {
          console.error("Error in onOpen listener:", e);
        }
      });
    };

    this.socket.onmessage = (e) => {
      // tenta despachar para o handler registrado
      try{
        const msg = JSON.parse(e.data);
        if(msg && msg.act && this.responseHandlers[msg.act] instanceof Function){
          this.responseHandlers[msg.act](msg.payload);
          return;
        }
      }catch(err){console.warn("Erro ao despachar mensagem recebida:", err);}
      
      this.appendLog("MSG: " + e.data);
    };

    this.socket.onerror = () => {
      this.setStatus("Erro");
      this.appendLog("❌ Erro na conexão");
      this.currentConnectingUrl = ""; // Limpa a URL global para não silenciar erros de conexões futuras
    };

    this.socket.onclose = () => {
      this.finalizeClose("🔌 Conexão encerrada", "Desconectado");
      this.currentConnectingUrl = ""; // Limpa a URL global para não silenciar erros de conexões futuras
      setTimeout(() => this.tryAutoConnect(), this.autoConnectionTime);
      this.autoConnectionTime *= 2;
      if (this.autoConnectionTime > 60000) this.autoConnectionTime = 60000;
    };
  }

  send(data, responseHandler) {
    console.log("WebsocketManager.send", data);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.setResponseHandler(data.act, responseHandler);
      this.socket.send(JSON.stringify(data));
      this.appendLog("➡️ " + (typeof data === 'string' ? data : JSON.stringify(data)));
      return true;
    }
    console.warn("WebSocket não está conectado. Não foi possível enviar a mensagem.");
    return false;
  }

  // Register a callback to be called when WebSocket opens/reconnects
  addOnOpenListener(callback) {
    if (typeof callback === 'function') {
      // MELHORIA: Se já estiver conectado, executa imediatamente!
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        callback();
      }
      this.onOpenListeners.push(callback);
    }
  }
  setResponseHandler(act, handler) {
    this.responseHandlers[act] = handler;
  }

  tryAutoConnect() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(["server_url", "server_port"], (data) => {
        if (!data.server_url) {
          data.server_url = "ws://localhost";
          data.server_port = "8080";
          chrome.storage.local.set(data);
        }
        const u = data.server_url;
        const p = data.server_port;
        if (u) this.connect(u, p);
      });
    }
  }
}

export const wsManager = new WebsocketManager();
