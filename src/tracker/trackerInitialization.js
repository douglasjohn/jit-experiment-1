import {
  WebcamClient,
  WebEyeTrackProxy
} from 'webeyetrack';

export async function initializeTracker(videoElementId) {
  const tempStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  tempStream.getTracks().forEach(track => track.stop());

  const baseUrl = import.meta.env.BASE_URL;

  const MODEL_URL =
    `${window.location.origin}${baseUrl}web/model.json`;

  console.log('🧠 Using BlazeGaze model:', MODEL_URL);

  const webcamClient = new WebcamClient(videoElementId);

  const tracker = new WebEyeTrackProxy(webcamClient, {
    modelPath: MODEL_URL
  });

  return tracker;
}