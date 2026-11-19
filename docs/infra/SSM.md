# SSM Parameter Store runbook

Production secrets live in AWS Systems Manager Parameter Store as `SecureString` parameters (standard tier, free). The API reads them at startup when `APP_Config__Ssm__Enabled=true` (#782). This page is the owner's runbook for the one-off AWS steps (#784) and the safe habits around them.

**Rule for every command below:** a secret value is never typed, pasted into a command line, or echoed. Values come from a file you control or a hidden prompt, through `scripts/ops/ssm-put-secret.ps1`. Read-backs show `Name`, `Type`, `Version` only.

## Naming

- `/quizymode/prod/<Section>/<Key>` for what the API reads. `/` becomes `:` in configuration, so `/quizymode/prod/Gemini/ApiKey` is `Gemini:ApiKey`.
- `/quizymode/deploy/*` for what the deploy workflow needs to bootstrap (the access key pair of the API's SSM reader). The API's reader cannot read this path.
- Type `SecureString`, tier Standard, default AWS-managed key `alias/aws/ssm`.

## Parameters the API reads

Names only, taken from the options classes and `LlmVendors`. All are secret.

| Parameter | Configuration key |
|---|---|
| `/quizymode/prod/ConnectionStrings/PostgreSQL` | `ConnectionStrings:PostgreSQL` |
| `/quizymode/prod/Media/S3/AccessKeyId` | `Media:S3:AccessKeyId` |
| `/quizymode/prod/Media/S3/SecretAccessKey` | `Media:S3:SecretAccessKey` |
| `/quizymode/prod/Email/Smtp/Password` | `Email:Smtp:Password` |
| `/quizymode/prod/GitHubSeedSync/Token` | `GitHubSeedSync:Token` |
| `/quizymode/prod/GrafanaCloud/ApiKey` | `GrafanaCloud:ApiKey` |
| `/quizymode/prod/Gemini/ApiKey` | `Gemini:ApiKey` |
| `/quizymode/prod/Groq/ApiKey` | `Groq:ApiKey` |
| `/quizymode/prod/Cerebras/ApiKey` | `Cerebras:ApiKey` |
| `/quizymode/prod/OpenRouter/ApiKey` | `OpenRouter:ApiKey` |
| `/quizymode/prod/OpenAI/ApiKey` | `OpenAI:ApiKey` |

Non-secret settings (Cognito authority, bucket names, hosts) stay in the container environment.

## Store a value

Put the value in a file only you can read, store it, then remove the file:

```powershell
.\scripts\ops\ssm-put-secret.ps1 -Name /quizymode/prod/Gemini/ApiKey -FromFile C:\secure\gemini.txt
Remove-Item C:\secure\gemini.txt
```

Without `-FromFile` the script asks for the value with a hidden prompt:

```powershell
.\scripts\ops\ssm-put-secret.ps1 -Name /quizymode/prod/Gemini/ApiKey
```

It prints the name and the new version, deletes nothing, and refuses a name outside `/quizymode/prod/` and `/quizymode/deploy/`.

## Read back safely

```powershell
.\scripts\ops\ssm-list-parameters.ps1
.\scripts\ops\ssm-list-parameters.ps1 -Path /quizymode/deploy/
```

Both print `Name`, `Type`, `Version` and nothing else.

## IAM user `quizymode-api-config` (the API's reader)

One inline policy, read-only on the production path. Replace `<account>` with the AWS account id:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath", "ssm:GetParameter"],
      "Resource": "arn:aws:ssm:us-east-1:<account>:parameter/quizymode/prod/*"
    }
  ]
}
```

Create an access key for this user in the IAM console (Security credentials) and save the pair to two private files, then store it under the deploy path:

```powershell
.\scripts\ops\ssm-put-secret.ps1 -Name /quizymode/deploy/ApiConfig/AccessKeyId -FromFile C:\secure\id.txt
.\scripts\ops\ssm-put-secret.ps1 -Name /quizymode/deploy/ApiConfig/SecretAccessKey -FromFile C:\secure\secret.txt
Remove-Item C:\secure\id.txt, C:\secure\secret.txt
```

The reader's policy does not cover `/quizymode/deploy/*`. The deploy role (`github-actions-quizymode-deploy`) gets one more statement: `ssm:GetParameter` on `arn:aws:ssm:us-east-1:<account>:parameter/quizymode/deploy/*` only, so the workflow can pass the pair to the container as `APP_Config__Ssm__*` without printing it.

## Does the reader need `kms:Decrypt`?

With the default AWS-managed key `alias/aws/ssm` it normally does not: the key policy allows principals that may use SSM in the account. Test it once with the six placeholder parameters (value `DUMMY-not-a-secret`) using the reader's access key in a separate profile. Listing names only, with decryption on:

```powershell
aws ssm get-parameters-by-path --path /quizymode/prod/ --recursive --with-decryption --query 'Parameters[].Name' --profile quizymode-api-config
```

If this succeeds, no KMS statement is needed. If it fails with `AccessDeniedException` on KMS, add `kms:Decrypt` on the key `alias/aws/ssm` to the reader's policy and record that here. Result of the test: _not run yet (#784)_.

## Cut-over and rollback

1. Store every parameter in the table above (the rotation tool in `docs/infra/ROTATION.md` can create new values straight into SSM later).
2. Store the bootstrap pair under `/quizymode/deploy/`.
3. Set `APP_Config__Ssm__Enabled=true`, `APP_Config__Ssm__Region`, `APP_Config__Ssm__AccessKeyId`, `APP_Config__Ssm__SecretAccessKey` on the container and deploy. Check the startup log line `Configuration loaded from SSM` and `GET /admin/config-sources` (names and sources, no values).
4. Keep the old environment values until the API has run on SSM for a while.
5. Remove the old secret environment values only after that.

**Rollback:** set `APP_Config__Ssm__Enabled=false` in the Lightsail console and deploy; the API goes back to the environment values, which are kept until step 5. If SSM is enabled and unreachable the API refuses to start rather than run without secrets.
