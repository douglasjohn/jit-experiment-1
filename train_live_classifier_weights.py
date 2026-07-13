"""
train_live_classifier_weights.py

Trains a logistic regression on EXACTLY the 4 features liveClassifier.js
computes client-side (revisitRate, hesitation, entropy, recentProgress),
using the same window (3000ms) and confusion labels as
confusion_gp_pipeline.py. Exports weights to a JSON your JS can load
directly — no feature-parity risk since the feature code is mirrored
line-for-line from liveClassifier.js's computeFeatures().

Usage: python train_live_classifier_weights.py participant1.json participant2.json ...
Output: src/intervention/live_classifier_weights.json
"""
import json, math, sys
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

WINDOW_MS = 3000
CONFUSION_CLARITY_THRESHOLD = 3

def load(path):
    with open(path) as f: return json.load(f)

def session_epoch(data):
    events = data.get("events", [])
    return float(min(e["timestamp"] for e in events)) if events else 0.0

def clamp(v, lo=0, hi=1): return max(lo, min(hi, v))

def compute_features(gaze_samples, mouse_events, window_start, window_end):
    """Mirrors liveClassifier.js computeFeatures() exactly."""
    samples = [g for g in gaze_samples if window_start <= g["t"] < window_end]
    if not samples:
        return {"revisitRate": 0, "hesitation": 0, "entropy": 0, "recentProgress": 0}

    aoi_ids = [s.get("aoi_id") for s in samples if s.get("aoi_id")]
    seen, revisits = set(), 0
    for a in aoi_ids:
        if a in seen: revisits += 1
        seen.add(a)
    revisit_rate = revisits / len(aoi_ids) if aoi_ids else 0.0

    xs = [s.get("x", 0) for s in samples]
    ys = [s.get("y", 0) for s in samples]
    if len(samples) > 3:
        mx, my = np.mean(xs), np.mean(ys)
        entropy = clamp(math.sqrt(np.mean([(x - mx) ** 2 + (y - my) ** 2 for x, y in zip(xs, ys)])) * 1.4)
    else:
        entropy = 0.0

    mpath = [m for m in mouse_events if window_start <= m["t"] < window_end][-8:]
    if len(mpath) < 2:
        hesitation = 0.0
    else:
        path_len = sum(
            math.hypot(mpath[i]["x_norm"] - mpath[i - 1]["x_norm"], mpath[i]["y_norm"] - mpath[i - 1]["y_norm"])
            for i in range(1, len(mpath))
        )
        net = math.hypot(mpath[-1]["x_norm"] - mpath[0]["x_norm"], mpath[-1]["y_norm"] - mpath[0]["y_norm"])
        hesitation = path_len / (net + 1e-6) if path_len > 1e-6 else 1.0

    recent_progress = clamp((samples[-1]["t"] - samples[0]["t"]) / WINDOW_MS) if len(samples) >= 2 else 0.0

    return {"revisitRate": revisit_rate, "hesitation": hesitation, "entropy": entropy, "recentProgress": recent_progress}

def extract_labels(data):
    """Same confusion labeling as confusion_gp_pipeline.py's extract_labels, trimmed."""
    task_times = {}
    for ev in data.get("events", []):
        tid = ev.get("task_id")
        if not tid: continue
        if ev["type"] == "task-begin":
            task_times.setdefault(tid, {})["start"] = ev["timestamp"]
        elif ev["type"] in ("task-submit", "auto-advance-start"):
            task_times.setdefault(tid, {}).setdefault("end", ev["timestamp"])
    probe_clarity = {}
    for pr in data.get("probeResponses", []):
        if pr.get("clarity_rating") is not None:
            probe_clarity.setdefault(pr["task_id"], []).append(pr["clarity_rating"])
    labels = []
    for tid, t in task_times.items():
        if "start" not in t: continue
        ratings = probe_clarity.get(tid, [])
        confused = int(np.mean(ratings) <= CONFUSION_CLARITY_THRESHOLD) if ratings else 0
        labels.append({"task_id": tid, "start": t["start"], "end": t.get("end", t["start"] + 60000), "confused": confused})
    return labels

def build_dataset(paths):
    X, y = [], []
    for path in paths:
        data = load(path)
        gaze = data.get("gazeLog", [])
        mouse = data.get("mouseEvents", [])
        for lbl in extract_labels(data):
            t = lbl["start"]
            while t + WINDOW_MS <= lbl["end"]:
                f = compute_features(gaze, mouse, t, t + WINDOW_MS)
                X.append([f["revisitRate"], f["hesitation"], f["entropy"], f["recentProgress"]])
                y.append(lbl["confused"])
                t += 500  # matches SAMPLE_INTERVAL-ish stride; adjust if desired
    return np.array(X), np.array(y)

def main():
    paths = sys.argv[1:]
    if not paths:
        print("Usage: python train_live_classifier_weights.py participant1.json ...")
        return

    X, y = build_dataset(paths)
    if len(set(y)) < 2:
        print("Need both confused and non-confused labeled windows to train. Aborting.")
        return

    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)
    clf = LogisticRegression(max_iter=1000).fit(Xs, y)

    out = {
        "feature_order": ["revisitRate", "hesitation", "entropy", "recentProgress"],
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coef": clf.coef_[0].tolist(),
        "intercept": float(clf.intercept_[0]),
        "trained_n_windows": int(len(y)),
        "trained_n_positive": int(y.sum()),
    }
    out_path = Path("src/intervention/live_classifier_weights.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {out_path} — trained on {len(y)} windows ({y.sum()} confused).")

if __name__ == "__main__":
    main()