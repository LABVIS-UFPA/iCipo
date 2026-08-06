// Shared utility functions for Marcalink Snowballing

export function fmtDate(iso) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("pt-BR");
    } catch {
        return iso;
    }
}

export function normalizeStr(s) {
    return (s || "").toString().toLowerCase();
}

export function checkArray(arr) {
    return Array.isArray(arr) ? arr : [];
}

export function mapToJSON(arr) {
    const a = checkArray(arr);
    return a.map(x => x && typeof x.toJSON === 'function' ? x.toJSON() : x);
}

export function uniqueStrings(values) {
    return [...new Set(checkArray(values).filter(Boolean))];
}

export function replaceArrayItem(values, oldValue, newValue) {
    return uniqueStrings(checkArray(values).map(value => value === oldValue ? newValue : value));
}

export function removeArrayItem(values, targetValue) {
    return checkArray(values).filter(value => value !== targetValue);
}

export const PAPER_METRIC_TYPES = Object.freeze([
    "included",
    "excluded",
    "duplicate",
    "pending",
]);

function normalizeMetricToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * Normaliza o resultado consolidado usado nas métricas dos artigos.
 * O formato persistido é sempre um dos quatro valores canônicos abaixo.
 */
export function normalizeMetricType(value, fallback = "pending") {
    const token = normalizeMetricToken(value);
    const aliases = {
        included: "included",
        include: "included",
        incluido: "included",
        incluida: "included",
        inclusao: "included",
        aprovado: "included",
        aprovada: "included",
        aceito: "included",
        aceita: "included",
        selected: "included",
        selecionado: "included",
        selecionada: "included",

        excluded: "excluded",
        exclude: "excluded",
        excluido: "excluded",
        excluida: "excluded",
        exclusao: "excluded",
        rejeitado: "excluded",
        rejeitada: "excluded",
        descartado: "excluded",
        descartada: "excluded",

        duplicate: "duplicate",
        duplicated: "duplicate",
        duplicado: "duplicate",
        duplicada: "duplicate",
        duplicidade: "duplicate",
        repetido: "duplicate",
        repetida: "duplicate",

        pending: "pending",
        pendente: "pending",
        unclassified: "pending",
        sem_classificacao: "pending",
        nao_contabilizar: "pending",
        none: "pending",
    };

    if (aliases[token]) return aliases[token];

    const normalizedFallback = normalizeMetricToken(fallback);
    if (PAPER_METRIC_TYPES.includes(normalizedFallback)) return normalizedFallback;
    return "pending";
}

/**
 * Compatibilidade com projetos antigos que ainda não possuem metricType.
 * Novas categorias devem persistir metricType explicitamente.
 */
export function inferMetricTypeFromCategory(category) {
    if (category && typeof category === "object") {
        const explicit = normalizeMetricType(
            category.metricType ?? category.metric ?? category.outcome,
            ""
        );
        if (explicit && PAPER_METRIC_TYPES.includes(explicit)) {
            const rawExplicit = category.metricType ?? category.metric ?? category.outcome;
            if (String(rawExplicit || "").trim()) return explicit;
        }
    }

    const source = category && typeof category === "object"
        ? `${category.label || ""} ${category.title || ""}`
        : String(category || "");
    const token = normalizeMetricToken(source);

    if (/(^|_)(nao_(incl|aprov|aceit|selecion)|ineleg|fora_dos_criterios)/.test(token)) return "excluded";
    if (/(^|_)(excl|rejeit|descart|ineleg)/.test(token)) return "excluded";
    if (/(^|_)(duplic|repet)/.test(token)) return "duplicate";
    if (/(^|_)(incl|aprov|aceit|selecion|elegivel|atende)/.test(token)) return "included";
    return "pending";
}

export function tokenSet(title) {
    return new Set(normalizeStr(title)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w && w.length >= 3));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slugify(input, options = {}) {
    const separator = options.separator || "_";
    const normalized = String(input || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]+/g, " ")
        .trim()
        .replace(/\s+/g, separator);

    if (normalized) {
        const sep = escapeRegExp(separator);
        return normalized.replace(new RegExp(`${sep}+`, "g"), separator);
    }

    if (typeof options.fallback === "function") return options.fallback();
    if (typeof options.fallback === "string") return options.fallback;
    return "";
}

export function jaccard(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
}

// FNV-1a 32-bit hash, prefixed with p_
export function hashId(input) {
    input = (input || "").toString();
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return "p_" + h.toString(16).padStart(8, "0");
}

export function inferFromCategory(category) {
    const categoryText = category && typeof category === "object"
        ? `${category.label || ""} ${category.title || ""}`
        : String(category || "");
    const c = categoryText.toLowerCase();
    const origin = c.includes("seed") || c.includes("semente") ? "seed"
        : c.includes("back") || c.includes("refer") ? "backward"
        : c.includes("forw") || c.includes("cita") ? "forward"
        : "unknown";

    const status = inferMetricTypeFromCategory(category);

    return { origin, status };
}
