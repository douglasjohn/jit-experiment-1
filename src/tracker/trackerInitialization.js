import {
  WebcamClient,
  WebEyeTrackProxy
} from 'webeyetrack';

export async function initializeTracker(videoElementId) {
  const tempStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  tempStream.getTracks().forEach(t => t.stop());

  const baseUrl = import.meta.env.BASE_URL;

  const webcamClient = new WebcamClient(videoElementId);

  // Pass explicit paths for both model and worker to the proxy
  const tracker = new WebEyeTrackProxy(webcamClient, {
    modelPath: `${baseUrl}web/model.json`,
    workerPath: `${baseUrl}web/worker.js`
  });

  return tracker;
}