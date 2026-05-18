import { CONFIG } from './config';

export function getTaskDuration(taskName) {
  return CONFIG.TASK_EXPECTED_DURATIONS[taskName] || 90;
}

export function shouldTriggerOverrun(taskName, elapsedSeconds) {
  const expected = getTaskDuration(taskName);

  return elapsedSeconds > expected * CONFIG.TIME_OVERRUN_FACTOR;
}