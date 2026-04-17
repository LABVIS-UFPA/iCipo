import { checkArray, slugify, mapToJSON, uniqueStrings, replaceArrayItem, removeArrayItem } from "./utils.mjs";

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
    }
  }

  // --- Category management ---
  addCategory(categoryData) {
    if (!categoryData) return;
    //Categorias devem ter pelo menos título e cor para serem criadas, caso contrário, são ignoradas
    if (!categoryData.title || !categoryData.color) return;

    const c = categoryData instanceof Category ? categoryData : Category.fromJSON(categoryData);
    this.categories.push(c);
    return c;
  }

  removeCategory(label) {
    const index = this.categories.findIndex(c => c.label === label);
    if (index !== -1) {
      return this.categories.splice(index, 1)[0];
    }else{
      return null;
    }
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

    for (const category of this.categories) {
      category.criteria.all = replaceArrayItem(category.criteria.all, oldLabel, newLabel);
      category.criteria.at_least_one = replaceArrayItem(category.criteria.at_least_one, oldLabel, newLabel);
    }
  }

  _removeCriterionReferences(label) {
    for (const phase of this.phases) {
      phase.criteria = removeArrayItem(phase.criteria, label);
    }

    for (const category of this.categories) {
      category.criteria.all = removeArrayItem(category.criteria.all, label);
      category.criteria.at_least_one = removeArrayItem(category.criteria.at_least_one, label);
    }
  }

  _renamePhaseReferences(oldLabel, newLabel) {
    if (!oldLabel || oldLabel === newLabel) return;

    for (const category of this.categories) {
      category.phases = replaceArrayItem(category.phases, oldLabel, newLabel);
    }
  }

  _removePhaseReferences(label) {
    for (const category of this.categories) {
      category.phases = removeArrayItem(category.phases, label);
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
    phase.categories = uniqueStrings(phase.categories);
    phase.criteria = uniqueStrings(phase.criteria);
    this._assertUniqueLabel(this.phases, phase.label, null, "phase");
    this._assertCriteriaExist(phase.criteria);
    this._assertCategoriesExist(phase.categories);

    this.phases.push(phase);
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

    this.phases[phaseIndex] = nextPhase;
    this._renamePhaseReferences(previousPhase.label, nextPhase.label);
    this._touch();
    return nextPhase;
  }

  canRemovePhase(label) {
    const phase = this.getPhaseByLabel(label);
    return !!phase && !phase.completed;
  }

  removePhase(label) {
    const phaseIndex = this.phases.findIndex(phase => phase.label === label);
    if (phaseIndex === -1) return null;

    const phase = this.phases[phaseIndex];
    if (phase.completed) {
      throw new Error(`A phase \"${label}\" já foi concluída e não pode ser removida.`);
    }

    const removedPhase = this.phases.splice(phaseIndex, 1)[0];
    this._removePhaseReferences(removedPhase.label);
    this._touch();
    return removedPhase;
  }

  getActivePhase() {
    return this.phases.find(phase => !phase.completed) || null;
  }

  canFinalizePhase(label) {
    const phase = this.getPhaseByLabel(label);
    const activePhase = this.getActivePhase();
    return !!phase && !phase.completed && !!activePhase && activePhase.label === label;
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

    phase.completed = true;
    this._touch();

    return {
      completedPhase: phase,
      nextActivePhase: this.getActivePhase(),
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
    this.status = data.status || null;
    this.iterationId = data.iterationId || null;
    this.criteriaId = data.criteriaId || null;
    this.tags = checkArray(data.tags);
    this.visited = !!data.visited;
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
      iterationId: this.iterationId,
      criteriaId: this.criteriaId,
      tags: this.tags,
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



class Category {
  constructor(data = {}) {
    this.title = data.title || "";
    this.label = data.label || slugify(this.title);
    this.description = data.description || "";
    this.color = data.color || null;
    this.phases = checkArray(data.phases);
    const criteria = data.criteria && typeof data.criteria === "object" ? data.criteria : {};
    this.criteria = {
      at_least_one: checkArray(criteria.at_least_one),
      all: checkArray(criteria.all),
    };
  }

  toJSON() {
    return {
      title: this.title,
      label: this.label,
      description: this.description,
      color: this.color,
      phases: this.phases,
      criteria: {
        at_least_one: this.criteria.at_least_one,
        all: this.criteria.all,
      },
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
