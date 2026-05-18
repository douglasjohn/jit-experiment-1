# WebEyeTrack Experiment

A browser-based eye-tracking experiment built with [WebEyeTrack](https://github.com/your-webeyetrack-repo) and Vite. Participants complete a series of cognitive tasks (navigation, form-filling, reading, calculation, and visual search) while gaze, mouse movements, and click events are recorded.

---

## Prerequisites

- **Node.js ≥ 18** — [download here](https://nodejs.org/)
- A **webcam** (required for eye tracking)
- **Chrome or Edge** (WebEyeTrack's worker is optimised for Chromium)
- The **WebEyeTrack model files** (see below)

---

## Quick Start

### 1. Clone / unzip the project

```bash
unzip experiment.zip
cd experiment
```

### 2. Add the WebEyeTrack model files

WebEyeTrack ships a `web/` folder containing the tracker model and worker script. Place it at the **project root** (alongside `index.html`):

```
experiment/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── web/
│       ├── model.json
│       └── worker.js   ← (and any other tracker assets)
└── src/
    └── ...
```

> **Where to get `web/`:** run `npx webeyetrack export` or copy it from the WebEyeTrack package's `dist/web/` folder after `npm install`.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure the study

Open `src/experiment/config.js` and fill in the required fields:

```js
// ── REQUIRED ───────────────────────────────────────────────────────────────
PROLIFIC_COMPLETION_URL: 'https://app.prolific.com/submissions/complete?cc=XXXXXXXX',
DATA_ENDPOINT: 'https://your-server.com/api/submit',   // or '' to use download fallback

// ── OPTIONAL ───────────────────────────────────────────────────────────────
TASK_ORDER: ['broken-nav', 'ambiguous-form', ...],     // reorder or remove tasks
PILOT_MODE: false,   // set true to auto-submit tasks after 60 s during piloting
```

If `DATA_ENDPOINT` is left empty the debrief screen automatically offers participants a JSON download — useful for offline/lab collection.

### 5. Run the development server

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge.

---

## Deployment

### Build for production

```bash
npm run build
```

This outputs a `dist/` folder. Upload its contents to any static host (GitHub Pages, Netlify, Vercel, etc.).

> **GitHub Pages note:** set `base` in `vite.config.js` to `'/your-repo-name/'`.

### Prolific integration

Prolific passes participant identifiers as URL query parameters. The experiment reads these automatically:

```
https://your-study-url.com?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

They appear in the submitted data under `participantIDs.prolific_pid`, `study_id`, and `session_id`.

---

## Researcher Mode

Append `?researcher=true` to the URL to skip consent and calibration and jump straight to the first task. A live monitoring panel appears on the right:

```
http://localhost:5173?researcher=true
```

To jump to a specific task:

```
http://localhost:5173?researcher=true&task=math-problem
```

---

## Data Output

Each session produces a JSON object with the following top-level keys:

| Key | Description |
|-----|-------------|
| `participantId` | Auto-incrementing local ID (`user001`, `user002`, …) |
| `participantIDs` | Prolific PID / Study ID / Session ID from URL params |
| `timestamps` | Session start, end, and total duration |
| `environmentCheck` | Browser / screen info captured at env-check |
| `calibrationQuality` | Mean/max gaze error, per-point measurements |
| `fixationLog` | All detected fixations (position, duration, AOI, task) |
| `rawGazeWindows` | Raw gaze samples captured around key events |
| `mouseEvents` | Throttled mouse-movement log (50 ms, normalised coords) |
| `clickEvents` | Every click (position, target element, task context) |
| `taskResponses` | Per-task answers, response time, dwell-flagged fields |
| `probeResponses` | Clarity ratings + SA confusion level from mid/end probes |
| `nasaTLX` | Six-dimension workload rating |
| `events` | Full chronological event log for replay/debugging |

---

## Customising Tasks

All task definitions live in `src/experiment/taskRunner.js` inside the `TASK_DEFINITIONS` object. Each task has:

```js
'my-task': {
  id:           'my-task',
  type:         'reading',           // informational label
  title:        'My Task',
  instructions: 'Read this and...',  // shown on the instruction screen
  stimulus_html: `<div>...</div>`,   // the actual task content
  aois: [                            // Areas of Interest for gaze analysis
    { id: 'element-id' }             // must match element IDs in stimulus_html
  ],
  questions: [                       // response fields shown BELOW the stimulus
    {
      id:     'my-task-q1',          // used as the HTML input id
      prompt: 'What did you see?',
      type:   'textarea'             // 'text' | 'textarea' | 'hidden'
    }
  ],
  attention_check: true              // optional — shows a banner on the instruction screen
}
```

Add your task ID to `CONFIG.TASK_ORDER` and `CONFIG.TASK_EXPECTED_DURATIONS` in `config.js`.

---

## Project Structure

```
experiment/
├── index.html                  Entry point
├── vite.config.js
├── package.json
├── README.md
└── src/
    ├── main.js                 Boot sequence; eye-tracker initialisation
    ├── style.css               Global styles
    ├── assets/                 Images used in tasks
    ├── experiment/
    │   ├── config.js           ★ Researcher configuration — edit this first
    │   ├── session.js          Session data store (single source of truth)
    │   ├── taskRunner.js       Task definitions + flow orchestration
    │   ├── router.js           Screen switching
    │   ├── router-init.js      Initial screen state
    │   └── ...                 Timer, state, logging helpers
    ├── tracker/
    │   ├── gazeManager.js      AOI resolution, fixation logging, probes
    │   ├── gazePipeline.js     Connects tracker → fixation detector → gazeManager
    │   ├── inputTracker.js     Mouse movement & click recording
    │   ├── calibration.js      9-point calibration system  ← do not modify
    │   ├── fixationDetector.js IVT fixation detection       ← do not modify
    │   └── trackerInitialization.js WebEyeTrack setup      ← do not modify
    ├── UI/
    │   ├── appShell.js         Renders all screen containers
    │   ├── overlays.js         Experience-probe overlay; gaze dot
    │   └── screens/
    │       ├── consent.js      Consent & participant ID generation
    │       ├── calibration.js  Calibration UI (wraps tracker logic)
    │       ├── nasatlx.js      NASA-TLX workload survey
    │       └── debrief.js      Data submission / download fallback
    └── intervention/           Stub hooks for Study 2 adaptive interventions
```

---

## Contact

For questions about this study contact **jd2117@cam.ac.uk**.
