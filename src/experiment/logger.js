import { sessionData } from './session';

export function logEvent(type, payload) {
  sessionData.events.push({
    type,
    payload,
    timestamp: Date.now()
  });
}

export function logGaze(gaze) {
  logEvent('gaze', gaze);
}

export function logFixation(fixation) {
  logEvent('fixation', fixation);
}

export function logTask(event) {
  logEvent('task', event);
}

export function logCalibration(metrics) {
  logEvent('calibration', metrics);
}