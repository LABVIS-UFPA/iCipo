import { checkArray, slugify, mapToJSON } from "./utils.mjs";

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
    this.phases = checkArray(data.phases);
  }

  toJSON() {
    return {
      title: this.title,
      label: this.label,
      description: this.description,
      phases: this.phases,
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
