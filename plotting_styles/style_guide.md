# Scientific Plotting & Data Visualization Style Guide

This style guide establishes the design language, color hierarchy, typography, and Matplotlib standards for all scientific figures in this project. Figures built with this guide are designed to be publication-ready for peer-reviewed journals, conferences, and technical reports.

---

## 1. Core Principles & Rules

1. **Caption-First Philosophy (No Plot Titles):** 
   Figures must **never** include in-plot titles (`ax.set_title()`). Titles belong in the paper’s LaTeX/Markdown figure caption (`\caption{...}`).
2. **Explicit, Readable Axes:**
   Every plot must feature clearly defined axis lines (spines), labeled ticks, and informative axis labels complete with units (e.g., `Normalized Screen X`, `Time (s)`, `Displacement (px)`).
3. **Layering via `zorder`:**
   Visual elements must be explicitly layered using Matplotlib’s `zorder` parameter so high-priority data (means, reference targets) always sit above background elements (grids, raw scatter clouds).
4. **Subtle Neutral Viewports:**
   Display viewports, backgrounds, and grids must remain neutral and non-distracting (`#f8fafc` background, `#e2e8f0` gridlines) to allow data elements to stand out with high contrast.
5. **High DPI Vector & Raster Export:**
   Always export vector graphics (`PDF`) for publication compilation and high-resolution raster images (`300 DPI PNG`) for quick previews/web document embeds.

---

## 2. Canvas Specs & Dimensions

| Target Use Case | Aspect Ratio | Dimensions (`figsize`) | Export Formats |
| :--- | :--- | :--- | :--- |
| **Widescreen / Full-Width Display** | 16:9 | `(10.0, 5.625)` | `.pdf` + `.png` (300 DPI) |
| **Single-Column Paper Figure** | 4:3 | `(6.0, 4.5)` | `.pdf` + `.png` (300 DPI) |
| **Two-Column Paper Figure** | 16:9 or 2:1 | `(3.5, 2.0)` | `.pdf` + `.png` (300 DPI) |

---

## 3. Official Color Palette

Use these exact hex codes across all project plots for visual consistency.

### Primary Dataset Palette
* **Primary Sky Blue (WebEyeTrack / Main Series):** `#0284c7`
* **Deep Blue Accent (Means / Centroids):** `#0369a1`
* **Secondary Crimson (GazePoint / Comparison Series):** `#e11d48`
* **Deep Crimson Accent (Means / Centroids):** `#be123c`

### Neutrals & Grid Palette
* **Canvas / Figure Background:** `#ffffff` (Pure White)
* **Viewport Area Fill:** `#f8fafc` (Slate 50)
* **Spines & Axis Boundaries:** `#475569` (Slate 600)
* **Axis Labels & Ticks:** `#1e293b` (Slate 800)
* **Gridlines:** `#e2e8f0` (Slate 200)
* **Ground Truth / Targets:** `#0f172a` (Slate 900)

---

## 4. Layering Hierarchy (`zorder`)

Always enforce the following layer order:

```
zorder=1 : Viewport Background / Internal Technical Grid Lines
zorder=2 : Viewport Boundary Box / Spines
zorder=3 : Primary Raw Scatter Cloud (alpha=0.20 - 0.30)
zorder=4 : Secondary Raw Scatter Cloud (alpha=0.20 - 0.30)
zorder=5 : Means, Fitted Lines, Confidence Intervals
zorder=6 : Ground Truth Targets / Reference Markers
```

---

## 5. Matplotlib Configuration (`rcParams`)

Apply this global configuration block at the top of plotting scripts:

```python
import matplotlib.pyplot as plt

plt.rcParams.update({
    # Typography
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans", "sans-serif"],
    "font.size": 10,
    "axes.labelsize": 11,
    "axes.titlesize": 11,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.fontsize": 9,
    
    # Lines & Spines
    "axes.linewidth": 1.0,
    "axes.edgecolor": "#475569",    # Slate 600
    "xtick.color": "#1e293b",        # Slate 800
    "ytick.color": "#1e293b",
    "xtick.direction": "out",
    "ytick.direction": "out",
    "xtick.major.size": 4.0,
    "ytick.major.size": 4.0,
    "xtick.major.width": 0.8,
    "ytick.major.width": 0.8,
    
    # Export
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.05,
    "pdf.fonttype": 42,            # TrueType fonts for vector editing
    "ps.fonttype": 42,
})
```

---

## 6. Template Script

Below is a Python template implementing these rules for a multi-series scientific scatter plot with axes enabled, subtle background grids, and no title.

```python
#!/usr/bin/env python3
import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

# ── 1. GLOBAL STYLE PARAMS ──────────────────────────────────────────────────
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.size": 10,
    "axes.labelsize": 11,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.fontsize": 9,
    "axes.linewidth": 1.0,
    "axes.edgecolor": "#475569",
    "xtick.color": "#1e293b",
    "ytick.color": "#1e293b",
    "xtick.direction": "out",
    "ytick.direction": "out",
    "savefig.dpi": 300,
    "pdf.fonttype": 42,
})

COLOR_PRIMARY_CLOUD   = "#0284c7"  # Sky blue
COLOR_PRIMARY_MEAN    = "#0369a1"  # Deep blue
COLOR_SECONDARY_CLOUD = "#e11d48"  # Rose red
COLOR_SECONDARY_MEAN  = "#be123c"  # Deep red
COLOR_REF_TARGET      = "#0f172a"  # Slate 900
COLOR_VIEWPORT_BG     = "#f8fafc"  # Slate 50
COLOR_GRID            = "#e2e8f0"  # Slate 200

def create_publication_figure(out_dir="./"):
    os.makedirs(out_dir, exist_ok=True)

    # ── 2. FIGURE & AXES SETUP (16:9 Widescreen) ────────────────────────────
    fig, ax = plt.subplots(figsize=(10.0, 5.625))
    fig.patch.set_facecolor("white")
    ax.set_facecolor(COLOR_VIEWPORT_BG)

    # Invert Y if working in screen/viewport space (0,0 at top-left)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(1.02, -0.02)
    ax.set_box_aspect(9 / 16)

    # ── 3. AXIS LABELS (NO TITLE) ───────────────────────────────────────────
    # Note: No ax.set_title() call! Titles belong in figure captions.
    ax.set_xlabel("Normalized Screen X", color="#1e293b")
    ax.set_ylabel("Normalized Screen Y", color="#1e293b")

    # ── 4. TECHNICAL GRID & BOUNDARY ────────────────────────────────────────
    # Inner display viewport box
    viewport = Rectangle((0, 0), 1.0, 1.0, linewidth=1.2,
                         edgecolor="#64748b", facecolor="none",
                         linestyle="--", zorder=2)
    ax.add_patch(viewport)

    # Internal dotted grid
    for val in [0.25, 0.50, 0.75]:
        ax.plot([0, 1], [val, val], color=COLOR_GRID, linestyle=":", linewidth=0.8, zorder=1)
        ax.plot([val, val], [0, 1], color=COLOR_GRID, linestyle=":", linewidth=0.8, zorder=1)

    # ── 5. DATA PLOTTING (SYNTHETIC DEMO DATA) ──────────────────────────────
    targets = [(0.2, 0.2), (0.5, 0.5), (0.8, 0.8)]
    np.random.seed(42)

    for tx, ty in targets:
        # Ground Truth Target
        ax.scatter(tx, ty, marker="+", s=200, linewidths=2.0, color=COLOR_REF_TARGET, zorder=6)

        # Dataset A (Primary)
        a_x = np.random.normal(tx - 0.01, 0.025, 60)
        a_y = np.random.normal(ty + 0.01, 0.025, 60)
        ax.scatter(a_x, a_y, color=COLOR_PRIMARY_CLOUD, alpha=0.25, s=12, edgecolors="none", zorder=3)
        ax.scatter(np.mean(a_x), np.mean(a_y), color=COLOR_PRIMARY_MEAN, s=42, edgecolors="white", linewidths=1.2, zorder=5)

        # Dataset B (Secondary)
        b_x = np.random.normal(tx + 0.015, 0.018, 60)
        b_y = np.random.normal(ty - 0.015, 0.018, 60)
        ax.scatter(b_x, b_y, color=COLOR_SECONDARY_CLOUD, alpha=0.25, s=12, edgecolors="none", zorder=4)
        ax.scatter(np.mean(b_x), np.mean(b_y), color=COLOR_SECONDARY_MEAN, s=42, edgecolors="white", linewidths=1.2, zorder=5)

    # ── 6. EXPORT ───────────────────────────────────────────────────────────
    fig.tight_layout(pad=0.2)
    
    pdf_path = os.path.join(out_dir, "sample_figure.pdf")
    png_path = os.path.join(out_dir, "sample_figure.png")
    fig.savefig(pdf_path, bbox_inches="tight", facecolor="white", pad_inches=0.05)
    fig.savefig(png_path, bbox_inches="tight", facecolor="white", pad_inches=0.05)
    plt.close(fig)
    
    print(f"Saved: {pdf_path}")
    print(f"Saved: {png_path}")

if __name__ == "__main__":
    create_publication_figure()
```