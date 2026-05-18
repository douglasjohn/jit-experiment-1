import {
  WebcamClient,
  WebEyeTrackProxy
} from 'webeyetrack';

let fetchPatched = false;

function patchWebEyeTrackFetch() {
  if (fetchPatched) return;

  const originalFetch = window.fetch;
  const baseUrl = import.meta.env.BASE_URL;

  window.fetch = function (...args) {
    const url = args[0];

    if (typeof url === 'string' && url.startsWith('/web/')) {
      args[0] = `${baseUrl}${url.slice(1)}`;

      console.log(
        '🔁 Redirecting WebEyeTrack request:',
        url,
        '→',
        args[0]
      );
    }

    return originalFetch.apply(this, args);
  };

  fetchPatched = true;
}

export async function initializeTracker(videoElementId) {
  const tempStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  tempStream.getTracks().forEach(track => track.stop());

  // KEEP THIS PATCH ACTIVE
  patchWebEyeTrackFetch();

  const webcamClient = new WebcamClient(videoElementId);
  const tracker = new WebEyeTrackProxy(webcamClient);

  return tracker;
}