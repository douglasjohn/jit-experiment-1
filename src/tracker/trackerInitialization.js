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

  // Intercept fetch to redirect /web/ requests to the correct base path
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    
    // If it's a web/ request without the base path, prepend it
    if (typeof url === 'string' && url.startsWith('/web/')) {
      args[0] = baseUrl + url.slice(1); // Remove leading slash and prepend baseUrl
    }
    
    return originalFetch.apply(this, args);
  };

  const webcamClient = new WebcamClient(videoElementId);
  const tracker = new WebEyeTrackProxy(webcamClient);

  // Restore original fetch after initialization
  window.fetch = originalFetch;

  return tracker;
}