import { WebcamClient, WebEyeTrackProxy } from 'webeyetrack';

export async function initializeTracker(videoElementId) {
  const webcamClient = new WebcamClient(videoElementId);
  const tracker = new WebEyeTrackProxy(webcamClient);

  return tracker;
}