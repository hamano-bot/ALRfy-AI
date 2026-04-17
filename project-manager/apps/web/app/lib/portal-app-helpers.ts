/** ポータルが返す `route` が同一オリジン相対か、絶対 URL かを判定する。 */
export function isExternalPortalRoute(route: string): boolean {
  return /^https?:\/\//i.test(route);
}

/** api_contracts の `visibility` に沿い、クリック可能な状態か。 */
export function isPortalAppInteractive(visibility: string): boolean {
  return visibility === "visible_enabled";
}
