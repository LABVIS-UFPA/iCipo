/**
 * Isomorphic Storage Service
 * 
 * Funciona tanto no Node.js quanto no browser (plugin).
 * Para Node.js: persiste via fs
 * Para browser: comunica com servidor via WebSocket
 * 
 * Padrão Strategy para abstrair as diferenças de persistência
 */

import { Project, Paper } from '../core/entities.mjs';

// ============================================================================
// STRATEGY PATTERN - Node.js Driver (fs-based)
// ============================================================================

class NodeFsStrategy {
  constructor() {
    this.fs = null;
    this.path = null;
    this.baseDir = null;
    this.activeProjectID = null;
    this.activeProjectData = null;
  }

  async init(baseDir) {
    const fsModule = await import('fs');
    const pathModule = await import('path');
    this.fs = fsModule.default || fsModule;
    this.path = pathModule.default || pathModule;
    this.baseDir = baseDir;
    
    // Ensure base directory exists
    if (!this.fs.existsSync(baseDir)) {
      this.fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  ensureDir(p) {
    try {
      if (!this.fs.existsSync(p)) {
        this.fs.mkdirSync(p, { recursive: true });
      }
    } catch (e) {
      throw e;
    }
  }

  readJson(relPath) {
    const full = this.path.join(this.baseDir, relPath);
    try {
      if (!this.fs.existsSync(full)) return null;
      const raw = this.fs.readFileSync(full, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  writeJson(relPath, obj) {
    const full = this.path.join(this.baseDir, relPath);
    try {
      this.ensureDir(this.path.dirname(full));
      this.fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
      return true;
    } catch (e) {
      throw e;
    }
  }

  // CRUD methods for Project
  //TODO: verificar se pelo id se o projeto se encontra arquivado. Pois isso, da forma como está, vai sobreescrever projetos arquivados.
  // Now accepts a single `project` object that must contain `id` (or returns error)
  async saveProject(project) {
    const projectID = project.id;
    const relPath = this.path.join(projectID, 'project.json');

    // Read existing project if present
    let existing = this.readJson(relPath) || {};

    // Merge: preserve existing properties, override/add with incoming projectData
    const merged = { ...existing, ...project };

    // Write merged project data
    this.writeJson(relPath, merged);

    // ensure config.json contains project entry and update metadata if needed
    try {
      const cfg = this.readJson('config.json') || { projects: [] };
      if (!Array.isArray(cfg.projects)) cfg.projects = [];
      const idx = cfg.projects.findIndex(p => p.id === projectID);
      if (idx === -1) {
        cfg.projects.push({ 
          id: projectID, 
          name: merged.name,
          researchers: merged.researchers
        });
      } else {
        // update name/researchers if provided in merged
        if (merged.name) cfg.projects[idx].name = merged.name;
        if (merged.researchers) cfg.projects[idx].researchers = merged.researchers;
      }
      this.writeJson('config.json', cfg);
    } catch (e) {
      // ignore errors updating config
    }

    return { status: "ok", message: "Project saved." };
  }

  async loadProject(projectID) {
    const relPath = this.path.join(projectID, 'project.json');
    try{
      return { status: 'ok', data: this.readJson(relPath) };
    }catch(e){
      return { status: 'error', message: e.message };
    }
    
  }

  // Keep a project loaded in memory as "active"
  async openProject(projectID) {
    // load project data
    const relPath = this.path.join(projectID, 'project.json');
    const data = this.readJson(relPath) || {};
    this.activeProjectID = projectID;
    this.activeProjectData = data;
    return { status: 'ok', data };
  }

  getActiveProject() {
    return { status: 'ok', data: this.activeProjectData };
  }

  async deleteProject(projectID) {
    const full = this.path.join(this.baseDir, projectID);
    // remove from config.json
    const {status} = this.archiveProject(projectID);

    if (status==="ok" && this.fs.existsSync(full)) {
      this.fs.rmSync(full, { recursive: true });
      return { status: "ok", message: "Project deleted." };
    }
    return { status: "error", message: "Project not found." };
  }

  async archiveProject(projectID) {
    // remove project from config.json but keep files on disk
    try {
      const cfg = this.readJson('config.json');
      cfg.projects = Array.isArray(cfg.projects) ? cfg.projects.filter(p => p.id !== projectID) : [];
      //TODO: deve esperar a resposta do writeJSON para confirmar a resposta no return abaixo.
      this.writeJson('config.json', cfg);
      return { status: 'ok', message: 'Project archived.' };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }

  async listProjects() {
    try {
      // Prefer config.json managed list
      const cfg = this.readJson('config.json');
      if (cfg && Array.isArray(cfg.projects)){
        // Desmarca todos como não atuais
        cfg.projects.forEach(p => p.isCurrent = false);
        // Marca o atual se houver
        if(this.activeProjectID){
          const idx = cfg.projects.findIndex(p => p.id === this.activeProjectID);
          if(idx!==-1){
            cfg.projects[idx].isCurrent = true;
          }
        }
        return { status: 'ok', data: cfg.projects };
      } 
    } catch (e) {
      return { status: "error", message: e.message };
    }
    return { status: 'ok', data: [] };
  }

  // CRUD methods for Paper — now use active project implicitly
  // savePaper accepts a single `paper` object which must include `id`.
  async savePaper(paper) {
    if (!paper || (!paper.id && !(paper.id === 0))) return { status: 'error', message: 'Paper JSON must include an id.' };
    const paperId = paper.id;
    
    const projectID = this.activeProjectID || (paper.projectID || null);
    if (!projectID) return { status: 'error', message: 'Nenhum projeto está aberto no momento.' };
    
    const relPath = this.path.join(projectID, 'papers', `${paperId}.json`);
    this.writeJson(relPath, paper);
    return { status: "ok", message: "Paper saved." };
  }

  async loadPaper(paperId) {
    if (!this.activeProjectID) return { status: 'error', message: 'Nenhum projeto está aberto no momento.' };
    const relPath = this.path.join(this.activeProjectID, 'papers', `${paperId}.json`);
    const data = this.readJson(relPath);
    return { status: "ok", data };
  }

  async deletePaper(paperId) {
    if (!this.activeProjectID) return { status: 'error', message: 'Nenhum projeto está aberto no momento.' };
    const full = this.path.join(this.baseDir, this.activeProjectID, 'papers', `${paperId}.json`);
    if (this.fs.existsSync(full)) {
      this.fs.unlinkSync(full);
      return { status: "ok", message: "Paper deleted." };
    }
    return { status: "error", message: "Paper not found." };
  }

  async listPapers() {
    if (!this.activeProjectID) return { status: 'error', message: 'Nenhum projeto está aberto no momento.' };
    const papersDir = this.path.join(this.baseDir, this.activeProjectID, 'papers');
    try {
      if (!this.fs.existsSync(papersDir)) {
        return { status: "ok", data: [] };
      }
      const files = this.fs.readdirSync(papersDir);
      const papers = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const id = f.replace('.json', '');
          const data = this.readJson(this.path.join(this.activeProjectID, 'papers', f));
          return { id, ...data };
        });
      return { status: "ok", data: papers };
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }

  // Storage-like get/set methods (chrome.storage.local-like behavior)
  async get(keys) {
    const config = this.readJson("config.json") || {};
    const result = {};

    if (!keys || keys.length === 0) {
      return config;
    }

    // If keys is a string, wrap in array
    const keyArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [];
    
    for (const key of keyArray) {
      if (key in config) {
        result[key] = config[key];
      }
    }

    return result;
  }

  async set(items) {
    if (!items || typeof items !== 'object') return;

    const config = this.readJson("config.json") || {};
    const updated = { ...config, ...items };
    this.writeJson("config.json", updated);

    return { status: "ok", message: "Data saved." };
  }

  // Check if this strategy is active and ready
  isActive() {
    return this.fs !== null && this.path !== null && this.baseDir !== null;
  }
}

// ============================================================================
// STRATEGY PATTERN - Web/Browser Driver (WebSocket-based)
// ============================================================================

class WebSocketStrategy {
  constructor() {
    this.wsManager = null;
    this.BACKUP_FLAG_KEY = '__marcalink_has_backup__';
  }

  async init() {
    const { wsManager: ws } = await import('./socketManager.mjs');
    this.wsManager = ws;

    // Register for reconnection events to sync backup data
    if (this.onOpen) {
      this.onOpen(async () => {
        await this.syncBackupData();
      });
    }
    // Check if there's backup data on startup and sync if needed
    await this.syncBackupData();
  }

  // Aguarda a conexão estar pronta
  async ensureConnection(timeoutMs = 5000) {
    if (this.isActive()) return true;

    return new Promise((resolve) => {
      let isResolved = false;

      // Timeout de segurança para não travar a aplicação eternamente
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn("Timeout aguardando WebSocket.");
          resolve(false); 
        }
      }, timeoutMs);

      // Usa o listener melhorado do wsManager
      this.wsManager.addOnOpenListener(() => {
        if (!isResolved) {
          clearTimeout(timer);
          isResolved = true;
          resolve(true);
        }
      });
    });
  }

  async send(act, payload) {
    // 1. Aguarda a conexão ser estabelecida
    console.log("WebSocketStrategy.send", act, payload);
    const isConnected = await this.ensureConnection();
    console.log("WebSocketStrategy.isConnected", isConnected);

    return new Promise((resolve, reject) => {
      if (isConnected && this.wsManager && this.wsManager.send) {
        this.wsManager.send({ act, payload }, (response) => {
          console.log("WebSocketStrategy.receive", response);
          if(response && response.status === "ok") {
            resolve(response.data);
          } else {
            reject(response);
          }
        });
      } else {
        reject({ status: "error", message: "WebSocket not connected" });
      }
    });
  }

  // Accepts a `Project` instance and returns the server response.
  async saveProject(project) {
    if(project && project instanceof Project){
      console.log("WebSocketStrategy.saveProject received project", project);
      const data = project.toJSON();
      console.log("WebSocketStrategy chamou saveProject", data);
      return this.send('save_project', { projectID: data.id, data });
    }
    return Promise.reject(new Error("O objeto a salvar deve ser uma instância de Project."));
  }

  async archiveProject(projectID) {
    return this.send('archive_project', { projectID });
  }

  // Returns a `Project` instance (or null)
  async loadProject(projectID) {
    const res = await this.send('load_project', { projectID });
    if (!res) return null;
    const payload = (res && res.data) ? res.data : res;
    if (!payload) return null;
    try {
      return Project.fromJSON(projectID, payload);
    } catch (e) {
      return null;
    }
  }

  async openProject(projectID) {
    return this.send('open_project', { projectID });
  }

  async getActiveProject(){
    const res = await this.send('get_active_project', {});
    try {
      return Project.fromJSON(res.id, res);
    } catch (e) {
      return null;
    }
  }

  async deleteProject(projectID) {
    return this.send('delete_project', { projectID });
  }

  async listProjects() {
    return this.send('list_projects', {});
  }

  // Accepts a `Paper` instance and returns the server response
  async savePaper(paper) {
    if(paper && paper instanceof Paper){
      const paperId = paper && paper.id ? paper.id : null;
      const data = paper && typeof paper.toJSON === 'function' ? paper.toJSON() : paper;
      return this.send('save_paper', { paperId, data });
    }
    return Promise.reject(new Error("O objeto a salvar deve ser uma instância de Paper."));;
  }

  // Returns a `Paper` instance (or null)
  async loadPaper(paperId) {
    const res = await this.send('load_paper', { paperId });
    console.log("WebSocketStrategy.loadPaper response", res);
    if (!res) return null;
    const payload = (res && res.data) ? res.data : res;
    if (!payload) return null;
    try {
      return Paper.fromJSON(payload);
    } catch (e) {
      return null;
    }
  }

  async deletePaper(paperId) {
    return this.send('delete_paper', { paperId });
  }

  // Returns array of `Paper` instances
  async listPapers() {
    const res = await this.send('list_papers', {});
    const payload = (res && res.data) ? res.data : res;
    if (!payload) return [];
    try {
      return Array.isArray(payload) ? payload.map(p => Paper.fromJSON(p)) : [];
    } catch (e) {
      return [];
    }
  }

  // Storage-like get/set methods (sends via WebSocket)
  async get(keys) {
    return new Promise((resolve) => {
      this.send('storage_get', { keys }).then(resolve).catch(() => resolve({}));
    });
  }

  async set(items) {
    // If WebSocket is active, send normally
    if (this.isActive()) {
      return this.send('storage_set', { items });
    }

    // If WebSocket is inactive, backup to chrome.storage
    return this.backupToChrome(items);
  }

  // Backup data to chrome.storage when offline
  async backupToChrome(items) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve({ status: "error", message: "No storage available." });
        return;
      }

      // Mark these keys as backup
      const backupKeys = new Set();
      for (const key of Object.keys(items)) {
        backupKeys.add(key);
      }

      // Save backup data with metadata flag
      const backupData = {
        ...items,
        __backup_keys__: Array.from(backupKeys),
        __backup_timestamp__: new Date().toISOString(),
        [this.BACKUP_FLAG_KEY]: true // Flag indicating backup data exists
      };

      chrome.storage.local.set(backupData, () => {
        resolve({ status: "ok", message: "Data saved as backup (offline)." });
      });
    });
  }

  // Sync backup data when WebSocket reconnects
  async syncBackupData() {
    // Check if backup flag exists
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve();
        return;
      }

      chrome.storage.local.get([this.BACKUP_FLAG_KEY, '__backup_keys__'], async (result) => {
        if (!result[this.BACKUP_FLAG_KEY]) {
          resolve(); // No backup data to sync
          return;
        }

        const backupKeys = result.__backup_keys__;
        if (backupKeys.length === 0) {
          resolve();
          return;
        }

        // Get all backup data
        chrome.storage.local.get(backupKeys, async (backupData) => {
          if (Object.keys(backupData).length === 0) {
            resolve();
            return;
          }

          try {
            // Send synced data to server via WebSocket
            await this.send('storage_set', { items: backupData });

            // Clear backup markers after successful sync
            const keysToRemove = [this.BACKUP_FLAG_KEY, '__backup_keys__', '__backup_timestamp__'];
            chrome.storage.local.remove(keysToRemove, () => {resolve();});
          } catch (e) {
            console.warn("Failed to sync backup data:", e);
            resolve();
          }
        });
      });
    });
  }

  // Check if WebSocket is active and ready
  isActive() {
    if (!this.wsManager) return false;
    
    // Check if socket exists and is in OPEN state
    const socket = this.wsManager.socket;
    if (!socket) return false;
    
    return socket.readyState === WebSocket.OPEN;
  }

  // Register callback for when WebSocket opens
  onOpen(callback) {
    if (!this.wsManager) return;
    if (typeof this.wsManager.addOnOpenListener === 'function') {
      this.wsManager.addOnOpenListener(callback);
    }
  }
}

// ============================================================================
// ISOMORPHIC STORAGE SERVICE
// ============================================================================

class StorageService {
  constructor() {
    this.strategy = null;
    this.isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    this.initialized = false;
  }

  async init(baseDir = null) {
    if (this.initialized) return;

    if (this.isNode) {
      // Node.js environment
      this.strategy = new NodeFsStrategy();
      await this.strategy.init(baseDir);
    } else {
      // Browser environment
      this.strategy = new WebSocketStrategy();
      await this.strategy.init();
    }

    this.initialized = true;
  }

  // Helper to get data from chrome.storage directly
  getFromChrome(keys) {
    return new Promise((resolve) => {
      if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      } else {
        resolve({});
      }
    });
  }

  // Helper to set data in chrome.storage directly
  setToChrome(items) {
    return new Promise((resolve) => {
      if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(items, () => resolve());
      } else {
        resolve();
      }
    });
  }

  // ========== Unified get/set with new preference order ==========

  async get(keys) {
    if (!this.initialized) await this.init();

    // 1. Try strategy first (fs for Node.js, WebSocket for browser)
    if (this.strategy && this.strategy.isActive && this.strategy.isActive()) {
      return this.strategy.get(keys);
    }

    // 2. Fallback to chrome.storage.local for browser
    return this.getFromChrome(keys);
  }

  async set(items) {
    if (!this.initialized) await this.init();

    if (!items || typeof items !== 'object') return;

    // Strategy handles backup logic internally when inactive
    // (NodeFsStrategy always active, WebSocketStrategy handles backup)
    if (this.strategy && this.strategy.set) {
      return this.strategy.set(items);
    }

    return { status: "error", message: "No storage available." };
  }

  addOnChangedListener(callback) {
    if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes, areaName) => callback(changes, areaName);
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    return () => {};
  }

  // ========== Project CRUD ==========

  // saveProject accepts a single `project` object (must include `id`)
  async saveProject(project) {
    if (!this.initialized) await this.init();
    if (!project || (!project.id && !(project.id === 0))) return { status: 'error', message: 'Project JSON must include an id.' };
    return this.strategy.saveProject(project);
  }

  async loadProject(projectID) {
    if (!this.initialized) await this.init();
    return this.strategy.loadProject(projectID);
  }

  async deleteProject(projectID) {
    if (!this.initialized) await this.init();
    return this.strategy.deleteProject(projectID);
  }

  async listProjects() {
    if (!this.initialized) await this.init();
    return this.strategy.listProjects();
  }

  async archiveProject(projectID) {
    if (!this.initialized) await this.init();
    return this.strategy.archiveProject(projectID);
  }
 
  // Set/get active project (delegates to strategy when available)
  async openProject(projectID) {
    if (!this.initialized) await this.init();
    return this.strategy.openProject(projectID);
  }

  async getActiveProject() {
    if (!this.initialized) await this.init();
    return this.strategy.getActiveProject();
  }

  // ========== Paper CRUD ==========

  // savePaper accepts a single `paper` object (must include `id`)
  async savePaper(paper) {
    if (!this.initialized) await this.init();
    if (!paper || (!paper.id && !(paper.id === 0))) return { status: 'error', message: 'Paper JSON must include an id.' };
    return this.strategy.savePaper(paper);
  }

  async loadPaper(paperId) {
    if (!this.initialized) await this.init();
    return this.strategy.loadPaper(paperId);
  }

  async deletePaper(paperId) {
    if (!this.initialized) await this.init();
    return this.strategy.deletePaper(paperId);
  }

  async listPapers() {
    if (!this.initialized) await this.init();
    return this.strategy.listPapers();
  }

  
  // ============================================================================
}

// Singleton instance
export const storage = new StorageService();

// Optional: export Strategy classes for advanced use cases
export { StorageService, NodeFsStrategy, WebSocketStrategy };
