/**
 * Phase 10 Del 7: Product Confidence Index. Deterministic — every
 * sub-score is a ratio computed from actual test results passed in,
 * never a subjective number. Re-running the same test results always
 * produces the same score.
 */

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {{
 *   motorRegressionResults: {passed:boolean}[],
 *   runtimeCompileAttempts: {valid:boolean}[],
 *   crossOrgResults: {ok:boolean}[],
 *   robustnessResults: {ok:boolean}[],
 *   allRegressionResults: {passed:boolean}[],
 * }} input
 */
export function productConfidenceIndex(input) {
  const rate = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : null);

  const motorStability = rate(input.motorRegressionResults, (r) => r.passed);
  const runtimeStability = rate(input.runtimeCompileAttempts, (a) => a.valid);
  const organizationIndependence = rate(input.crossOrgResults, (r) => r.ok);
  // Completion/Schema Independence are the SAME evidence as
  // organizationIndependence (the full-day scenario only reports ok if
  // completion + schema renderer + export + adapter all succeeded) —
  // reported as distinct scores per Del 7's list, sourced from the same
  // measured cross-org pass rate rather than double-counting a second
  // independent measurement that doesn't exist.
  const completionStability = organizationIndependence;
  const schemaIndependence = organizationIndependence;
  const exportReliability = rate(input.crossOrgResults, (r) => r.ok); // adapter+export are part of the same scenario result
  const mobileRobustness = rate(input.robustnessResults, (r) => r.ok);
  const regressionCoverage = rate(input.allRegressionResults, (r) => r.passed);

  const scores = {
    motorStability, runtimeStability, completionStability, regressionCoverage,
    organizationIndependence, schemaIndependence, exportReliability, mobileRobustness,
  };

  const measured = Object.values(scores).filter((v) => v !== null);
  const overall = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null;

  const scaled = {};
  for (const [k, v] of Object.entries(scores)) scaled[k] = v === null ? null : round1(v * 10);

  return { subScores: scaled, overall: overall === null ? null : round1(overall * 10) };
}
