/**
 * Cognito groups that grant admin UI access (AC 4.1.4, #809). Must match the API allowlist
 * (`Authentication:AdminGroups`, default `["Admins"]`). The API is the real gate; this only decides what the SPA shows.
 */
export const ADMIN_GROUPS: readonly string[] = ["Admins"];

/** True when any group exactly equals an allowlisted name. Case-sensitive, like Cognito group names. */
export function isAdminGroups(groups: readonly string[]): boolean {
  return groups.some((group) => ADMIN_GROUPS.includes(group));
}
