// Runs the github-script bodies extracted verbatim from ci.yml against a mocked GitHub REST client.
const fs = require('fs'); const path = require('path');
const dir = __dirname;
const comments = []; const calls = [];
let nextId = 1;
const github = {
  paginate: async () => comments.map(c => ({ ...c })),
  rest: { issues: {
    listComments: () => {},
    createComment: async ({ body }) => { calls.push('create'); comments.push({ id: nextId++, body, user: { type: 'Bot' } }); },
    updateComment: async ({ comment_id, body }) => { calls.push('update'); comments.find(c => c.id === comment_id).body = body; },
  } },
};
const context = { repo: { owner: 'o', repo: 'r' }, issue: { number: 1 } };
async function runStep(file, env) {
  Object.assign(process.env, env);
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'require', 'console', code);
  const logs = []; await fn(github, context, require, { log: m => logs.push(m) });
  return logs;
}
(async () => {
  const diffA = path.join(dir, 'diffA.txt'); fs.writeFileSync(diffA, '-old\n+new\n');
  const diffB = path.join(dir, 'diffB.txt'); fs.writeFileSync(diffB, '-old\n+newer\n');
  const report = [];
  for (const [label, diff] of [['run 1 (drift A)', diffA], ['rerun (same drift A)', diffA], ['run 3 (drift B)', diffB], ['rerun (same drift B)', diffB]]) {
    const before = calls.length; const logs = await runStep('drift-step.js', { OPENAPI_DIFF_PATH: diff });
    report.push(`${label}: api writes=${JSON.stringify(calls.slice(before))} log=${JSON.stringify(logs)}`);
  }
  const cov = path.join(dir, 'cov.md'); fs.writeFileSync(cov, '## Coverage Summary\n- Line coverage: **53%**\n');
  for (const label of ['coverage run 1', 'coverage rerun (identical)']) {
    const before = calls.length; const logs = await runStep('coverage-step.js', { COVERAGE_SUMMARY_PATH: cov });
    report.push(`${label}: api writes=${JSON.stringify(calls.slice(before))} log=${JSON.stringify(logs)}`);
  }
  report.push(`total comments=${comments.length}`);
  console.log(report.join('\n'));
})();
