const fs = require('fs');

try {
  const marker = '<!-- coverage-summary -->';
  const summaryPath = process.env.COVERAGE_SUMMARY_PATH;
  const summary = summaryPath && fs.existsSync(summaryPath)
    ? fs.readFileSync(summaryPath, 'utf8')
    : 'Coverage summary was not produced.';

  const body = `${marker}
  ${summary}`;

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
  console.log(`Skipping coverage summary comment: ${error.message}`);
}
