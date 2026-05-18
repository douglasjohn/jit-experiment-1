import { shouldTriggerOverrun } from './timers';

export function checkOverrun(taskName, startTime, onOverrun) {
  const elapsed = (Date.now() - startTime) / 1000;

  if (shouldTriggerOverrun(taskName, elapsed)) {
    onOverrun?.({ taskName, elapsed });
  }
}