const fs = require('fs');

try {
  const marker = '<!-- openapi-artifact-drift -->';
  const diffPath = process.env.OPENAPI_DIFF_PATH;
  const rawDiff = fs.existsSync(diffPath)
    ? fs.readFileSync(diffPath, 'utf8')
    : 'Diff file was not produced by verify-openapi.ps1.';
  const maxLength = 60000;
  const diff = rawDiff.length > maxLength
    ? `${rawDiff.slice(0, maxLength)}\n... diff truncated ...`
    : rawDiff;

  const body = `${marker}
  Warning: the generated OpenAPI artifact drifted from the committed \`docs/openapi/quizymode-api.json\` file during CI.

  This warning is non-blocking on pull requests, but the generated artifact should still be regenerated and committed before merge.

  Run:
  \`\`\`powershell
  ./scripts/verify-openapi.ps1 -Configuration Release
  \`\`\`

  <details>
  <summary>OpenAPI diff</summary>

  \`\`\`diff
  ${diff}
  \`\`\`
  </details>`;

  const { owner, repo } = context.repo;
  const issue_number = context.issue.number;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100
  });

  const existing = comments.find(comment =>
    comment.user?.type === 'Bot' && comment.body?.includes(marker)
  );

  const normalize = text => (text ?? '').replace(/\r\n/g, '\n').trim();
  if (existing && normalize(existing.body) === normalize(body)) {
    console.log(`Comment ${existing.id} already up to date; not rewriting it.`);
    return;
  }

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    });
    return;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number,
    body
  });
} catch (error) {
  console.log(`Skipping OpenAPI drift comment: ${error.message}`);
}
