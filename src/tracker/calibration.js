import { calculateCalibrationQuality } from './qualityMetrics';

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
    el.style.animation = 'dotShrink 2s ease-in forwards';

    // clear previous timer
    if (this._dotTimer) clearTimeout(this._dotTimer);

    this._dotTimer = setTimeout(() => {
      this.nextDot();
    }, 2000);
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
            y: gazeResult.normPog[1]
          });
        }
      };

      await new Promise(resolve => setTimeout(resolve, 1000));

      this.tracker.onGazeResults = originalCallback;

      if (el) el.style.display = 'none';

      if (samples.length > 0) {
        const meanX =
          samples.reduce((s, p) => s + p.x, 0) / samples.length;

        const meanY =
          samples.reduce((s, p) => s + p.y, 0) / samples.length;

        const error = Math.sqrt(
          Math.pow(meanX - dot.normalizedX, 2) +
          Math.pow(meanY - dot.normalizedY, 2)
        );

        measurements.push({
          dot,
          meanGaze: { x: meanX, y: meanY },
          error,
          samples: samples.length
        });
      }
    }

    const quality = calculateCalibrationQuality(measurements);

    this.qualityMeasurements = measurements;
    this.biasX = quality.biasX;
    this.biasY = quality.biasY;

    console.log(
      `Bias correction applied — x: ${this.biasX.toFixed(4)}, y: ${this.biasY.toFixed(4)}`
    );

    this.onQualityMeasured?.(quality);
  }
}