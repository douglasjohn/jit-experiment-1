import { calculateCalibrationQuality } from './qualityMetrics';
import { CONFIG } from '../experiment/config';

export class CalibrationSystem {
  constructor(webEyeTrackProxy) {
    this.tracker = webEyeTrackProxy;

    this.calibrationDots = this.generate9PointCalibration();

    this.currentDotIndex = 0;
    this.isCalibrating = false;
    this.isAdvancing = false;

    this.qualityMeasurements = [];

    this.biasX = 0;
    this.biasY = 0;

    this._dotTimer = null;
    this._finished = false;

    // ── Calibration parameters (mode-dependent) ────────────────────────────────────
    const mode = CONFIG.CALIBRATION_MODE || 'enhanced';
    if (mode === 'legacy') {
      // Bare-bones calibration: quick and simple
      this.DWELL_TIME_MS = 2000;     // original dwell
      this.MEASUREMENT_TIME_MS = 1000; // original measurement duration
      this.MIN_SAMPLES = 5;          // low threshold
      this.MSE_THRESHOLD = Infinity; // no gating
      this.USE_OUTLIER_REJECTION = false;
    } else {
      // Enhanced calibration: stricter and more robust (default)
      this.DWELL_TIME_MS = 3000;     // longer dwell per point
      this.MEASUREMENT_TIME_MS = 1500; // collect samples for longer
      this.MIN_SAMPLES = 20;         // require reasonable number of samples
      this.MSE_THRESHOLD = 0.25;     // require MSE < 25% (gating requirement)
      this.USE_OUTLIER_REJECTION = true;
    }

    this.onCalibrationComplete = null;
    this.onQualityMeasured = null;
  }

  generate9PointCalibration() {
    const positions = [];
    const margin = 0.1;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = margin + (col * (1 - 2 * margin) / 2);
        const y = margin + (row * (1 - 2 * margin) / 2);

        positions.push({
          x,
          y,
          normalizedX: -0.5 + x,
          normalizedY: -0.5 + y
        });
      }
    }

    // Fisher-Yates shuffle
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    return positions;
  }

  startCalibration() {
    this._finished = false;
    this.isCalibrating = true;
    this.isAdvancing = false;

    this.currentDotIndex = 0;
    this.qualityMeasurements = [];

    const warmupEl = document.getElementById('status-text');

    if (warmupEl) {
      warmupEl.textContent = 'Preparing eye tracker... (1s)';
    }

    setTimeout(() => {
      if (warmupEl) {
        warmupEl.textContent =
          'Calibrating — follow the dot with your eyes';
      }

      this.showCalibrationDot();
    }, 1000);
  }

  showCalibrationDot() {
    if (this.currentDotIndex >= this.calibrationDots.length) {
      this.finishCalibration();
      return;
    }

    const dot = this.calibrationDots[this.currentDotIndex];
    const el = document.getElementById('calibration-dot');

    if (!el) return;

    // FULL RESET (prevents animation bugs)
    el.style.display = 'none';
    el.style.animation = 'none';
    void el.offsetWidth; // force reflow

    el.style.left = `${dot.x * 100}%`;
    el.style.top = `${dot.y * 100}%`;
    el.style.display = 'block';
    // Longer dwell animation to match DWELL_TIME_MS
    el.style.animation = `dotShrink ${this.DWELL_TIME_MS / 1000}s ease-in forwards`;

    // clear previous timer
    if (this._dotTimer) clearTimeout(this._dotTimer);

    this._dotTimer = setTimeout(() => {
      this.nextDot();
    }, this.DWELL_TIME_MS);
  }

  nextDot() {
    if (this.isAdvancing) return;
    this.isAdvancing = true;

    const dot = this.calibrationDots[this.currentDotIndex];

    if (!dot) {
      this.isAdvancing = false;
      return;
    }

    this.tracker.worker.postMessage({
      type: 'click',
      payload: {
        x: dot.normalizedX,
        y: dot.normalizedY
      }
    });

    this.currentDotIndex++;

    const el = document.getElementById('calibration-dot');
    if (el) el.style.display = 'none';

    setTimeout(() => {
      this.isAdvancing = false;
      this.showCalibrationDot();
    }, 300);
  }

  async finishCalibration() {
    if (this._finished) return;

    this._finished = true;
    this.isCalibrating = false;
    this.isAdvancing = false;

    if (this._dotTimer) {
      clearTimeout(this._dotTimer);
      this._dotTimer = null;
    }

    const el = document.getElementById('calibration-dot');
    if (el) el.style.display = 'none';

    await this.measureCalibrationQuality();

    if (this.onCalibrationComplete) {
      this.onCalibrationComplete(this.qualityMeasurements);
    }
  }

  async measureCalibrationQuality() {
    const measurements = [];

    for (const dot of this.calibrationDots) {
      const samples = [];
      const el = document.getElementById('calibration-dot');

      if (el) {
        el.style.left = `${dot.x * 100}%`;
        el.style.top = `${dot.y * 100}%`;
        el.style.display = 'block';
      }

      const originalCallback = this.tracker.onGazeResults;

      this.tracker.onGazeResults = (gazeResult) => {
        if (originalCallback) originalCallback(gazeResult);

        if (gazeResult.gazeState === 'open') {
          samples.push({
            x: gazeResult.normPog[0],
            y: gazeResult.normPog[1],
            timestamp: gazeResult.timestamp
          });
        }
      };

      // Collect for longer duration to get more samples
      await new Promise(resolve => setTimeout(resolve, this.MEASUREMENT_TIME_MS));

      this.tracker.onGazeResults = originalCallback;

      if (el) el.style.display = 'none';

      if (samples.length >= this.MIN_SAMPLES) {
        let cleaned = samples;
        
        // Optionally apply outlier rejection
        if (this.USE_OUTLIER_REJECTION) {
          cleaned = this._removeOutliers(samples, dot);
        }

        if (cleaned.length > 0) {
          const meanX = cleaned.reduce((s, p) => s + p.x, 0) / cleaned.length;
          const meanY = cleaned.reduce((s, p) => s + p.y, 0) / cleaned.length;

          const error = Math.sqrt(
            Math.pow(meanX - dot.normalizedX, 2) +
            Math.pow(meanY - dot.normalizedY, 2)
          );

          measurements.push({
            dot,
            meanGaze: { x: meanX, y: meanY },
            error,
            samples: cleaned.length,
            originalSamples: samples.length
          });
        }
      }
    }

    const quality = calculateCalibrationQuality(measurements);

    this.qualityMeasurements = measurements;
    this.biasX = quality.biasX;
    this.biasY = quality.biasY;

    console.log(
      `Bias correction applied — x: ${this.biasX.toFixed(4)}, y: ${this.biasY.toFixed(4)}`
    );
    console.log(`Calibration MSE: ${quality.meanError?.toFixed(4) || 'N/A'}`);

    this.onQualityMeasured?.(quality);
  }

  // ── Outlier rejection via IQR method ──────────────────────────────────────
  _removeOutliers(samples, dot) {
    // Compute distances from target for each sample
    const distances = samples.map(s => 
      Math.sqrt(
        Math.pow(s.x - dot.normalizedX, 2) +
        Math.pow(s.y - dot.normalizedY, 2)
      )
    ).sort((a, b) => a - b);

    if (distances.length < 4) return samples; // Too few to filter

    // Compute IQR
    const q1Idx = Math.floor(distances.length * 0.25);
    const q3Idx = Math.floor(distances.length * 0.75);
    const q1 = distances[q1Idx];
    const q3 = distances[q3Idx];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    // Filter and return samples within bounds
    return samples.filter(s => {
      const dist = Math.sqrt(
        Math.pow(s.x - dot.normalizedX, 2) +
        Math.pow(s.y - dot.normalizedY, 2)
      );
      return dist >= lowerBound && dist <= upperBound;
    });
  }
}