// A stand-in for the gh CLI in bundle.mjs tests (#850). bundle.mjs runs it when QM_GH_STUB points here. Its state is the
// JSON file named by QM_GH_FIXTURE: { prView, prList, prListFail, labels, existingLabels, comments, calls }. Every call is
// appended to calls. Unknown commands exit 1.
import fs from "node:fs";

const file = process.env.QM_GH_FIXTURE;
const st = JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
st.calls = [...(st.calls ?? []), args.join(" ")];
const save = () => fs.writeFileSync(file, JSON.stringify(st, null, 2));
const out = (obj) => { save(); process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const fail = (msg) => { save(); process.stderr.write(msg); process.exit(1); };
const [group, verb] = args;
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };

if (group === "pr" && verb === "view") st.prView ? out(st.prView) : fail("no pull requests found");
else if (group === "pr" && verb === "list") st.prListFail ? fail("HTTP 502") : out(st.prList ?? []);
else if (group === "issue" && verb === "view") flag("--json") === "comments" ? out({ comments: st.comments ?? [] }) : out({ labels: (st.labels ?? []).map((name) => ({ name })) });
else if (group === "issue" && verb === "edit") {
  const labels = new Set(st.labels ?? []);
  args.forEach((a, i) => { if (a === "--add-label") labels.add(args[i + 1]); if (a === "--remove-label") labels.delete(args[i + 1]); });
  st.labels = [...labels];
  save();
  process.exit(0);
} else if (group === "label" && verb === "create") {
  const name = args[2];
  if ((st.existingLabels ?? []).includes(name)) fail(`label with name "${name}" already exists; use \`--force\` to update its color and description`);
  st.existingLabels = [...(st.existingLabels ?? []), name];
  save();
  process.exit(0);
} else fail(`gh-stub: unsupported command ${args.join(" ")}`);
