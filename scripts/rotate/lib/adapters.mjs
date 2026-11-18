// An adapter rotates one kind of credential.
//   create(ctx)  -> { values: { <paramKey>: string }, oldRef }   new credential in memory; oldRef is a non-secret id
//   check(ctx, values) -> boolean                                   proves the NEW value works
//   revoke(ctx, oldRef)                                             disables the old credential (only after check)
// ctx = { entry, aws, browser }. Adapters must not print values or put them in arguments.

/** IAM access key of an IAM user. Fully scripted through the AWS CLI. */
export const awsIamKey = {
  create({ entry, aws }) {
    const list = aws(["iam", "list-access-keys", "--user-name", entry.iamUser, "--query", "AccessKeyMetadata[].AccessKeyId", "--output", "json"]);
    if (list.status !== 0) throw new Error(`cannot list access keys of ${entry.iamUser}`);
    const existing = JSON.parse(list.stdout);
    if (existing.length >= 2) throw new Error(`${entry.iamUser} already has 2 access keys; delete the unused one first`);
    const made = aws(["iam", "create-access-key", "--user-name", entry.iamUser, "--output", "json"]);
    if (made.status !== 0) throw new Error(`create-access-key failed for ${entry.iamUser}`);
    const key = JSON.parse(made.stdout).AccessKey;
    return { values: { id: key.AccessKeyId, secret: key.SecretAccessKey }, oldRef: existing[0] ?? null };
  },
  check({ aws }, values) {
    // IAM keys take a few seconds to propagate; the caller may retry.
    const r = aws(["sts", "get-caller-identity", "--query", "Account", "--output", "text"], { env: { AWS_ACCESS_KEY_ID: values.id, AWS_SECRET_ACCESS_KEY: values.secret, AWS_SESSION_TOKEN: "" } });
    return r.status === 0;
  },
  revoke({ entry, aws }, oldRef) {
    if (!oldRef) return;
    const r = aws(["iam", "delete-access-key", "--user-name", entry.iamUser, "--access-key-id", oldRef]);
    if (r.status !== 0) throw new Error(`delete-access-key failed for ${entry.iamUser}`);
  },
};

/** Provider web page driven through a recipe (see scripts/rotate/recipes). */
export const browser = {
  async create({ entry, browser: session, target }) {
    const recipe = await session.recipe(entry.provider);
    return recipe.create(await session.page(), entry, { current: (key = "secret") => target.get(entry.params[key]) });
  },
  async check({ entry, browser: session }, values) {
    const recipe = await session.recipe(entry.provider);
    return recipe.check(values, entry);
  },
  async revoke({ entry, browser: session }, oldRef) {
    const recipe = await session.recipe(entry.provider);
    return recipe.revoke(await session.page(), oldRef, entry);
  },
};

export const ADAPTERS = { "aws-iam-key": awsIamKey, browser };
