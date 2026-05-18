export function calculateCalibrationQuality(measurements) {
  if (measurements.length === 0) {
    return {
      measurements: [],
      meanError: NaN,
      maxError: NaN,
      overallQuality: 'failed',
      biasX: 0,
      biasY: 0
    };
  }

  const valid = measurements.filter(m => !isNaN(m.error));

  const meanError =
    valid.reduce((s, m) => s + m.error, 0) / valid.length;

  const maxError = Math.max(...valid.map(m => m.error));

  const biasX =
    valid.reduce((s, m) => s + (m.meanGaze.x - m.dot.normalizedX), 0) /
    valid.length;

  const biasY =
    valid.reduce((s, m) => s + (m.meanGaze.y - m.dot.normalizedY), 0) /
    valid.length;

  return {
    measurements,
    meanError,
    maxError,
    biasX,
    biasY,
    overallQuality:
      meanError < 0.05
        ? 'excellent'
        : meanError < 0.1
        ? 'good'
        : meanError < 0.2
        ? 'fair'
        : 'poor'
  };
}