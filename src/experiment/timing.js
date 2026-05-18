export class TaskTimer {
  constructor() {
    this.startTime = null;
  }

  start() {
    this.startTime = performance.now();
  }

  stop() {
    return performance.now() - this.startTime;
  }
}