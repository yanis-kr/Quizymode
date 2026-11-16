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
//
// Routing per role (highest dimension level decides, except where a role is capped):
//   reporter              always haiku
//   tester, ux-designer   haiku at level 0; sonnet otherwise; never opus
//   coder                 haiku at level 0; sonnet at level 1; opus only for high reasoning, a migration, or a
//                         reasoning failure (Sonnet has shown a reasoning limit)
//   architect, reviewer,
//   qm-decision-maker     haiku at 0; sonnet at 1; opus at 2. The decision-maker is never below sonnet.

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
  const failure = facts.failure ?? "none";
  dims.push({ name: "failure", level: LEVEL[failure] ?? 1, label: failure === "none" ? "no earlier failure" : `earlier failure: ${failure}` });
  return { level: Math.max(...dims.map((d) => d.level)), dims };
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
