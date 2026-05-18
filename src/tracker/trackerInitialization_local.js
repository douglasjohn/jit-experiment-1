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

  const modelResponse = await fetch(
    `${import.meta.env.BASE_URL}web/model.json`
  );

  if (!modelResponse.ok) {
    throw new Error(
      `Model file not accessible: ${modelResponse.status}`
    );
  }

  const webcamClient = new WebcamClient(videoElementId);

  const tracker = new WebEyeTrackProxy(webcamClient);

  return tracker;
}