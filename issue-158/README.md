# #158 policy-acceptance sync

`before-fix.txt` / `after-fix.txt`: `AuthContext.policySync.test.tsx` (5 tests, real policy storage, mocked Amplify/API) run against `main` code and against the fix. Before: the two cases where the access token's username is the account sub and the email is only on the ID token fail, the acceptance is never posted. After: all 5 pass. Whether production's Cognito uses that token shape is not proven; production had 0 `UserPolicyAcceptances` rows after 5 sign-ups since the table was added.
