import {
  checkArray,
  slugify,
  mapToJSON,
  uniqueStrings,
  replaceArrayItem,
  removeArrayItem,
  normalizeMetricType,
  normalizeCategoryMetricType,
  inferMetricTypeFromCategory,
} from "./utils.mjs";

class Project {
  // Default project schema (matches ui/projects/projects.html form)
  static defaults = {
    name: "",
    description: "",
    researchers: [],
    objective: "",
    categories: [],
    criteria: [],
    phases: [],
    activePhaseLabel: null,
    isCurrent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    papers: [],
  };

  constructor(id, data = null, withDefaults = false) {
    this.id = id;
    this.projectDir = id;

    if (withDefaults) {
      Object.assign(this, Project.defaults, data);
    } else {
      Object.assign(this, data);
    }

    if (data && typeof data === 'object') {
      // Create object from JSON for nested structures (papers, categories, criteria, phases) if present
      if(this.papers) this.papers = checkArray(this.papers).map(p => Paper.fromJSON(p));
      if(this.categories) this.categories = checkArray(this.categories).map(c => Category.fromJSON(c));
      if(this.criteria) this.criteria = checkArray(this.criteria).map(c => Criterion.fromJSON(c));
      if(this.phases) this.phases = checkArray(this.phases).map(f => Phase.fromJSON(f));

      this._migrateLegacyCategoryPhaseLinks(data.categories);
      this._normalizeActivePhase();
    }
  }

  _migrateLegacyCategoryPhaseLinks(rawCategories = []) {
    if (!Array.isArray(this.phases) || !Array.isArray(this.categories)) return;

    for (const rawCategory of checkArray(rawCategories)) {
      const categoryLabel = rawCategory?.label || slugify(rawCategory?.title || "");
      if (!categoryLabel) continue;

      for (const phaseLabel of uniqueStrings(rawCategory?.phases)) {
        const phase = this.phases.find(item => item.label === phaseLabel);
        if (phase) phase.categories = uniqueStrings([...phase.categories, categoryLabel]);
      }
    }

    // Projetos antigos podem possuir uma fase ativa sem categorias porque o
    // vínculo era mantido apenas em Category.phases. Garante uma categoria
    // utilizável sem reintroduzir a relação bidirecional.
    const activePhase = this.phases.find(phase => phase.label === this.activePhaseLabel)
      || this.phases.at(-1)
      || null;
    if (activePhase && this.categories.length && !activePhase.categories.length) {
      activePhase.categories = [this.categories[0].label];
    }
  }

  _normalizeActivePhase() {
    if (!Array.isArray(this.phases) || !this.phases.length) {
      this.activePhaseLabel = null;
      return;
    }

    // A fase ativa representa a etapa atual da progressão, e não a última fase
    // criada. Fases posteriores podem existir apenas como planejamento.
    const persistedActive = this.phases.find(
      phase => phase.label === this.activePhaseLabel && !phase.completed
    );
    if (persistedActive) return;

    const firstPending = this.phases.find(phase => !phase.completed) || null;
    this.activePhaseLabel = firstPending?.label || null;
  }

  // --- Category management ---
  getCategoryByLabel(label) {
    return this.categories.find(category => category.label === label) || null;
  }

  addCategory(categoryData) {
    const rawCategory = categoryData instanceof Category ? categoryData.toJSON() : (categoryData || {});
    const category = Category.fromJSON(rawCategory);
    if (!category.title || !category.color) {
      throw new Error("Título e cor da categoria são obrigatórios.");
    }

    category.criteria = normalizeCategoryCriteria(category.criteria);
    this._assertUniqueLabel(this.categories, category.label, null, "categoria");

    this.categories.push(category);

    // A primeira categoria criada passa a ser automaticamente utilizável na
    // fase ativa. As demais categorias são vinculadas somente pelo painel da
    // própria fase.
    const activePhase = this.getActivePhase();
    if (activePhase && !activePhase.categories.length) {
      activePhase.categories = [category.label];
    }

    this._touch();
    return category;
  }

  updateCategory(label, categoryData) {
    const categoryIndex = this.categories.findIndex(category => category.label === label);
    if (categoryIndex === -1) return null;

    const previousCategory = this.categories[categoryIndex];
    const rawCategory = categoryData instanceof Category ? categoryData.toJSON() : (categoryData || {});
    const nextCategory = Category.fromJSON({ ...previousCategory.toJSON(), ...rawCategory });
    if (!nextCategory.title || !nextCategory.color) {
      throw new Error("Título e cor da categoria são obrigatórios.");
    }

    nextCategory.criteria = normalizeCategoryCriteria(nextCategory.criteria);
    this._assertUniqueLabel(this.categories, nextCategory.label, previousCategory.label, "categoria");

    this.categories[categoryIndex] = nextCategory;
    if (previousCategory.label !== nextCategory.label) {
      for (const phase of this.phases) {
        phase.categories = replaceArrayItem(phase.categories, previousCategory.label, nextCategory.label);
      }
      this._renameCategoryReferences(previousCategory.label, nextCategory.label);
    }
    this._syncCategoryMetricReferences(nextCategory.label, nextCategory.metricType);
    this._touch();
    return nextCategory;
  }

  removeCategory(label) {
    const index = this.categories.findIndex(category => category.label === label);
    if (index === -1) return null;

    if (this.categories.length <= 1) {
      throw new Error("O projeto deve manter pelo menos uma categoria.");
    }

    const phasesWithoutAlternative = this.phases.filter(phase => {
      const assigned = uniqueStrings(phase.categories);
      return assigned.includes(label) && assigned.length <= 1;
    });
    if (phasesWithoutAlternative.length) {
      const phaseNames = phasesWithoutAlternative.map(phase => phase.title || phase.label).join(", ");
      throw new Error(`A categoria é a única ativa em: ${phaseNames}. Vincule outra categoria nessas fases antes de excluí-la.`);
    }

    const removed = this.categories.splice(index, 1)[0];
    for (const phase of this.phases) {
      phase.categories = removeArrayItem(phase.categories, removed.label);
    }
    this._touch();
    return removed;
  }

  _touch() {
    this.updatedAt = new Date().toISOString();
  }

  _assertUniqueLabel(collection, label, currentLabel = null, entityName = "item") {
    if (!label) {
      throw new Error(`O label de ${entityName} é obrigatório.`);
    }

    const duplicated = collection.find(item => item.label === label && item.label !== currentLabel);
    if (duplicated) {
      throw new Error(`${entityName} com label \"${label}\" já existe.`);
    }
  }

  _assertCriteriaExist(labels) {
    const missing = uniqueStrings(labels).filter(label => !this.criteria.some(criterion => criterion.label === label));
    if (missing.length) {
      throw new Error(`Critérios inexistentes: ${missing.join(", ")}.`);
    }
  }

  _assertCategoriesExist(labels) {
    const missing = uniqueStrings(labels).filter(label => !this.categories.some(category => category.label === label));
    if (missing.length) {
      throw new Error(`Categorias inexistentes: ${missing.join(", ")}.`);
    }
  }

  _renameCriterionReferences(oldLabel, newLabel) {
    if (!oldLabel || oldLabel === newLabel) return;

    for (const phase of this.phases) {
      phase.criteria = replaceArrayItem(phase.criteria, oldLabel, newLabel);
    }

    // Critérios das categorias são locais e não referenciam os critérios globais do projeto.
  }

  _removeCriterionReferences(label) {
    for (const phase of this.phases) {
      phase.criteria = removeArrayItem(phase.criteria, label);
    }

    // Critérios das categorias são locais e não referenciam os critérios globais do projeto.
  }

  _renameCategoryReferences(oldLabel, newLabel) {
    if (!oldLabel || oldLabel === newLabel) return;

    for (const paper of checkArray(this.papers)) {
      if (paper.categoryLabel === oldLabel) paper.categoryLabel = newLabel;
      paper.tags = replaceArrayItem(paper.tags, oldLabel, newLabel);

      if (paper.classifications && typeof paper.classifications === "object") {
        for (const classification of Object.values(paper.classifications)) {
          if (classification?.categoryLabel === oldLabel) {
            classification.categoryLabel = newLabel;
          }
        }
      }
    }
  }

  _syncCategoryMetricReferences(categoryLabel, metricType) {
    const normalizedMetricType = normalizeCategoryMetricType(metricType, "pending");
    for (const paper of checkArray(this.papers)) {
      const matchesTopLevel = paper.categoryLabel === categoryLabel;
      const matchesTag = checkArray(paper.tags).includes(categoryLabel);
      if (matchesTopLevel || matchesTag) paper.status = normalizedMetricType;

      if (paper.classifications && typeof paper.classifications === "object") {
        for (const classification of Object.values(paper.classifications)) {
          if (classification?.categoryLabel === categoryLabel) {
            classification.outcome = normalizedMetricType;
          }
        }
      }
    }
  }

  // --- Criterion management ---
  getCriterionByLabel(label) {
    return this.criteria.find(criterion => criterion.label === label) || null;
  }

  addCriterion(criterionData) {
    const rawCriterion = criterionData instanceof Criterion ? criterionData.toJSON() : (criterionData || {});
    const criterion = Criterion.fromJSON(rawCriterion);
    this._assertUniqueLabel(this.criteria, criterion.label, null, "criterion");

    this.criteria.push(criterion);
    this._touch();
    return criterion;
  }

  updateCriterion(label, criterionData) {
    const criterionIndex = this.criteria.findIndex(criterion => criterion.label === label);
    if (criterionIndex === -1) return null;

    const previousCriterion = this.criteria[criterionIndex];
    const rawCriterion = criterionData instanceof Criterion ? criterionData.toJSON() : (criterionData || {});
    const nextCriterion = Criterion.fromJSON({
      ...previousCriterion.toJSON(),
      ...rawCriterion,
    });
    this._assertUniqueLabel(this.criteria, nextCriterion.label, previousCriterion.label, "criterion");

    this.criteria[criterionIndex] = nextCriterion;
    this._renameCriterionReferences(previousCriterion.label, nextCriterion.label);
    this._touch();
    return nextCriterion;
  }

  removeCriterion(label) {
    const criterionIndex = this.criteria.findIndex(criterion => criterion.label === label);
    if (criterionIndex === -1) return null;

    const removedCriterion = this.criteria.splice(criterionIndex, 1)[0];
    this._removeCriterionReferences(removedCriterion.label);
    this._touch();
    return removedCriterion;
  }

  // --- Phase management ---
  getPhaseByLabel(label) {
    return this.phases.find(phase => phase.label === label) || null;
  }

  addPhase(phaseData) {
    const rawPhase = phaseData instanceof Phase ? phaseData.toJSON() : (phaseData || {});
    const phase = Phase.fromJSON(rawPhase);
    // Toda nova fase começa em análise. O rótulo “Concluído” só pode ser
    // aplicado depois, ao editar a fase mais recente, evitando criar etapas já
    // finalizadas e pular o fluxo sequencial.
    phase.completed = false;
    phase.categories = uniqueStrings(phase.categories);
    phase.criteria = uniqueStrings(phase.criteria);
    this._assertUniqueLabel(this.phases, phase.label, null, "phase");
    this._assertCriteriaExist(phase.criteria);
    this._assertCategoriesExist(phase.categories);

    if (this.categories.length && !phase.categories.length) {
      throw new Error("Selecione pelo menos uma categoria para a nova fase.");
    }

    const pendingCategory = phase.categories
      .map(categoryLabel => this.getCategoryByLabel(categoryLabel))
      .find(category => normalizeCategoryMetricType(category?.metricType, "pending") === "pending");
    phase.inheritanceCategoryLabel = pendingCategory?.label || null;

    this.phases.push(phase);
    // Somente a primeira fase é ativada automaticamente. As demais ficam
    // planejadas até a fase ativa ser concluída.
    if (!this.getActivePhase()) this.activePhaseLabel = phase.label;
    this._touch();
    return phase;
  }

  updatePhase(label, phaseData) {
    const phaseIndex = this.phases.findIndex(phase => phase.label === label);
    if (phaseIndex === -1) return null;

    const previousPhase = this.phases[phaseIndex];
    const rawPhase = phaseData instanceof Phase ? phaseData.toJSON() : (phaseData || {});
    const nextPhase = Phase.fromJSON({
      ...previousPhase.toJSON(),
      ...rawPhase,
    });
    nextPhase.categories = uniqueStrings(nextPhase.categories);
    nextPhase.criteria = uniqueStrings(nextPhase.criteria);
    this._assertUniqueLabel(this.phases, nextPhase.label, previousPhase.label, "phase");
    this._assertCriteriaExist(nextPhase.criteria);
    this._assertCategoriesExist(nextPhase.categories);

    if (this.categories.length && !nextPhase.categories.length) {
      throw new Error("A fase deve manter pelo menos uma categoria ativa.");
    }

    const pendingCategory = nextPhase.categories
      .map(categoryLabel => this.getCategoryByLabel(categoryLabel))
      .find(category => normalizeCategoryMetricType(category?.metricType, "pending") === "pending");
    nextPhase.inheritanceCategoryLabel = pendingCategory?.label || null;
    const pendingCount = checkArray(nextPhase.papers?.new).length;
    if (nextPhase.completed && pendingCount > 0) {
      throw new Error(`Classifique os ${pendingCount} artigo(s) pendente(s) antes de concluir esta fase.`);
    }

    const isCompletingNow = !previousPhase.completed && nextPhase.completed;
    if (isCompletingNow && this.activePhaseLabel !== previousPhase.label) {
      throw new Error("Somente a fase ativa pode ser concluída.");
    }
    this.phases[phaseIndex] = nextPhase;
    if (this.activePhaseLabel === previousPhase.label) {
      this.activePhaseLabel = isCompletingNow
        ? (this.phases[phaseIndex + 1]?.label || null)
        : nextPhase.label;
    }
    this._touch();
    return nextPhase;
  }

  canRemovePhase(label) {
    const phaseIndex = this.phases.findIndex(phase => phase.label === label);
    return this.phases.length > 1 && phaseIndex === this.phases.length - 1;
  }

  removePhase(label) {
    const phaseIndex = this.phases.findIndex(phase => phase.label === label);
    if (phaseIndex === -1) return null;

    if (this.phases.length <= 1) {
      throw new Error("O projeto deve manter pelo menos uma fase.");
    }

    if (phaseIndex !== this.phases.length - 1) {
      throw new Error("Somente a fase atual mais recente pode ser removida. Remova as fases posteriores primeiro.");
    }

    const removedPhase = this.phases.splice(phaseIndex, 1)[0];
    if (this.activePhaseLabel === removedPhase.label) {
      const nextPending = this.phases.find(phase => !phase.completed) || null;
      this.activePhaseLabel = nextPending?.label || null;
    }
    this._touch();
    return removedPhase;
  }

  getActivePhase() {
    return this.phases.find(phase => phase.label === this.activePhaseLabel && !phase.completed)
      || this.phases.find(phase => !phase.completed)
      || null;
  }

  canFinalizePhase(label) {
    const phase = this.getPhaseByLabel(label);
    const activePhase = this.getActivePhase();
    return !!phase
      && !phase.completed
      && !!activePhase
      && activePhase.label === label;
  }

  finalizePhase(label) {
    const phaseIndex = this.phases.findIndex(phase => phase.label === label);
    if (phaseIndex === -1) return null;

    const phase = this.phases[phaseIndex];
    if (phase.completed) {
      throw new Error(`A phase \"${label}\" já está concluída.`);
    }

    const activePhase = this.getActivePhase();
    if (!activePhase || activePhase.label !== label) {
      throw new Error(`A phase \"${label}\" não é a fase ativa atual.`);
    }

    const pendingCount = checkArray(phase.papers?.new).length;
    if (pendingCount > 0) {
      throw new Error(`Classifique os ${pendingCount} artigo(s) pendente(s) antes de concluir esta fase.`);
    }

    phase.completed = true;
    const nextPhase = this.phases[phaseIndex + 1] || null;
    this.activePhaseLabel = nextPhase?.label || null;
    this._touch();

    return {
      completedPhase: phase,
      nextActivePhase: nextPhase,
    };
  }

  // --- Paper management ---
  addPaper(paperData) {
    const p = paperData instanceof Paper ? paperData : Paper.fromJSON(paperData);
    this.papers.push(p);
  }

  toJSON() {
    // Keep project up-to-date with papers
    // const obj = {}
    const obj = Object.fromEntries(
      Object.entries(this).filter(([key]) => key in Project.defaults)
    );
    obj.id = this.id;
    obj.projectDir = this.projectDir;
    obj.papers = mapToJSON(this.papers);
    obj.categories = mapToJSON(this.categories);
    obj.criteria = mapToJSON(this.criteria);
    obj.phases = mapToJSON(this.phases);
    obj.updatedAt = new Date().toISOString();
    return obj;
  }

  static fromJSON(id, json) {
    return new Project(id, json);
  }
}


class Paper {
  constructor(data = {}) {
    this.id = data.id || null;
    this.url = data.url || "";
    this.title = data.title || "";
    this.authors = checkArray(data.authors);
    this.authorsRaw = data.authorsRaw || "";
    this.year = data.year || null;
    this.origin = data.origin || null;
    this.status = normalizeMetricType(data.status, "pending");
    this.categoryLabel = data.categoryLabel || data.categoryId || null;
    this.phaseLabel = data.phaseLabel || data.phaseId || null;
    this.classifications = data.classifications && typeof data.classifications === "object" && !Array.isArray(data.classifications)
      ? { ...data.classifications }
      : {};
    this.iterationId = data.iterationId || null;
    this.criteriaId = data.criteriaId || null;
    this.tags = checkArray(data.tags);
    this.inherited = !!data.inherited;
    this.entryType = data.entryType || (this.inherited ? "inherited" : "new");
    this.inheritedFromPhaseLabel = data.inheritedFromPhaseLabel || null;
    this.visited = data.visited === undefined ? true : !!data.visited;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.history = checkArray(data.history);
  }


  // --- Citation helpers (wire-up happens elsewhere) ---
  // Note: these formatters are best-effort and intentionally lightweight.
  // They are meant to be used by UI helpers like "Download Citations".
  _firstAuthorLastName() {
    const a = (this.authors && this.authors[0]) ? String(this.authors[0]) : (this.authorsRaw || "");
    const cleaned = a.replace(/\s+et\s+al\.?/i, "").trim();
    const parts = cleaned.split(/[\s,]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]+/gi, "") : "paper";
  }

  _bibKey() {
    const y = this.year ? String(this.year) : "n.d.";
    return `${this._firstAuthorLastName()}${y}`.replace(/[^a-zA-Z0-9]+/g, "");
  }

  toBibTeX() {
    const key = this._bibKey() || "paper";
    const title = (this.title || "").replace(/[{}]/g, "");
    const year = this.year ? String(this.year) : "";
    const author = Array.isArray(this.authors) && this.authors.length
      ? this.authors.join(" and ")
      : (this.authorsRaw || "");
    const url = this.url || "";
    return [
      `@article{${key},`,
      `  title={${title}},`,
      author ? `  author={${author}},` : null,
      year ? `  year={${year}},` : null,
      url ? `  url={${url}},` : null,
      `}`
    ].filter(Boolean).join("\n");
  }

  toAPA() {
    const author = Array.isArray(this.authors) && this.authors.length ? this.authors.join(", ") : (this.authorsRaw || "Autor");
    const year = this.year ? `(${this.year}).` : "(s.d.).";
    const title = this.title ? `${this.title}.` : "Título.";
    const url = this.url ? ` ${this.url}` : "";
    return `${author} ${year} ${title}${url}`.trim();
  }

  toABNT() {
    // ABNT: SOBRENOME, Prenomes. Título. Ano. Disponível em: URL.
    const author = Array.isArray(this.authors) && this.authors.length ? this.authors[0] : (this.authorsRaw || "AUTOR");
    const year = this.year ? String(this.year) : "s.d.";
    const title = this.title || "Título";
    const url = this.url ? ` Disponível em: ${this.url}.` : "";
    return `${author}. ${title}. ${year}.${url}`.trim();
  }

  toEndNoteRIS() {
    // Minimal RIS (works for EndNote/Zotero/Mendeley imports)
    const lines = [
      "TY  - JOUR",
      this.title ? `TI  - ${this.title}` : null,
      this.year ? `PY  - ${this.year}` : null,
      this.url ? `UR  - ${this.url}` : null,
    ];
    if (Array.isArray(this.authors)) {
      for (const a of this.authors) lines.push(`AU  - ${a}`);
    } else if (this.authorsRaw) {
      lines.push(`AU  - ${this.authorsRaw}`);
    }
    lines.push("ER  - ");
    return lines.filter(Boolean).join("\n");
  }


  toJSON() {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      authors: this.authors,
      authorsRaw: this.authorsRaw,
      year: this.year,
      origin: this.origin,
      status: this.status,
      categoryLabel: this.categoryLabel,
      phaseLabel: this.phaseLabel,
      classifications: this.classifications,
      iterationId: this.iterationId,
      criteriaId: this.criteriaId,
      tags: this.tags,
      inherited: this.inherited,
      entryType: this.entryType,
      inheritedFromPhaseLabel: this.inheritedFromPhaseLabel,
      visited: this.visited,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      history: this.history,
    };
  }

  static fromJSON(data = {}) {
    return new Paper(data);
  }
}



function normalizeCategoryCriteria(value) {
  // Formato atual: lista de textos pertencentes exclusivamente à categoria.
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(item => typeof item === "string" ? item.trim() : item?.title?.trim()).filter(Boolean));
  }

  // Compatibilidade com projetos criados pelo formato antigo.
  if (value && typeof value === "object") {
    return uniqueStrings([...(checkArray(value.all)), ...(checkArray(value.at_least_one))]);
  }

  return [];
}

class Category {
  constructor(data = {}) {
    this.title = data.title || "";
    this.label = data.label || slugify(this.title);
    this.description = data.description || "";
    this.color = data.color || null;
    this.metricType = normalizeCategoryMetricType(
      data.metricType ?? data.metric ?? data.outcome,
      inferMetricTypeFromCategory(data)
    );
    this.criteria = normalizeCategoryCriteria(data.criteria);
  }

  toJSON() {
    return {
      title: this.title,
      label: this.label,
      description: this.description,
      color: this.color,
      metricType: this.metricType,
      criteria: this.criteria,
    };
  }

  static fromJSON(data = {}) {
    return new Category(data);
  }
}

class Criterion {
  constructor(data = {}) {
    this.title = data.title || "";
    this.label = data.label || slugify(this.title);
    this.description = data.description || "";
  }

  toJSON() {
    return {
      title: this.title,
      label: this.label,
      description: this.description,
    };
  }

  static fromJSON(data = {}) {
    return new Criterion(data);
  }
}

class Phase {
  constructor(data = {}) {
    this.title = data.title || "";
    this.label = data.label || slugify(this.title);
    this.description = data.description || "";
    this.completed = !!data.completed;
    this.categories = checkArray(data.categories);
    this.inheritanceCategoryLabel = data.inheritanceCategoryLabel || null;
    this.criteria = checkArray(data.criteria);
    const papers = data.papers && typeof data.papers === "object" ? data.papers : {};
    this.papers = {
      inheritedAccumulated: checkArray(papers.inheritedAccumulated),
      inherited: checkArray(papers.inherited),
      new: checkArray(papers.new),
      removed: checkArray(papers.removed),
      selected: checkArray(papers.selected),
    };
  }

  toJSON() {
    return {
      label: this.label,
      title: this.title,
      description: this.description,
      completed: this.completed,
      categories: this.categories,
      inheritanceCategoryLabel: this.inheritanceCategoryLabel,
      criteria: this.criteria,
      papers: {
        inherited: this.papers.inherited,
        inheritedAccumulated: this.papers.inheritedAccumulated,
        new: this.papers.new,
        removed: this.papers.removed,
        selected: this.papers.selected,
      },
    };
  }

  static fromJSON(data = {}) {
    return new Phase(data);
  }
}

export { Project, Paper, Category, Criterion, Phase };
