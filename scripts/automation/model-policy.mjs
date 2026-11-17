// Shared model routing policy (AC 7.13.3). One source for bundle.mjs packets, claude-adapter.mjs and the agent files.
//
// Haiku is the default. Sonnet is the normal escalation for substantive engineering. Opus is used only when a task
// genuinely needs deeper reasoning: a high level on a reasoning-heavy dimension, not because a role is called architect
// or reviewer. Each dimension is scored independently: 0 low, 1 medium, 2 high. An unknown fact scores 1 (medium), so
// an unclear task is assessed by Sonnet, not Opus. A failure caused by the environment is fixed, not escalated.
//
// Facts (all optional; a missing fact is unknown):
//   size          xs | s | m | l | unknown            scope: number of files and components
//   risk          low | medium | high | unknown        security, data integrity, regression potential
//   migration     true | false | unknown               database model change
//   ambiguity     low | medium | high | unknown        clarity of requirements and architecture
//   novelty       low | medium | high | unknown        familiar pattern versus new architecture
//   reasoning     low | medium | high | unknown        straightforward versus complex reasoning
//   failure       none | environment | unclassified | reasoning   why an earlier attempt failed
//   priorModel    haiku | sonnet | opus | unknown                  the model that made the failed attempt
//
// Escalation after a reasoning failure depends on the model that failed: haiku -> sonnet, sonnet -> opus. An environment
// failure is fixed, not escalated. A high-complexity task may start on opus directly.
//
// Routing per role (highest dimension level decides, except where a role is capped):
//   reporter              always haiku
//   tester, ux-designer   haiku at level 0; sonnet otherwise; never opus
//   coder                 haiku at level 0; sonnet at level 1; opus only for high reasoning, a migration, or a
//                         reasoning failure on sonnet (or opus)
//   architect, reviewer,
//   qm-decision-maker     haiku at 0; sonnet at 1; opus at 2. The decision-maker is never below sonnet.
//
// classifyIssue() derives the facts from an issue's labels, body and acceptance criteria, without an extra agent or extra
// labels. Only a clearly simple issue gets inferred low values; anything unclear stays unknown and scores medium.

export const MODEL_ORDER = Object.freeze(["haiku", "sonnet", "opus"]);
export const ROLES = Object.freeze(["architect", "reviewer", "qm-decision-maker", "coder", "tester", "ux-designer", "reporter"]);

const LEVEL = { low: 0, none: 0, environment: 0, medium: 1, unclassified: 1, unknown: 1, high: 2, reasoning: 2 };

function sizeLevel(size) {
  if (size === "xs" || size === "s") return { name: "scope", level: 0, label: `scope ${size}` };
  if (size === "m" || size === "l") return { name: "scope", level: 1, label: `scope ${size}` };
  return { name: "scope", level: 1, label: "scope unknown" };
}

/** Scores each dimension. Returns { level (highest), dims: [{ name, level, label }] }. */
export function scoreTask(facts = {}) {
  const dims = [sizeLevel(facts.size)];
  const risk = facts.risk ?? "unknown";
  dims.push({ name: "risk", level: LEVEL[risk] ?? 1, label: `risk ${risk}` });
  const migration = facts.migration ?? "unknown";
  if (migration === true) dims.push({ name: "migration", level: 2, label: "migration" });
  else if (migration === false) dims.push({ name: "migration", level: 0, label: "no migration" });
  else dims.push({ name: "migration", level: 1, label: "migration unknown" });
  for (const name of ["ambiguity", "novelty", "reasoning"]) {
    const v = facts[name] ?? "unknown";
    dims.push({ name, level: LEVEL[v] ?? 1, label: `${name} ${v}` });
  }
  dims.push(failureDim(facts.failure ?? "none", facts.priorModel));
  return { level: Math.max(...dims.map((d) => d.level)), dims };
}

// A reasoning failure escalates one step from the model that failed: haiku -> sonnet, sonnet -> opus. An unknown prior
// model is treated as haiku, so it lands on sonnet. An environment failure is fixed, not escalated.
function failureDim(failure, priorModel) {
  if (failure === "none") return { name: "failure", level: 0, label: "no earlier failure" };
  if (failure === "reasoning") {
    const prior = MODEL_ORDER.includes(priorModel) ? priorModel : "unknown model";
    const level = prior === "sonnet" || prior === "opus" ? 2 : 1;
    return { name: "failure", level, label: `reasoning failure on ${prior}` };
  }
  return { name: "failure", level: LEVEL[failure] ?? 1, label: `earlier failure: ${failure}` };
}

/** The model for one role, with the reason the packet and the dispatch record show. */
export function routeModel(role, facts = {}) {
  if (!ROLES.includes(role)) throw new Error(`unknown role: ${role}`);
  const { level, dims } = scoreTask(facts);
  const raised = dims.filter((d) => d.level >= 1).map((d) => d.label);
  const why = raised.length ? raised.join("; ") : "every dimension low";
  const pick = (model, detail) => ({ model, reason: detail ? `${detail} (${why})` : why });

  if (role === "reporter") return pick("haiku", "reporter is always haiku");
  if (role === "tester" || role === "ux-designer") {
    return level === 0 ? pick("haiku") : pick("sonnet", "capped at sonnet for this role");
  }
  if (role === "coder") {
    const hard = dims.find((d) => (d.name === "reasoning" || d.name === "failure" || d.name === "migration") && d.level === 2);
    if (hard) return pick("opus", `${hard.label} needs deeper reasoning`);
    return level === 0 ? pick("haiku") : pick("sonnet");
  }
  // architect, reviewer, qm-decision-maker
  const model = level === 0 ? "haiku" : level === 1 ? "sonnet" : "opus";
  if (role === "qm-decision-maker" && model === "haiku") return pick("sonnet", "decisions are never below sonnet");
  return pick(model);
}

/** The baseline a direct invocation with no packet gets: every fact unknown, so the same assessment rule applies. */
export function baselineModel(role) {
  return routeModel(role, {}).model;
}

// Words that make work sensitive: a mistake would touch security, data, money, concurrency or a shared contract.
const SENSITIVE = /\b(auth|authn|authz|authentication|authorization|login|password|token|secret|permissions?|security|privacy|payments?|billing|database|schema|concurrency|race|transactions?|encryption|cognito|endpoints?|api|backend)\b/i;
const FRONTEND_BLOCKERS = ["area:db", "area:auth", "area:api", "area:infra", "area:security"];

/**
 * Lightweight initial classification of an issue, from its labels, size, body and acceptance criteria. It needs no extra
 * agent and no extra labels: the packet step reads the issue anyway. The issue is "simple" only when every signal agrees:
 * frontend-only, size xs or s, 1 to 6 ACs, no sensitive word, and no stated risk, ambiguity, novelty or reasoning above low.
 * Only a simple issue gets inferred low values. Anything unclear or sensitive stays unknown, which scores medium (sonnet).
 * A value stated in the body always wins over the inference.
 */
export function classifyIssue({ title = "", body = "", labels = [], size = "unknown", acCount = 0 } = {}) {
  const text = `${title}\n${body}`;
  const has = (label) => labels.includes(label);
  const stated = (name) => {
    const m = new RegExp(`^\\s*${name}\\s*[:-]?\\s*(low|medium|high)\\b`, "im").exec(body);
    return m ? m[1].toLowerCase() : null;
  };
  const labelRisk = has("risk:high") || has("area:auth") ? "high" : has("risk:medium") ? "medium" : has("risk:low") ? "low" : null;
  const bodyRisk = /\bRisk\s*[:-]?\s*(low|medium|high)\b/i.exec(body)?.[1].toLowerCase() ?? null;
  const risk = labelRisk ?? bodyRisk;
  const ambiguity = stated("Ambiguity");
  const novelty = stated("Novelty");
  const reasoning = stated("Reasoning");

  const frontendOnly = !FRONTEND_BLOCKERS.some(has) && (has("area:ux") || has("area:study"));
  // A db label means a migration. Otherwise an explicit "Migration: none|yes" or "no migration" in the body counts; an unstated
  // migration is unknown, except on a frontend-only issue, where it is no migration.
  const bodyMigration = /\bno migrations?\b|\bMigration\s*[:-]?\s*(none|no)\b/i.test(body) ? false
    : /\bMigration\s*[:-]?\s*yes\b/i.test(body) ? true : null;
  const migration = has("area:db") ? true : bodyMigration ?? (frontendOnly ? false : "unknown");
  const sensitive = SENSITIVE.exec(text)?.[1];
  const notSimple = [];
  if (!frontendOnly) notSimple.push("not frontend-only");
  if (size !== "xs" && size !== "s") notSimple.push(`size ${size}`);
  if (acCount < 1 || acCount > 6) notSimple.push(`${acCount} acceptance criteria`);
  if (sensitive) notSimple.push(`sensitive word "${sensitive.toLowerCase()}"`);
  if (migration === true) notSimple.push("a migration");
  for (const [name, value] of [["risk", risk], ["ambiguity", ambiguity], ["novelty", novelty], ["reasoning", reasoning]]) {
    if (value && value !== "low") notSimple.push(`stated ${name} ${value}`);
  }
  const simple = notSimple.length === 0;

  const inferred = (value) => value ?? (simple ? "low" : "unknown");
  const source = (value) => (value ? "issue body" : simple ? "classified simple" : "unknown");

  return {
    facts: { size, risk: inferred(risk), migration, ambiguity: inferred(ambiguity), novelty: inferred(novelty), reasoning: inferred(reasoning) },
    sources: { risk: labelRisk ? "risk label" : source(bodyRisk), ambiguity: source(ambiguity), novelty: source(novelty), reasoning: source(reasoning),
      migration: has("area:db") ? "area:db label" : bodyMigration !== null ? "issue body" : frontendOnly ? "frontend-only labels" : "unknown" },
    simple,
    reason: simple ? "simple: frontend-only, size " + size + ", " + acCount + " ACs, no sensitive word, nothing stated above low" : `not simple: ${notSimple.join("; ")}`,
  };
}

/**
 * Chooses the model an adapter call runs on. A requested model that is not available is replaced only by a cheaper one,
 * and the substitution is recorded. Nothing more expensive is ever substituted; with no cheaper model it throws.
 */
export function chooseAvailable(requested, availableModels) {
  if (!availableModels || availableModels.includes(requested)) return { model: requested, substituted: false };
  const index = MODEL_ORDER.indexOf(requested);
  const cheaper = MODEL_ORDER.slice(0, index).reverse().find((m) => availableModels.includes(m));
  if (!cheaper) return { model: null, substituted: false, unavailable: true };
  return { model: cheaper, substituted: true, reason: `"${requested}" not in availableModels; substituted the cheaper "${cheaper}"` };
}
