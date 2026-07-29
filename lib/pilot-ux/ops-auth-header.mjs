/**
 * Hotfix Sprint, Hotfix 2 — the exact piece of logic app/ops/page.tsx's
 * fetch() call depends on, extracted so it's regression-tested. This
 * codebase has no jsdom/testing-library, so the React page itself can't
 * be rendered in the test suite — this is the one non-trivial piece of
 * that page's fix that CAN be tested in isolation without one.
 *
 * @param {string} token
 * @returns {Record<string,string>}
 */
export function buildAdminAuthHeader(token) {
  return token ? { Authorization: "Bearer " + token } : {};
}
