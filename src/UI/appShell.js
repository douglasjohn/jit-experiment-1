export function renderAppShell() {
  document.querySelector('#app').innerHTML = `
    <section id="screen-loading"></section>
    <section id="screen-prolific-welcome"></section>
    <section id="screen-camera-recording-notice"></section>
    <section id="screen-consent"></section>
    <section id="screen-demographics"></section>
    <section id="screen-env-check"></section>
    <section id="screen-calibration"></section>
    <section id="screen-gaze-validation" style="display:none;"></section>
    <section id="screen-task-instruction"></section>
    <section id="screen-task"></section>
    <section id="screen-probe"></section>
    <section id="screen-task-complete"></section>
    <section id="screen-nasatlx"></section>
    <section id="screen-debrief"></section>

    <div id="experience-probe-overlay" style="display:none; position: fixed; inset: 0; z-index: 1200; pointer-events: none;"></div>

    <!-- GLOBAL TRACKER OVERLAYS -->
    <div id="gaze-dot" style="
      position: fixed;
      z-index: 100;
      left: 0px;
      top: 0px;
      background: magenta;
      border-radius: 50%;
      opacity: 0.7;
      width: 30px;
      height: 30px;
      display: none;
      pointer-events: none;
    "></div> 

    <div id="fixation-indicator" style="
      position: fixed;
      z-index: 99;
      background: cyan;
      border-radius: 50%;
      opacity: 0.5;
      width: 20px;
      height: 20px;
      display: none;
      pointer-events: none;
      border: 2px solid blue;
    "></div>

    <div id="calibration-dot" style="
      position: fixed;
      z-index: 101;
      width: 30px;
      height: 30px;
      background: red;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      display: none;
      pointer-events: none;
      transform: translate(-50%, -50%);
    "></div>

    <video
      id="webcam-video"
      autoplay
      playsinline
      style="display:none;"
    ></video>
  `;
}