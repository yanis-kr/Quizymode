// Rotation orchestration. Order: every no-downtime secret together, then each db-blip secret alone.
// Per group: create+store -> redeploy -> check -> revoke. The old credential is revoked only after the new one passed its
// check, and a failed check stops the run with nothing revoked. Progress is kept in a values-free state object so a run
// can be resumed; a step already done is never repeated (so a revoke never runs twice).

const RANK = { pending: 0, stored: 1, checked: 2, revoked: 3 };

export function planGroups(inventory, only) {
  const picked = inventory.secrets.filter((s) => !only?.length || only.includes(s.name));
  const quiet = picked.filter((s) => s.downtime === "none");
  const blips = picked.filter((s) => s.downtime !== "none");
  return [...(quiet.length ? [{ key: "no-downtime", entries: quiet }] : []), ...blips.map((s) => ({ key: s.name, entries: [s] }))];
}

const at = (state, name) => (state.secrets[name] ??= { status: "pending", oldRef: null });
const reached = (state, name, step) => RANK[at(state, name).status] >= RANK[step];

export async function runRotation({ inventory, only, apply, state, save, aws, target, adapters, browser, redeploy, deployed, log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), checkAttempts = 5 }) {
  const unknown = (only ?? []).filter((n) => !inventory.secrets.some((s) => s.name === n));
  if (unknown.length) throw new Error(`unknown secret name(s): ${unknown.join(", ")}`);
  const groups = planGroups(inventory, only);

  if (!apply) {
    log("DRY RUN: nothing will be changed. Use --apply to rotate.");
    groups.forEach((g, i) => {
      log(`group ${i + 1}: ${g.key}${g.entries.some((e) => e.downtime !== "none") ? " (database blip of about 5 minutes)" : ""}`);
      g.entries.forEach((e) => log(`  ${e.name}: ${e.method}${e.provider ? `/${e.provider}` : ""} -> ${Object.values(e.params).map((p) => target.nameOf(p)).join(", ")}; check, then revoke old`));
    });
    return { rotated: [], planned: groups.flatMap((g) => g.entries.map((e) => e.name)) };
  }

  const ctxFor = (entry) => ({ entry, aws, browser });
  const rotated = [];
  for (const group of groups) {
    log(`group ${group.key}`);
    for (const entry of group.entries) {
      if (reached(state, entry.name, "stored")) continue;
      const created = await adapters[entry.method].create(ctxFor(entry));
      for (const [key, param] of Object.entries(entry.params)) {
        if (created.values[key] == null || created.values[key] === "") throw new Error(`${entry.name}: adapter returned no value for ${key}`);
        target.put(param, created.values[key]);
      }
      Object.assign(at(state, entry.name), { status: "stored", oldRef: created.oldRef ?? null, storedAt: new Date().toISOString() });
      save(state);
      log(`  ${entry.name}: new credential stored (${Object.values(entry.params).map((p) => target.nameOf(p)).join(", ")})`);
    }

    if (!state.redeployed[group.key]) {
      if (redeploy) {
        await redeploy(group);
        state.redeployed[group.key] = true;
        save(state);
      } else if (deployed) {
        state.redeployed[group.key] = true;
        save(state);
      } else {
        log("STOPPED: redeploy the API so it reads the new values, then run again with the same --run-id and --deployed. Nothing was revoked.");
        return { rotated, stoppedForDeploy: group.key };
      }
    }

    for (const entry of group.entries) {
      if (reached(state, entry.name, "checked")) continue;
      const values = Object.fromEntries(Object.entries(entry.params).map(([k, p]) => [k, target.get(p)]));
      let ok = false;
      for (let attempt = 1; attempt <= checkAttempts && !ok; attempt++) {
        ok = await adapters[entry.method].check(ctxFor(entry), values);
        if (!ok && attempt < checkAttempts) await sleep(3000);
      }
      if (!ok) throw new Error(`${entry.name}: the new credential failed its check; nothing was revoked, the old credential still works`);
      at(state, entry.name).status = "checked";
      save(state);
      log(`  ${entry.name}: check passed`);
    }

    for (const entry of group.entries) {
      if (reached(state, entry.name, "revoked")) continue;
      await adapters[entry.method].revoke(ctxFor(entry), at(state, entry.name).oldRef);
      at(state, entry.name).status = "revoked";
      save(state);
      rotated.push(entry.name);
      log(`  ${entry.name}: old credential revoked`);
    }
  }
  return { rotated };
}
