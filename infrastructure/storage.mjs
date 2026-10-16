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
import {
  normalizeArticleUrl,
  normalizeCategoryMetricType,
  normalizeMetricType,
} from '../core/utils.mjs';
import { wsManager } from './socketManager.mjs';

const ICIPO_DATA_REVISION_KEY = 'icipo_data_revision';

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

  normalizeProjectPhaseCategoryModel(project = {}) {
    const normalized = { ...project };
    const rawCategories = Array.isArray(normalized.categories) ? normalized.categories : [];
    const rawPhases = Array.isArray(normalized.phases) ? normalized.phases : [];

    normalized.categories = rawCategories.map((category) => {
      const next = { ...(category || {}) };
      next.metricType = normalizeCategoryMetricType(
        next.metricType ?? next.metric ?? next.outcome,
        'pending'
      );
      // Phase.categories é a fonte única do vínculo. Category.phases existia
      // em versões anteriores e é migrado abaixo antes de ser descartado.
      delete next.phases;
      return next;
    });

    const categoryLabels = new Set(
      normalized.categories.map(category => category?.label).filter(Boolean)
    );
    normalized.phases = rawPhases.map((phase) => {
      const categories = [...new Set(
        (Array.isArray(phase?.categories) ? phase.categories : [])
          .filter(label => categoryLabels.has(label))
      )];
      const rawPapers = phase?.papers && typeof phase.papers === 'object'
        ? phase.papers
        : {};
      const inheritanceCategoryLabel = categories.includes(phase?.inheritanceCategoryLabel)
        ? phase.inheritanceCategoryLabel
        : null;

      return {
        ...(phase || {}),
        completed: !!phase?.completed,
        categories,
        inheritanceCategoryLabel,
        papers: {
          inheritedAccumulated: Array.isArray(rawPapers.inheritedAccumulated) ? rawPapers.inheritedAccumulated : [],
          inherited: Array.isArray(rawPapers.inherited) ? rawPapers.inherited : [],
          new: Array.isArray(rawPapers.new) ? rawPapers.new : [],
          removed: Array.isArray(rawPapers.removed) ? rawPapers.removed : [],
          selected: Array.isArray(rawPapers.selected) ? rawPapers.selected : [],
        },
      };
    });

    // Migração de projetos que ainda guardavam a relação somente na categoria.
    for (const rawCategory of rawCategories) {
      const categoryLabel = rawCategory?.label;
      if (!categoryLabel || !categoryLabels.has(categoryLabel)) continue;
      for (const phaseLabel of Array.isArray(rawCategory?.phases) ? rawCategory.phases : []) {
        const phase = normalized.phases.find(item => item?.label === phaseLabel);
        if (phase && !phase.categories.includes(categoryLabel)) {
          phase.categories.push(categoryLabel);
        }
      }
    }

    if (!normalized.phases.length) {
      normalized.activePhaseLabel = null;
      return normalized;
    }

    // Criação e progressão são independentes: várias fases podem existir como
    // planejamento, mas somente uma fase não concluída participa da triagem.
    // Mantém a fase ativa persistida quando ela ainda é válida; caso contrário,
    // recupera a primeira fase não concluída na ordem do plano.
    const persistedActive = normalized.phases.find(
      phase => phase?.label === normalized.activePhaseLabel && !phase?.completed
    );
    const firstPendingPhase = normalized.phases.find(phase => !phase?.completed) || null;
    const fallbackPhase = normalized.phases.at(-1) || null;
    normalized.activePhaseLabel = (persistedActive || firstPendingPhase || fallbackPhase)?.label || null;

    // Projetos antigos podem chegar sem categorias vinculadas. Quando já há
    // categorias no projeto, garante ao menos uma opção ativa em cada fase.
    const fallbackCategory = normalized.categories[0]?.label || null;
    if (fallbackCategory) {
      for (const phase of normalized.phases) {
        if (!phase.categories.length) phase.categories = [fallbackCategory];
      }
    }

    const categoryByLabel = new Map(
      normalized.categories.map(category => [category?.label, category])
    );
    for (const phase of normalized.phases) {
      const configuredInheritanceCategory = categoryByLabel.get(phase.inheritanceCategoryLabel);
      if (
        configuredInheritanceCategory
        && phase.categories.includes(configuredInheritanceCategory.label)
        && normalizeCategoryMetricType(configuredInheritanceCategory.metricType, 'pending') === 'pending'
      ) {
        continue;
      }

      const pendingCategory = phase.categories
        .map(label => categoryByLabel.get(label))
        .find(category => normalizeCategoryMetricType(category?.metricType, 'pending') === 'pending');
      phase.inheritanceCategoryLabel = pendingCategory?.label || null;
    }

    return normalized;
  }

  getPhaseScopedStoragePath(projectID, phaseLabel) {
    if (!projectID || !phaseLabel) return null;
    return this.path.join(projectID, 'phases', phaseLabel, 'storage.json');
  }

  normalizePaperReference(value) {
    if (value && typeof value === 'object') {
      if (value.id || value.id === 0) return String(value.id);
      const normalizedUrl = normalizeArticleUrl(value.url || '');
      return normalizedUrl || '';
    }
    if (value || value === 0) return String(value);
    return '';
  }

  readProjectPaperEntries(projectID) {
    const papersDir = this.path.join(this.baseDir, projectID, 'papers');
    if (!this.fs.existsSync(papersDir)) return [];

    const entries = [];
    for (const filename of this.fs.readdirSync(papersDir)) {
      if (!filename.endsWith('.json')) continue;
      const relPath = this.path.join(projectID, 'papers', filename);
      const paper = this.readJson(relPath);
      if (!paper || typeof paper !== 'object') continue;
      if (!paper.id && paper.id !== 0) paper.id = filename.replace(/\.json$/i, '');
      entries.push({ filename, relPath, paper });
    }
    return entries;
  }

  getPaperClassificationForPhase(paper, phaseLabel) {
    if (!paper || !phaseLabel) return null;
    const classifications = paper.classifications
      && typeof paper.classifications === 'object'
      && !Array.isArray(paper.classifications)
      ? paper.classifications
      : {};
    if (classifications[phaseLabel] && typeof classifications[phaseLabel] === 'object') {
      return classifications[phaseLabel];
    }

    const paperPhaseLabel = paper.phaseLabel || paper.phaseId || paper.iterationId || null;
    if (paperPhaseLabel !== phaseLabel) return null;
    return {
      phaseLabel,
      categoryLabel: paper.categoryLabel || null,
      outcome: normalizeMetricType(paper.status, 'pending'),
      classifiedAt: paper.updatedAt || paper.createdAt || null,
      inherited: !!paper.inherited,
      entryType: paper.entryType || (paper.inherited ? 'inherited' : 'new'),
      inheritedFromPhaseLabel: paper.inheritedFromPhaseLabel || null,
    };
  }

  getCategoryMap(project = {}) {
    return new Map(
      (Array.isArray(project.categories) ? project.categories : [])
        .filter(category => category?.label)
        .map(category => [category.label, category])
    );
  }

  getPhasePendingCategory(project, phase) {
    if (!phase) return null;
    const categoryMap = this.getCategoryMap(project);
    const phaseCategoryLabels = Array.isArray(phase.categories) ? phase.categories : [];

    const configured = categoryMap.get(phase.inheritanceCategoryLabel);
    if (
      configured
      && phaseCategoryLabels.includes(configured.label)
      && normalizeCategoryMetricType(configured.metricType, 'pending') === 'pending'
    ) {
      return configured;
    }

    return phaseCategoryLabels
      .map(label => categoryMap.get(label))
      .find(category => normalizeCategoryMetricType(category?.metricType, 'pending') === 'pending')
      || null;
  }

  getPhaseIncludedCategory(project, phase, preferredLabel = null) {
    if (!phase) return null;
    const categoryMap = this.getCategoryMap(project);
    const phaseCategoryLabels = Array.isArray(phase.categories) ? phase.categories : [];
    const preferred = categoryMap.get(preferredLabel);
    if (
      preferred
      && phaseCategoryLabels.includes(preferred.label)
      && normalizeCategoryMetricType(preferred.metricType, 'pending') === 'included'
    ) {
      return preferred;
    }

    return phaseCategoryLabels
      .map(label => categoryMap.get(label))
      .find(category => normalizeCategoryMetricType(category?.metricType, 'pending') === 'included')
      || null;
  }

  normalizeLegacyCarriedPaper(project, phase, sourcePaper = {}) {
    if (!phase || !sourcePaper || typeof sourcePaper !== 'object') {
      return { paper: sourcePaper, changed: false };
    }
    const classification = this.getPaperClassificationForPhase(sourcePaper, phase.label);
    if (!classification) return { paper: sourcePaper, changed: false };

    const entryType = String(classification.entryType || '').toLowerCase();
    const legacyInherited = classification.inherited === true
      || entryType === 'inherited'
      || Boolean(classification.inheritedFromPhaseLabel);
    const outcome = normalizeMetricType(classification.outcome ?? sourcePaper.status, 'pending');
    if (!legacyInherited || outcome !== 'pending') return { paper: sourcePaper, changed: false };

    const targetCategory = this.getPhaseIncludedCategory(project, phase);
    const categoryLabels = new Set(
      (Array.isArray(project.categories) ? project.categories : [])
        .map(category => category?.label)
        .filter(Boolean)
    );
    const nextClassification = {
      ...classification,
      phaseLabel: phase.label,
      categoryLabel: targetCategory?.label || null,
      outcome: 'included',
      inherited: true,
      entryType: 'inherited',
      inheritedFromPhaseLabel: classification.inheritedFromPhaseLabel || phase.parentLabel || phase.parent || null,
    };
    const classifications = sourcePaper.classifications
      && typeof sourcePaper.classifications === 'object'
      && !Array.isArray(sourcePaper.classifications)
      ? { ...sourcePaper.classifications, [phase.label]: nextClassification }
      : { [phase.label]: nextClassification };
    const currentPhaseLabel = sourcePaper.phaseLabel || sourcePaper.phaseId || sourcePaper.iterationId || null;
    const baseTags = (Array.isArray(sourcePaper.tags) ? sourcePaper.tags : [])
      .filter(tag => !categoryLabels.has(tag) && tag !== 'duplicado-automatico');
    const nextTags = targetCategory?.label
      ? [...new Set([...baseTags, targetCategory.label])]
      : baseTags;

    return {
      changed: true,
      paper: {
        ...sourcePaper,
        classifications,
        ...(currentPhaseLabel === phase.label ? {
          status: 'included',
          categoryLabel: targetCategory?.label || null,
          inherited: true,
          entryType: 'inherited',
          inheritedFromPhaseLabel: nextClassification.inheritedFromPhaseLabel,
          tags: nextTags,
          highlightedColor: targetCategory?.color || sourcePaper.highlightedColor || '',
        } : {}),
      },
    };
  }

  syncPhasePaperBuckets(projectID, project, { persist = false } = {}) {
    if (!project || !Array.isArray(project.phases)) return project;

    const paperEntries = this.readProjectPaperEntries(projectID);
    let accumulatedInherited = new Set();

    for (const phase of project.phases) {
      const existingPapers = phase?.papers && typeof phase.papers === 'object'
        ? phase.papers
        : {};
      const inherited = new Set();
      const pending = new Set();
      const selected = new Set();
      const removed = new Set();
      let classifiedRecords = 0;

      for (const entry of paperEntries) {
        let paper = entry.paper;
        if (paper?.visited === false) continue;
        const migrated = this.normalizeLegacyCarriedPaper(project, phase, paper);
        if (migrated.changed) {
          paper = migrated.paper;
          entry.paper = paper;
          this.writeJson(entry.relPath, paper);
        }
        const classification = this.getPaperClassificationForPhase(paper, phase.label);
        if (!classification) continue;

        classifiedRecords += 1;
        const reference = this.normalizePaperReference(paper);
        if (!reference) continue;

        const entryType = String(classification.entryType || '').toLowerCase();
        const legacyInherited = classification.inherited === true
          || entryType === 'inherited'
          || Boolean(classification.inheritedFromPhaseLabel);

        const outcome = normalizeMetricType(classification.outcome ?? paper.status, 'pending');
        // Artigos que chegaram selecionados da fase anterior pertencem ao grupo
        // Herdados. Eles nunca voltam para Pendentes e também não contam como
        // Selecionados da fase atual até uma nova decisão nesta fase.
        if (legacyInherited) inherited.add(reference);
        else if (outcome === 'included') selected.add(reference);
        else if (outcome === 'excluded' || outcome === 'duplicate') removed.add(reference);
        else pending.add(reference);
      }

      // Compatibilidade com projetos anteriores, cujos contadores existiam
      // somente em Phase.papers. Assim que houver classificações persistidas,
      // os quatro grupos passam a ser integralmente derivados dos artigos.
      if (classifiedRecords === 0) {
        const legacyInheritedRefs = new Set();
        for (const value of Array.isArray(existingPapers.inherited) ? existingPapers.inherited : []) {
          const reference = this.normalizePaperReference(value);
          if (reference) {
            legacyInheritedRefs.add(reference);
            inherited.add(reference);
          }
        }
        for (const value of Array.isArray(existingPapers.new) ? existingPapers.new : []) {
          const reference = this.normalizePaperReference(value);
          if (reference && !legacyInheritedRefs.has(reference)) pending.add(reference);
        }
        for (const value of Array.isArray(existingPapers.selected) ? existingPapers.selected : []) {
          const reference = this.normalizePaperReference(value);
          // Em dados legados o mesmo artigo pode ter sido salvo como Herdado e
          // Selecionado. Herdado sempre prevalece: Selecionados representa
          // exclusivamente decisões realizadas nesta fase.
          if (reference && !legacyInheritedRefs.has(reference)) selected.add(reference);
        }
        for (const value of Array.isArray(existingPapers.removed) ? existingPapers.removed : []) {
          const reference = this.normalizePaperReference(value);
          if (reference) removed.add(reference);
        }
      }

      const legacyAccumulated = (Array.isArray(existingPapers.inheritedAccumulated)
        ? existingPapers.inheritedAccumulated
        : [])
        .map(value => this.normalizePaperReference(value))
        .filter(Boolean);
      accumulatedInherited = new Set([
        ...accumulatedInherited,
        ...legacyAccumulated,
        ...inherited,
      ]);

      const scopedPath = this.getPhaseScopedStoragePath(projectID, phase.label);
      const scopedStorage = scopedPath ? (this.readJson(scopedPath) || {}) : {};
      if (Array.isArray(scopedStorage.svat_papers)) {
        let scopedChanged = false;
        scopedStorage.svat_papers = scopedStorage.svat_papers.map(scopedPaper => {
          const migrated = this.normalizeLegacyCarriedPaper(project, phase, scopedPaper);
          if (migrated.changed) scopedChanged = true;
          return migrated.paper;
        });
        if (scopedChanged) {
          const nextHighlights = { ...(scopedStorage.highlightedLinks || {}) };
          for (const scopedPaper of scopedStorage.svat_papers) {
            if (scopedPaper?.url && scopedPaper?.highlightedColor) {
              nextHighlights[scopedPaper.url] = scopedPaper.highlightedColor;
            }
          }
          scopedStorage.highlightedLinks = nextHighlights;
          this.writeJson(scopedPath, scopedStorage);
        }
      }

      // Garantia final: um artigo herdado nunca pode ser contabilizado também
      // como selecionado na mesma fase.
      for (const reference of inherited) selected.delete(reference);

      phase.papers = {
        inheritedAccumulated: [...accumulatedInherited],
        // Artigos selecionados na fase anterior e carregados para esta fase.
        inherited: [...inherited],
        // "new" contém somente entradas realmente novas e ainda sem decisão.
        new: [...pending],
        selected: [...selected],
        // Artigos excluídos deixam a fila e são removidos da progressão para a fase seguinte.
        removed: [...removed],
      };
    }

    if (persist) {
      project.updatedAt = new Date().toISOString();
      this.writeJson(this.path.join(projectID, 'project.json'), project);
      if (this.activeProjectID === projectID) this.activeProjectData = project;
    }

    return project;
  }

  collectIncludedPapersForPhase(projectID, phaseLabel) {
    if (!phaseLabel) return [];

    const byIdentity = new Map();
    const mergePaper = (paper) => {
      if (!paper || typeof paper !== 'object' || paper.visited === false) return;
      const identity = (paper.id || paper.id === 0)
        ? `id:${String(paper.id)}`
        : `url:${normalizeArticleUrl(paper.url || '')}`;
      if (!identity || identity === 'url:') return;

      const existing = byIdentity.get(identity) || {};
      const mergedClassifications = {
        ...(existing.classifications && typeof existing.classifications === 'object' ? existing.classifications : {}),
        ...(paper.classifications && typeof paper.classifications === 'object' ? paper.classifications : {}),
      };
      byIdentity.set(identity, {
        ...existing,
        ...paper,
        classifications: mergedClassifications,
      });
    };

    for (const { paper } of this.readProjectPaperEntries(projectID)) mergePaper(paper);

    const previousScopedPath = this.getPhaseScopedStoragePath(projectID, phaseLabel);
    const previousScoped = previousScopedPath ? (this.readJson(previousScopedPath) || {}) : {};
    for (const paper of Array.isArray(previousScoped.svat_papers) ? previousScoped.svat_papers : []) {
      mergePaper(paper);
    }

    return [...byIdentity.values()].filter((paper) => {
      const classification = this.getPaperClassificationForPhase(paper, phaseLabel);
      return classification
        && normalizeMetricType(classification.outcome ?? paper.status, 'pending') === 'included';
    });
  }

  inheritIncludedPapers(projectID, project, previousPhase, nextPhase, { activateNextPhase = true } = {}) {
    const inheritedPapers = previousPhase
      ? this.collectIncludedPapersForPhase(projectID, previousPhase.label)
      : [];
    // Artigos selecionados que avançam não voltam para Pendente.
    // Uma categoria de inclusão da próxima fase é usada quando disponível.
    nextPhase.inheritanceCategoryLabel = null;
    const inheritedAt = new Date().toISOString();
    const categoryLabels = new Set(
      (Array.isArray(project.categories) ? project.categories : [])
        .map(category => category?.label)
        .filter(Boolean)
    );
    const scopedPapers = [];
    const highlightedLinks = {};
    const inheritedReferences = [];

    for (const sourcePaper of inheritedPapers) {
      const paperId = sourcePaper.id || sourcePaper.id === 0
        ? sourcePaper.id
        : this.normalizePaperReference(sourcePaper);
      if (!paperId && paperId !== 0) continue;

      const classifications = sourcePaper.classifications
        && typeof sourcePaper.classifications === 'object'
        && !Array.isArray(sourcePaper.classifications)
        ? { ...sourcePaper.classifications }
        : {};
      const sourceClassification = this.getPaperClassificationForPhase(sourcePaper, previousPhase?.label);
      const targetCategory = this.getPhaseIncludedCategory(
        project,
        nextPhase,
        sourceClassification?.categoryLabel || sourcePaper.categoryLabel || null
      );
      classifications[nextPhase.label] = {
        phaseLabel: nextPhase.label,
        categoryLabel: targetCategory?.label || null,
        outcome: 'included',
        classifiedAt: inheritedAt,
        inherited: true,
        entryType: 'inherited',
        inheritedFromPhaseLabel: previousPhase?.label || null,
      };

      const baseTags = (Array.isArray(sourcePaper.tags) ? sourcePaper.tags : [])
        .filter(tag => !categoryLabels.has(tag) && tag !== 'duplicado-automatico');
      const tags = targetCategory?.label
        ? [...new Set([...baseTags, targetCategory.label])]
        : baseTags;
      const history = Array.isArray(sourcePaper.history) ? [...sourcePaper.history] : [];
      history.push({
        ts: inheritedAt,
        action: 'carry_forward',
        details: {
          fromPhaseLabel: previousPhase?.label || null,
          toPhaseLabel: nextPhase.label,
          category: targetCategory?.label || null,
          metricType: 'included',
        },
      });

      const inheritedPaper = {
        ...sourcePaper,
        id: paperId,
        status: 'included',
        categoryLabel: targetCategory?.label || null,
        phaseLabel: nextPhase.label,
        iterationId: nextPhase.label,
        classifications,
        tags,
        visited: true,
        inherited: true,
        entryType: 'inherited',
        inheritedFromPhaseLabel: previousPhase?.label || null,
        updatedAt: inheritedAt,
        history,
      };

      const relPath = this.path.join(projectID, 'papers', `${paperId}.json`);
      this.writeJson(relPath, inheritedPaper);
      scopedPapers.push(inheritedPaper);
      inheritedReferences.push(String(paperId));
      if (inheritedPaper.url && targetCategory?.color) {
        highlightedLinks[inheritedPaper.url] = targetCategory.color;
      }
    }

    const previousScopedPath = previousPhase
      ? this.getPhaseScopedStoragePath(projectID, previousPhase.label)
      : null;
    const previousScoped = previousScopedPath ? (this.readJson(previousScopedPath) || {}) : {};
    const previousScopedProject = previousScoped.svat_project
      && typeof previousScoped.svat_project === 'object'
      ? previousScoped.svat_project
      : {};
    const scopedProject = {
      ...previousScopedProject,
      id: project.id || projectID,
      title: project.name || project.title || previousScopedProject.title || 'Projeto',
      activePhaseLabel: activateNextPhase
        ? nextPhase.label
        : (project.activePhaseLabel || previousScopedProject.activePhaseLabel || nextPhase.label),
      currentIterationId: activateNextPhase
        ? nextPhase.label
        : (project.currentIterationId || previousScopedProject.currentIterationId || nextPhase.label),
      updatedAt: inheritedAt,
    };

    const nextScopedPath = this.getPhaseScopedStoragePath(projectID, nextPhase.label);
    this.writeJson(nextScopedPath, {
      highlightedLinks,
      svat_papers: scopedPapers,
      svat_project: scopedProject,
    });

    nextPhase.papers = {
      inheritedAccumulated: [
        ...new Set([
          ...(Array.isArray(previousPhase?.papers?.inheritedAccumulated)
            ? previousPhase.papers.inheritedAccumulated.map(value => this.normalizePaperReference(value))
            : []),
          ...inheritedReferences,
        ].filter(Boolean)),
      ],
      inherited: inheritedReferences,
      new: [],
      removed: [],
      selected: [],
    };

    return {
      status: 'ok',
      inheritedCount: inheritedReferences.length,
      pendingCategoryLabel: null,
    };
  }

  inheritIncludedPapersForNewPhase(projectID, project, previousPhase, nextPhase) {
    return this.inheritIncludedPapers(projectID, project, previousPhase, nextPhase, {
      activateNextPhase: false,
    });
  }

  cleanupDeletedPhasePaperReferences(projectID, deletedPhaseLabel, fallbackPhaseLabel = null) {
    const papersDir = this.path.join(this.baseDir, projectID, 'papers');
    if (!this.fs.existsSync(papersDir)) return;

    for (const filename of this.fs.readdirSync(papersDir)) {
      if (!filename.endsWith('.json')) continue;
      const relPath = this.path.join(projectID, 'papers', filename);
      const paper = this.readJson(relPath);
      if (!paper || typeof paper !== 'object') continue;

      let changed = false;
      const classifications = paper.classifications
        && typeof paper.classifications === 'object'
        && !Array.isArray(paper.classifications)
        ? { ...paper.classifications }
        : {};

      if (Object.prototype.hasOwnProperty.call(classifications, deletedPhaseLabel)) {
        delete classifications[deletedPhaseLabel];
        paper.classifications = classifications;
        changed = true;
      }

      if (paper.phaseLabel === deletedPhaseLabel || paper.iterationId === deletedPhaseLabel) {
        const fallbackClassification = fallbackPhaseLabel
          ? classifications[fallbackPhaseLabel]
          : null;
        const latestClassification = fallbackClassification || Object.values(classifications)
          .filter(item => item && typeof item === 'object')
          .sort((a, b) => String(b.classifiedAt || '').localeCompare(String(a.classifiedAt || '')))[0]
          || null;

        paper.phaseLabel = latestClassification?.phaseLabel || fallbackPhaseLabel || null;
        paper.iterationId = paper.phaseLabel;
        paper.categoryLabel = latestClassification?.categoryLabel || null;
        paper.status = normalizeMetricType(latestClassification?.outcome, 'pending');
        paper.inherited = latestClassification?.inherited === true
          || String(latestClassification?.entryType || '').toLowerCase() === 'inherited';
        paper.entryType = latestClassification?.entryType || (paper.inherited ? 'inherited' : 'new');
        paper.inheritedFromPhaseLabel = latestClassification?.inheritedFromPhaseLabel || null;
        paper.updatedAt = new Date().toISOString();
        changed = true;
      }

      if (!Object.keys(classifications).length) {
        paper.phaseLabel = null;
        paper.iterationId = null;
        paper.categoryLabel = null;
        paper.status = 'pending';
        paper.inherited = false;
        paper.entryType = 'new';
        paper.inheritedFromPhaseLabel = null;
        paper.visited = false;
        paper.updatedAt = new Date().toISOString();
        changed = true;
      }

      if (changed) this.writeJson(relPath, paper);
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

    if (
      Array.isArray(existing.phases)
      && existing.phases.length > 0
      && Array.isArray(project.phases)
      && project.phases.length === 0
    ) {
      return { status: 'error', message: 'O projeto deve manter pelo menos uma fase.' };
    }

    if (
      Array.isArray(existing.categories)
      && existing.categories.length > 0
      && Array.isArray(project.categories)
      && project.categories.length === 0
    ) {
      return { status: 'error', message: 'O projeto deve manter pelo menos uma categoria.' };
    }

    // Merge: preserve existing properties, override/add with incoming projectData
    const merged = this.normalizeProjectPhaseCategoryModel({ ...existing, ...project });
    this.syncPhasePaperBuckets(projectID, merged);

    console.log(`Saving project ${projectID} to disk at ${relPath}...`, merged);

    // Write merged project data
    this.writeJson(relPath, merged);

    // Keep the active project cache synchronized with project.json.
    // get_active_project is used by the Dashboard reload and by the
    // background service worker when rebuilding the Google Scholar menu.
    if (this.activeProjectID === projectID) {
      this.activeProjectData = merged;
    }

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
    try {
      const rawData = this.readJson(relPath);
      if (!rawData) return { status: 'error', message: 'Projeto não encontrado.' };
      const data = this.normalizeProjectPhaseCategoryModel(rawData);
      this.syncPhasePaperBuckets(projectID, data);
      if (JSON.stringify(rawData) !== JSON.stringify(data)) this.writeJson(relPath, data);
      return { status: 'ok', data };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }

  // Keep a project loaded in memory as "active"
  async openProject(projectID) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawData = this.readJson(relPath);
    if (!rawData) return { status: 'error', message: 'Projeto não encontrado.' };
    const data = this.normalizeProjectPhaseCategoryModel(rawData);
    this.syncPhasePaperBuckets(projectID, data);
    if (JSON.stringify(rawData) !== JSON.stringify(data)) {
      this.writeJson(relPath, data);
    }
    this.activeProjectID = projectID;
    this.activeProjectData = data;
    this.migrateLegacyScopedData();

    return { status: 'ok', data };
  }

  getActiveProject() {
    return { status: 'ok', data: this.activeProjectData };
  }

  async deleteProject(projectID) {
    const full = this.path.join(this.baseDir, projectID);
    // remove from config.json
    const {status} = await this.archiveProject(projectID);

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

    const projectPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(projectPath);
    if (rawProject) {
      const project = this.normalizeProjectPhaseCategoryModel(rawProject);
      this.syncPhasePaperBuckets(projectID, project, { persist: true });
    }

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
    const projectID = this.activeProjectID;
    const full = this.path.join(this.baseDir, projectID, 'papers', `${paperId}.json`);
    if (this.fs.existsSync(full)) {
      this.fs.unlinkSync(full);
      const rawProject = this.readJson(this.path.join(projectID, 'project.json'));
      if (rawProject) {
        const project = this.normalizeProjectPhaseCategoryModel(rawProject);
        this.syncPhasePaperBuckets(projectID, project, { persist: true });
      }
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
  get scopedStorageKeys() {
    return new Set(['highlightedLinks', 'svat_papers', 'svat_project']);
  }

  getScopedStoragePath() {
    if (!this.activeProjectID) return null;
    const phaseLabel = this.activeProjectData?.activePhaseLabel || '_sem_fase';
    return this.path.join(this.activeProjectID, 'phases', phaseLabel, 'storage.json');
  }

  migrateLegacyScopedData() {
    const relPath = this.getScopedStoragePath();
    if (!relPath || this.readJson(relPath)) return;

    const config = this.readJson('config.json') || {};
    const legacy = {};
    for (const key of this.scopedStorageKeys) {
      if (key in config) {
        legacy[key] = config[key];
        delete config[key];
      }
    }

    if (Object.keys(legacy).length > 0) {
      this.writeJson(relPath, legacy);
      this.writeJson('config.json', config);
    }
  }

  async get(keys) {
    const config = this.readJson("config.json") || {};
    const scoped = this.getScopedStoragePath()
      ? (this.readJson(this.getScopedStoragePath()) || {})
      : {};

    if (!keys || keys.length === 0) {
      return { ...config, ...scoped };
    }

    const result = {};
    const keyArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [];

    for (const key of keyArray) {
      const source = this.scopedStorageKeys.has(key) ? scoped : config;
      if (key in source) {
        result[key] = source[key];
      }
    }
    return result;
  }

  async set(items) {
    if (!items || typeof items !== 'object') return;

    const config = this.readJson("config.json") || {};
    const scopedItems = {};
    const globalItems = {};
    for (const [key, value] of Object.entries(items)) {
      (this.scopedStorageKeys.has(key) ? scopedItems : globalItems)[key] = value;
    }

    if (Object.keys(globalItems).length > 0) {
      this.writeJson("config.json", { ...config, ...globalItems });
    }

    if (Object.keys(scopedItems).length > 0) {
      const relPath = this.getScopedStoragePath();
      if (!relPath) {
        return { status: "error", message: "Abra um projeto antes de salvar links." };
      }
      const scoped = this.readJson(relPath) || {};
      this.writeJson(relPath, { ...scoped, ...scopedItems });
    }

    return { status: "ok", message: "Data saved." };
  }

  async getAllHighlightedLinksForActiveProject() {
    if (!this.activeProjectID) {
      return { status: 'error', message: 'Nenhum projeto ativo.', data: {} };
    }

    const rawProject = this.readJson(this.path.join(this.activeProjectID, 'project.json'))
      || this.activeProjectData
      || {};
    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    const phases = Array.isArray(project.phases) ? project.phases : [];
    const categoryMap = this.getCategoryMap(project);
    const highlightedLinks = {};
    const allProjectPapers = this.readProjectPaperEntries(this.activeProjectID)
      .map(entry => entry.paper)
      .filter(paper => paper && typeof paper === 'object' && paper.visited !== false);

    for (const paper of allProjectPapers) {
      const normalizedUrl = normalizeArticleUrl(paper.url || '');
      if (!normalizedUrl) continue;

      const classifications = paper.classifications
        && typeof paper.classifications === 'object'
        && !Array.isArray(paper.classifications)
        ? paper.classifications
        : {};

      const classifiedEntries = Object.entries(classifications)
        .map(([phaseLabel, classification]) => ({
          phaseLabel,
          classification,
        }))
        .filter(item => item.classification && item.classification.categoryLabel)
        .sort((first, second) => String(second.classification?.classifiedAt || '').localeCompare(String(first.classification?.classifiedAt || '')));

      const latestClassification = classifiedEntries[0];
      if (!latestClassification) continue;

      const category = categoryMap.get(latestClassification.classification.categoryLabel)
        || null;
      if (!category) continue;

      const rawUrl = String(paper.url || '').trim();
      if (!rawUrl) continue;
      highlightedLinks[rawUrl] = category.color || 'yellow';
    }

    return {
      status: 'ok',
      data: {
        highlightedLinks,
        svat_papers: allProjectPapers,
        svat_project: project,
      },
    };
  }

  normalizePhase(phaseData = {}, existing = {}) {
    const title = (phaseData.title ?? existing.title ?? '').toString().trim();
    const labelSource = (phaseData.label ?? existing.label ?? title).toString().trim();
    const label = labelSource
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || `fase_${Date.now().toString(36)}`;

    const criteria = Array.isArray(phaseData.criteria)
      ? phaseData.criteria
      : typeof phaseData.criteria === 'string'
        ? phaseData.criteria.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean)
        : Array.isArray(existing.criteria) ? existing.criteria : [];
    const categories = [...new Set(
      (Array.isArray(phaseData.categories)
        ? phaseData.categories
        : (Array.isArray(existing.categories) ? existing.categories : []))
        .filter(Boolean)
    )];
    const requestedInheritanceCategory = phaseData.inheritanceCategoryLabel
      ?? existing.inheritanceCategoryLabel
      ?? null;
    const existingPapers = existing?.papers && typeof existing.papers === 'object'
      ? existing.papers
      : {};

    return {
      label,
      title,
      description: phaseData.description ?? existing.description ?? '',
      completed: typeof phaseData.completed === 'boolean' ? phaseData.completed : !!existing.completed,
      categories,
      inheritanceCategoryLabel: categories.includes(requestedInheritanceCategory)
        ? requestedInheritanceCategory
        : null,
      criteria,
      papers: {
        inheritedAccumulated: Array.isArray(existingPapers.inheritedAccumulated) ? existingPapers.inheritedAccumulated : [],
        inherited: Array.isArray(existingPapers.inherited) ? existingPapers.inherited : [],
        new: Array.isArray(existingPapers.new) ? existingPapers.new : [],
        removed: Array.isArray(existingPapers.removed) ? existingPapers.removed : [],
        selected: Array.isArray(existingPapers.selected) ? existingPapers.selected : [],
      },
    };
  }

  async savePhase(projectID, phaseData) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(relPath);

    console.log('🧭 NodeFsStrategy.savePhase', { projectID, phaseData, relPath });

    if (!rawProject) {
      return { status: 'error', message: 'Projeto não encontrado.' };
    }

    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    if (!Array.isArray(project.phases)) project.phases = [];
    if (!Array.isArray(project.categories)) project.categories = [];
    this.syncPhasePaperBuckets(projectID, project);

    const phase = this.normalizePhase(phaseData);
    // A criação serve apenas para montar o plano de pesquisa. Toda nova fase
    // nasce pendente/planejada e não recebe artigos até chegar a sua vez na
    // progressão sequencial.
    phase.completed = false;
    if (project.phases.some((item) => item.label === phase.label)) {
      return { status: 'error', message: `Já existe uma fase com o rótulo "${phase.label}".` };
    }

    const categoryLabels = new Set(project.categories.map(category => category?.label).filter(Boolean));
    const invalidCategories = phase.categories.filter(label => !categoryLabels.has(label));
    if (invalidCategories.length) {
      return { status: 'error', message: `Categorias inexistentes: ${invalidCategories.join(', ')}.` };
    }
    if (project.categories.length && !phase.categories.length) {
      return { status: 'error', message: 'Selecione pelo menos uma categoria para a nova fase.' };
    }

    project.phases.push(phase);
    // Somente a primeira fase é ativada no momento da criação. As seguintes
    // permanecem planejadas até a fase ativa ser concluída.
    if (!project.activePhaseLabel) project.activePhaseLabel = phase.label;

    const previousPhase = project.phases.length > 1
      ? project.phases[project.phases.length - 2]
      : null;
    if (previousPhase) {
      const inheritanceResult = this.inheritIncludedPapersForNewPhase(projectID, project, previousPhase, phase);
      if (inheritanceResult?.status === 'error') return inheritanceResult;
    }

    project.updatedAt = new Date().toISOString();
    this.syncPhasePaperBuckets(projectID, project);

    this.writeJson(relPath, project);
    if (this.activeProjectID === projectID) this.activeProjectData = project;

    console.log('✅ Fase salva no project.json:', phase);
    return {
      status: 'ok',
      message: project.activePhaseLabel === phase.label && project.phases.length === 1
        ? 'Primeira fase salva e ativada com sucesso.'
        : 'Fase adicionada ao plano de pesquisa. Ela será ativada quando chegar sua vez.',
      data: {
        ...phase,
        inheritedCount: 0,
        activePhaseLabel: project.activePhaseLabel,
      },
    };
  }

  async updatePhase(projectID, phaseLabel, phaseData) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(relPath);

    console.log('🧭 NodeFsStrategy.updatePhase', { projectID, phaseLabel, phaseData, relPath });

    if (!rawProject) return { status: 'error', message: 'Projeto não encontrado.' };
    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    if (!Array.isArray(project.phases)) project.phases = [];
    if (!Array.isArray(project.categories)) project.categories = [];
    this.syncPhasePaperBuckets(projectID, project);

    const idx = project.phases.findIndex((p) => p.label === phaseLabel);
    if (idx === -1) return { status: 'error', message: 'Fase não encontrada.' };

    const current = project.phases[idx];
    const phase = this.normalizePhase(phaseData, current);

    const duplicate = project.phases.some((p, i) => i !== idx && p.label === phase.label);
    if (duplicate) return { status: 'error', message: `Já existe uma fase com o rótulo "${phase.label}".` };

    const categoryLabels = new Set(project.categories.map(category => category?.label).filter(Boolean));
    const invalidCategories = phase.categories.filter(label => !categoryLabels.has(label));
    if (invalidCategories.length) {
      return { status: 'error', message: `Categorias inexistentes: ${invalidCategories.join(', ')}.` };
    }
    if (project.categories.length && !phase.categories.length) {
      return { status: 'error', message: 'A fase deve manter pelo menos uma categoria ativa.' };
    }

    phase.inheritanceCategoryLabel = this.getPhasePendingCategory(project, phase)?.label || null;
    const pendingCount = Array.isArray(phase?.papers?.new) ? phase.papers.new.length : 0;
    const isActivePhase = project.activePhaseLabel === phaseLabel;
    const isCompletingNow = !current.completed && phase.completed;
    const isReopening = current.completed && !phase.completed;

    if (isCompletingNow && !isActivePhase) {
      return {
        status: 'error',
        message: 'Somente a fase ativa pode ser concluída. As fases futuras permanecem planejadas até chegar a vez delas.',
      };
    }
    if (isCompletingNow && pendingCount > 0) {
      return {
        status: 'error',
        message: `Classifique os ${pendingCount} artigo(s) pendente(s) como incluídos ou excluídos antes de concluir esta fase.`,
      };
    }

    let nextPhase = idx < project.phases.length - 1 ? project.phases[idx + 1] : null;
    let inheritanceResult = null;
    if (isCompletingNow && nextPhase) {
      inheritanceResult = this.inheritIncludedPapers(projectID, project, current, nextPhase);
      if (inheritanceResult?.status === 'error') return inheritanceResult;
    }

    project.phases[idx] = phase;
    if (isActivePhase) {
      project.activePhaseLabel = isCompletingNow
        ? (nextPhase?.label || phase.label)
        : phase.label;
    }
    project.updatedAt = new Date().toISOString();

    if (phase.label !== phaseLabel) {
      const oldPhaseDir = this.path.join(this.baseDir, projectID, 'phases', phaseLabel);
      const newPhaseDir = this.path.join(this.baseDir, projectID, 'phases', phase.label);
      if (this.fs.existsSync(oldPhaseDir) && !this.fs.existsSync(newPhaseDir)) {
        this.ensureDir(this.path.dirname(newPhaseDir));
        this.fs.renameSync(oldPhaseDir, newPhaseDir);
      }

      // O storage da fase também contém cópias escopadas dos artigos. Ao
      // renomear a fase, atualiza essas referências para que a tabela, as
      // métricas e as próximas reclassificações usem o novo rótulo.
      const scopedStoragePath = this.path.join(projectID, 'phases', phase.label, 'storage.json');
      const scopedStorage = this.readJson(scopedStoragePath);
      if (scopedStorage && typeof scopedStorage === 'object') {
        let scopedChanged = false;
        const scopedPapers = Array.isArray(scopedStorage.svat_papers)
          ? scopedStorage.svat_papers.map((paper) => {
              if (!paper || typeof paper !== 'object') return paper;
              const nextPaper = { ...paper };
              let paperChanged = false;

              const classifications = nextPaper.classifications
                && typeof nextPaper.classifications === 'object'
                && !Array.isArray(nextPaper.classifications)
                ? { ...nextPaper.classifications }
                : {};
              if (classifications[phaseLabel]) {
                classifications[phase.label] = {
                  ...classifications[phaseLabel],
                  phaseLabel: phase.label,
                };
                delete classifications[phaseLabel];
                nextPaper.classifications = classifications;
                paperChanged = true;
              }
              if (nextPaper.phaseLabel === phaseLabel) {
                nextPaper.phaseLabel = phase.label;
                paperChanged = true;
              }
              if (nextPaper.iterationId === phaseLabel) {
                nextPaper.iterationId = phase.label;
                paperChanged = true;
              }
              if (paperChanged) nextPaper.updatedAt = new Date().toISOString();
              scopedChanged = scopedChanged || paperChanged;
              return nextPaper;
            })
          : scopedStorage.svat_papers;

        const scopedProject = scopedStorage.svat_project
          && typeof scopedStorage.svat_project === 'object'
          ? { ...scopedStorage.svat_project }
          : null;
        if (scopedProject) {
          if (scopedProject.activePhaseLabel === phaseLabel) {
            scopedProject.activePhaseLabel = phase.label;
            scopedChanged = true;
          }
          if (scopedProject.currentIterationId === phaseLabel) {
            scopedProject.currentIterationId = phase.label;
            scopedChanged = true;
          }
        }

        if (scopedChanged) {
          this.writeJson(scopedStoragePath, {
            ...scopedStorage,
            svat_papers: scopedPapers,
            ...(scopedProject ? { svat_project: scopedProject } : {}),
          });
        }
      }

      const papersDir = this.path.join(this.baseDir, projectID, 'papers');
      if (this.fs.existsSync(papersDir)) {
        for (const filename of this.fs.readdirSync(papersDir)) {
          if (!filename.endsWith('.json')) continue;
          const paperPath = this.path.join(projectID, 'papers', filename);
          const paper = this.readJson(paperPath);
          if (!paper || typeof paper !== 'object') continue;
          let changed = false;
          if (paper.classifications?.[phaseLabel]) {
            paper.classifications[phase.label] = {
              ...paper.classifications[phaseLabel],
              phaseLabel: phase.label,
            };
            delete paper.classifications[phaseLabel];
            changed = true;
          }
          if (paper.phaseLabel === phaseLabel) {
            paper.phaseLabel = phase.label;
            changed = true;
          }
          if (paper.iterationId === phaseLabel) {
            paper.iterationId = phase.label;
            changed = true;
          }
          if (changed) this.writeJson(paperPath, paper);
        }
      }
    }

    this.syncPhasePaperBuckets(projectID, project);
    this.writeJson(relPath, project);
    if (this.activeProjectID === projectID) this.activeProjectData = project;

    console.log('✅ Fase atualizada no project.json:', phase);
    return {
      status: 'ok',
      message: isCompletingNow
        ? (nextPhase
          ? `Fase concluída. A próxima fase foi ativada com ${inheritanceResult?.inheritedCount || 0} artigo(s) selecionado(s) transferido(s).`
          : 'Fase concluída. O plano de pesquisa não possui outra fase para ativar.')
        : 'Fase atualizada com sucesso.',
      data: {
        ...phase,
        activePhaseLabel: project.activePhaseLabel,
        inheritedCount: inheritanceResult?.inheritedCount || 0,
      },
    };
  }

  async deletePhase(projectID, phaseLabel) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(relPath);

    console.log('🧭 NodeFsStrategy.deletePhase', { projectID, phaseLabel, relPath });

    if (!rawProject) return { status: 'error', message: 'Projeto não encontrado.' };
    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    if (!Array.isArray(project.phases)) project.phases = [];

    if (project.phases.length <= 1) {
      return { status: 'error', message: 'O projeto deve manter pelo menos uma fase.' };
    }

    const phaseIndex = project.phases.findIndex((p) => p.label === phaseLabel);
    if (phaseIndex === -1) return { status: 'error', message: 'Fase não encontrada.' };

    const activePhaseIndex = project.phases.findIndex((p) => p.label === project.activePhaseLabel);
    if (activePhaseIndex === -1) {
      return {
        status: 'error',
        message: 'Não foi possível localizar a fase ativa do projeto.',
      };
    }
    if (phaseIndex < activePhaseIndex) {
      return {
        status: 'error',
        message: 'Somente a fase ativa ou fases planejadas depois dela podem ser excluídas. O histórico anterior está protegido.'
      };
    }

    project.phases.splice(phaseIndex, 1);
    const previousPhase = phaseIndex > 0 ? project.phases[phaseIndex - 1] : null;
    if (previousPhase) {
      previousPhase.completed = false;
      project.activePhaseLabel = previousPhase.label;
    }
    const nextActivePhase = previousPhase
      || project.phases[phaseIndex]
      || project.phases.find((p) => !p.completed)
      || project.phases.at(-1)
      || null;

    const phaseDir = this.path.join(this.baseDir, projectID, 'phases', phaseLabel);
    if (this.fs.existsSync(phaseDir)) {
      this.fs.rmSync(phaseDir, { recursive: true, force: true });
    }
    this.cleanupDeletedPhasePaperReferences(projectID, phaseLabel, nextActivePhase?.label || previousPhase?.label || null);

    if (project.activePhaseLabel === phaseLabel) {
      project.activePhaseLabel = nextActivePhase?.label || null;
    }

    project.updatedAt = new Date().toISOString();
    this.syncPhasePaperBuckets(projectID, project);
    this.writeJson(relPath, project);
    if (this.activeProjectID === projectID) this.activeProjectData = project;

    console.log('✅ Fase removida do project.json:', phaseLabel);
    return { status: 'ok', message: 'Fase removida com sucesso.', data: { activePhaseLabel: project.activePhaseLabel || null } };
  }

  async reorderPhases(projectID, orderedLabels = []) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(relPath);
    if (!rawProject) return { status: 'error', message: 'Projeto não encontrado.' };

    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    const phases = Array.isArray(project.phases) ? project.phases : [];
    const activeIndex = phases.findIndex((phase) => phase?.label === project.activePhaseLabel);
    if (activeIndex < 0) return { status: 'error', message: 'Fase ativa não encontrada.' };

    const currentLabels = phases.map((phase) => phase?.label).filter(Boolean);
    if (!Array.isArray(orderedLabels) || orderedLabels.length !== currentLabels.length) {
      return { status: 'error', message: 'Ordem de fases inválida.' };
    }
    const unique = new Set(orderedLabels);
    if (unique.size !== currentLabels.length || currentLabels.some((label) => !unique.has(label))) {
      return { status: 'error', message: 'A nova ordem deve conter exatamente as fases existentes.' };
    }

    // A fase ativa e todo o histórico anterior são imutáveis. Apenas o trecho
    // planejado após a fase ativa pode mudar de posição.
    const protectedPrefix = currentLabels.slice(0, activeIndex + 1);
    const requestedPrefix = orderedLabels.slice(0, activeIndex + 1);
    if (protectedPrefix.some((label, index) => requestedPrefix[index] !== label)) {
      return { status: 'error', message: 'Fases concluídas e a fase ativa não podem ser reposicionadas.' };
    }

    const byLabel = new Map(phases.map((phase) => [phase.label, phase]));
    project.phases = orderedLabels.map((label) => byLabel.get(label));
    project.updatedAt = new Date().toISOString();
    this.writeJson(relPath, project);
    if (this.activeProjectID === projectID) this.activeProjectData = project;

    return { status: 'ok', message: 'Ordem das fases atualizada.', data: { phases: project.phases } };
  }

  async setActivePhase(projectID, phaseLabel) {
    const relPath = this.path.join(projectID, 'project.json');
    const rawProject = this.readJson(relPath);

    console.log('🟢 NodeFsStrategy.setActivePhase', { projectID, phaseLabel, relPath });

    if (!rawProject) return { status: 'error', message: 'Projeto não encontrado.' };
    const project = this.normalizeProjectPhaseCategoryModel(rawProject);
    if (!Array.isArray(project.phases)) project.phases = [];

    const phase = project.phases.find((p) => p.label === phaseLabel);
    if (!phase) return { status: 'error', message: 'Fase não encontrada.' };

    if (project.activePhaseLabel !== phaseLabel) {
      return {
        status: 'error',
        message: 'A progressão é sequencial. Conclua a fase ativa para liberar a próxima fase planejada.'
      };
    }

    if (Array.isArray(project.categories) && project.categories.length && !phase.categories?.length) {
      return { status: 'error', message: 'A fase ativa deve possuir pelo menos uma categoria.' };
    }

    project.activePhaseLabel = phaseLabel;
    project.updatedAt = new Date().toISOString();

    this.writeJson(relPath, project);
    if (this.activeProjectID === projectID) this.activeProjectData = project;

    return {
      status: 'ok',
      message: 'Fase ativa atualizada.',
      data: { activePhaseLabel: phaseLabel }
    };
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
    this.requestSequence = 0;
  }

  async init() {
    this.wsManager = wsManager;

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
          console.log("Timeout aguardando WebSocket.");
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
    const isConnected = await this.ensureConnection();

    const requestId = this.createRequestId(act);

    return new Promise((resolve, reject) => {
      if (isConnected && this.wsManager && this.wsManager.send) {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.wsManager?.removeResponseHandler?.(requestId);
          reject({ status: 'error', message: `Tempo esgotado aguardando resposta para ${act}.` });
        }, 15000);

        const sent = this.wsManager.send({ act, payload, requestId }, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if(response && response.status === "ok") {
            resolve(response.data);
          } else {
            reject(response || { status: 'error', message: `Resposta inválida para ${act}.` });
          }
        });

        if (!sent && !settled) {
          settled = true;
          clearTimeout(timeout);
          this.wsManager?.removeResponseHandler?.(requestId);
          reject({ status: "error", message: "WebSocket not connected" });
        }
      } else {
        reject({ status: "error", message: "WebSocket not connected" });
      }
    });
  }

  createRequestId(act = 'request') {
    this.requestSequence += 1;
    const randomPart = globalThis.crypto?.randomUUID?.()
      || Math.random().toString(36).slice(2);
    return `${act}:${Date.now()}:${this.requestSequence}:${randomPart}`;
  }

  async notifyDataRefresh(reason = 'data_changed', details = {}) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    const revision = {
      id: this.createRequestId('revision'),
      at: new Date().toISOString(),
      reason,
      details,
    };

    await new Promise((resolve) => {
      chrome.storage.local.set({ [ICIPO_DATA_REVISION_KEY]: revision }, () => {
        if (chrome.runtime?.lastError) {
          console.warn('iCipo: não foi possível publicar a atualização de dados.', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  // Accepts a `Project` instance and returns the server response.
  async saveProject(project) {
    if(project && project instanceof Project){
      const data = project.toJSON();
      const result = await this.send('save_project', { projectID: data.id, data });
      await this.notifyContextMenuRefresh();
      await this.notifyDataRefresh('project_saved', { projectID: data.id });
      return result;
    }
    return Promise.reject(new Error("O objeto a salvar deve ser uma instância de Project."));
  }

  async archiveProject(projectID) {
    const result = await this.send('archive_project', { projectID });
    await this.notifyDataRefresh('project_archived', { projectID });
    return result;
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
    // O projeto ativo e todos os seus dados são mantidos pelo servidor.
    const result = await this.send('open_project', { projectID });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('project_opened', { projectID });
    return result;
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
    const result = await this.send('delete_project', { projectID });
    await this.notifyDataRefresh('project_deleted', { projectID });
    return result;
  }

  async listProjects() {
    return this.send('list_projects', {});
  }

  // Accepts a `Paper` instance or a plain paper object and returns the server response
  async savePaper(paper) {
    if (!paper) {
      return Promise.reject(new Error("O artigo a salvar não pode ser vazio."));
    }

    const data = paper instanceof Paper ? paper.toJSON() : paper;

    if (!data.id && !(data.id === 0)) {
      return Promise.reject(new Error("Paper JSON must include an id."));
    }

    const result = await this.send('save_paper', { paperId: data.id, data });
    await this.notifyDataRefresh('paper_saved', {
      paperId: data.id,
      phaseLabel: data.phaseLabel || data.iterationId || null,
    });
    return result;
  }

  // Returns a `Paper` instance (or null)
  async loadPaper(paperId) {
    const res = await this.send('load_paper', { paperId });
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
    const result = await this.send('delete_paper', { paperId });
    await this.notifyDataRefresh('paper_deleted', { paperId });
    return result;
  }

  async savePhase(projectID, phaseData) {
    const result = await this.send('save_phase', { projectID, data: phaseData });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('phase_saved', { projectID, phaseLabel: result?.label || phaseData?.label || null });
    return result;
  }

  async updatePhase(projectID, phaseLabel, phaseData) {
    const result = await this.send('update_phase', { projectID, phaseLabel, data: phaseData });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('phase_updated', { projectID, phaseLabel });
    return result;
  }

  async deletePhase(projectID, phaseLabel) {
    const result = await this.send('delete_phase', { projectID, phaseLabel });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('phase_deleted', { projectID, phaseLabel });
    return result;
  }

  async reorderPhases(projectID, orderedLabels) {
    const result = await this.send('reorder_phases', { projectID, orderedLabels });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('phases_reordered', { projectID });
    return result;
  }

  async setActivePhase(projectID, phaseLabel) {
    const result = await this.send('set_active_phase', { projectID, phaseLabel });
    await this.notifyContextMenuRefresh();
    await this.notifyScholarRefresh();
    await this.notifyDataRefresh('active_phase_changed', { projectID, phaseLabel });
    return result;
  }

  async notifyScholarRefresh() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      await chrome.runtime.sendMessage({ action: 'refreshScholarHighlights' });
    } catch (_) {
      // Pode não existir receptor em páginas fora do contexto da extensão.
    }
  }

  async notifyContextMenuRefresh() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      await chrome.runtime.sendMessage({ action: 'updateContextMenu' });
    } catch (_) {
      // O service worker pode estar reiniciando; a próxima revisão refaz o menu.
    }
  }

  // Alias temporário para chamadas antigas. Não grava nada no chrome.storage.
  async syncActiveScopeToChrome() {
    return this.notifyScholarRefresh();
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

  async getAllHighlightedLinksForActiveProject() {
    return this.send('get_all_highlights', {});
  }

  async set(items) {
    if (!this.isActive()) {
      throw new Error('WebSocket desconectado. Os dados não foram salvos localmente.');
    }

    // Persistência exclusiva no servidor via WebSocket.
    const result = await this.send('storage_set', { items });

    const affectsScholar = !!items && (
      Object.prototype.hasOwnProperty.call(items, 'highlightedLinks') ||
      Object.prototype.hasOwnProperty.call(items, 'svat_papers') ||
      Object.prototype.hasOwnProperty.call(items, 'svat_project')
    );

    if (affectsScholar) {
      await this.notifyScholarRefresh();
    }

    const changedKeys = Object.keys(items || {});
    if (changedKeys.length) {
      await this.notifyDataRefresh('storage_updated', { keys: changedKeys });
    }

    return result;
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

  // Expose strategy's sync function to be triggered from background script
  async syncActiveScopeToChrome() {
    if (!this.initialized) await this.init();
    if (this.strategy && typeof this.strategy.syncActiveScopeToChrome === 'function') {
      return this.strategy.syncActiveScopeToChrome();
    }
    return Promise.resolve();
  }

  async getAllHighlightedLinksForActiveProject() {
    if (!this.initialized) await this.init();
    return this.strategy.getAllHighlightedLinksForActiveProject();
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

  // ========== Phase CRUD ==========

  async savePhase(projectID, phaseData) {
    if (!this.initialized) await this.init();
    return this.strategy.savePhase(projectID, phaseData);
  }

  async updatePhase(projectID, phaseLabel, phaseData) {
    if (!this.initialized) await this.init();
    return this.strategy.updatePhase(projectID, phaseLabel, phaseData);
  }

  async deletePhase(projectID, phaseLabel) {
    if (!this.initialized) await this.init();
    return this.strategy.deletePhase(projectID, phaseLabel);
  }

  async reorderPhases(projectID, orderedLabels) {
    if (!this.initialized) await this.init();
    return this.strategy.reorderPhases(projectID, orderedLabels);
  }

  async setActivePhase(projectID, phaseLabel) {
    if (!this.initialized) await this.init();
    return this.strategy.setActivePhase(projectID, phaseLabel);
  }

  
  // ============================================================================
}

// Singleton instance
export const storage = new StorageService();

// Optional: export Strategy classes for advanced use cases
export { StorageService, NodeFsStrategy, WebSocketStrategy, ICIPO_DATA_REVISION_KEY };
