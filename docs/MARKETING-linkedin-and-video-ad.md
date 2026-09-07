# Marketing: LinkedIn Launch Post + AI Video Ad Directive

---

## 1. LinkedIn Post

Every CSS codebase I've ever worked in has the same problem: three shades of
almost-the-same blue, three different "8px-ish" paddings, and no one
remembers which one is intentional.

So I built a tool to fix that — for free.

**Design Token Extractor & Migrator** is a VS Code extension that:

🔍 Scans your entire CSS/SCSS/SASS/LESS codebase and finds every hardcoded
color, spacing value, font size, radius, shadow, z-index, breakpoint, and
transition — no manual auditing.

🧩 Clusters near-duplicate values intelligently (color perception math, not
just string matching) — and never silently merges anything it isn't sure
about. Ambiguous matches get flagged for you to approve, always.

🏷️ Names everything for you, following real design-system conventions
(`color-blue-500`, `space-16`) — and once a name is locked in, it stays
locked. Rescanning your project never renames a token out from under you.

📦 Generates your token system in every format your team actually needs:
CSS custom properties, SCSS variables, W3C DTCG JSON, and Tokens Studio
JSON for a direct Figma round-trip.

🛡️ Prevents regression, not just a one-time cleanup — generates a real
Stylelint config so any *new* hardcoded value gets caught in code review,
and ships a CLI (`design-tokens check`) for CI or a pre-commit hook.

♿ Surfaces accessibility issues for free — WCAG contrast ratios are
checked automatically wherever a foreground/background color pair already
exists in your CSS.

🌗 Detects light/dark theme pairs automatically, so you can turn two
disconnected hardcoded colors into one themeable token instead.

⚡ Offers a safe, in-editor CodeLens action — "3 other places in this file
use this value" — so cleanup can happen incrementally, one confident click
at a time.

And because I built this to actually last: it's MIT-licensed, published to
both the VS Code Marketplace *and* Open VSX (so it's never dependent on a
single company's marketplace policy), with zero telemetry and zero paid
dependencies anywhere in the pipeline.

If your team has ever argued about which blue is "the" blue — this is for
you.

Link in comments. Feedback and contributions welcome — it's fully open
source.

#opensource #designsystems #css #vscode #webdev #a11y #frontend #devtools

---

## 2. Directive for an AI Video Ad

**Purpose:** a 45–60 second product ad, for LinkedIn/X/YouTube pre-roll,
generated with an AI video tool (e.g. Sora, Runway, Pika, Kling) plus a
separate text-to-speech voiceover track layered on top.

**Non-negotiable constraints for whoever prompts the video model:**
- Do not ask the model to reproduce Microsoft's actual VS Code logo,
  trademarked icon, or pixel-exact UI chrome. Describe a generic
  "dark-themed code editor interface" instead — stylized and clearly
  inspired by modern code editors, not a literal trademarked screenshot.
  The on-screen text can say "Available for VS Code" as a factual claim;
  the visuals should not claim to *be* Microsoft's product asset.
- No real, named people. Any hands/silhouette shown typing should be
  generic and non-identifiable.
- No copyrighted logos of Figma, Tailwind, GitHub, etc. — refer to them by
  name in on-screen text/voiceover only, never recreate their marks visually.
- Keep every code snippet shown generic/invented (`.button`, `.card`,
  `#3B82F6`) — nothing pulled from a real, identifiable codebase.

### Structure (target: 50 seconds, 6 scenes)

**Scene 1 — The Problem (0:00–0:08)**
- Visual: a stylized code editor, dark theme, CSS file open. Cursor
  scrolls fast through a long stylesheet. Occasionally a color swatch
  pulses next to a hex code — three slightly different blues appear in
  quick succession, each with a small "?" icon over it.
- On-screen text (appears at ~0:03): "How many blues does your codebase have?"
- Voiceover: "Every CSS codebase ends up like this. Three almost-the-same
  blues. Five almost-the-same paddings. Nobody remembers which one's real."
- Sound: quiet, slightly tense synth pad; a soft "error ping" each time a
  new near-duplicate swatch appears.

**Scene 2 — The Reveal (0:08–0:14)**
- Visual: screen wipes to a clean title card — product name on a dark
  gradient background, a simple geometric icon (abstract hexagon made of
  color swatches, not a real logo).
- On-screen text: "Design Token Extractor & Migrator — for VS Code. Free. Open source."
- Voiceover: "Meet the extension that finds it, organizes it, and keeps it
  clean — automatically."
- Sound: music swells, shifts from tense to upbeat/confident.

**Scene 3 — Scan & Cluster (0:14–0:24)**
- Visual: back in the editor. A command palette opens, "Design Tokens: Scan
  Workspace" is typed/selected. Progress notification appears. Cut to a
  results panel: rows of color swatches grouping together with a subtle
  animated "snap into place" motion, counters ticking up ("142 colors →
  18 tokens").
- On-screen text: "Scans your whole project in seconds."
- Voiceover: "It scans every CSS, SCSS, and LESS file in your project, and
  groups near-duplicate values — using real color science, not guesswork.
  Anything it's not sure about, it asks you first. Nothing gets merged
  silently."
- Sound: light UI "click" and "snap" sound effects synced to the grouping animation.

**Scene 4 — Generate Everything (0:24–0:34)**
- Visual: a fan of file icons/cards spreading out from a central token
  list — labeled generically "CSS", "SCSS", "JSON", "Figma-compatible JSON"
  — plus a small badge reading "Stylelint config" and another reading
  "README.md" appearing among them.
- On-screen text: "One scan. Every format your team needs."
- Voiceover: "One click generates your entire token system — CSS variables,
  SCSS, and a format that plugs straight into your design tool. Plus a lint
  rule so old habits don't creep back in."
- Sound: satisfying "pop" for each card as it appears.

**Scene 5 — The Extras (0:34–0:44)**
- Visual: quick 3-beat montage, ~3 seconds each:
  (a) a contrast-ratio badge appearing next to a text/background pair,
  turning from a warning icon to a checkmark;
  (b) a sun/moon icon morphing into each other over a color swatch, with
  a small "light/dark pair detected" label;
  (c) a floating tooltip in the editor reading "3 other places use this
  value — Replace with token", with a cursor click causing a highlighted
  line to swap smoothly to a token reference.
- On-screen text (one line per beat): "Catches contrast issues." /
  "Finds your light & dark pairs." / "Safe, one-click cleanup."
- Voiceover: "It even catches accessibility issues, spots your light and
  dark theme pairs, and lets you clean up existing code safely — one
  confident click at a time."
- Sound: three quick, distinct positive chimes, one per beat.

**Scene 6 — Close (0:44–0:50)**
- Visual: return to the title card style from Scene 2. Below the product
  name, three small badges fade in: "MIT Licensed", "VS Code Marketplace",
  "Open VSX". A cursor moves to a generic "Install" button and clicks it.
- On-screen text: "Free. Open source. No telemetry. Install today."
- Voiceover: "Free, open source, and built to last. Install it today."
- Sound: music resolves to a final confident chord; soft "install complete" chime.

### Voiceover track (full script, for a single continuous read if preferred over per-scene splits)

> Every CSS codebase ends up like this. Three almost-the-same blues. Five
> almost-the-same paddings. Nobody remembers which one's real.
>
> Meet the extension that finds it, organizes it, and keeps it clean —
> automatically.
>
> It scans every CSS, SCSS, and LESS file in your project, and groups
> near-duplicate values using real color science, not guesswork. Anything
> it's not sure about, it asks you first. Nothing gets merged silently.
>
> One click generates your entire token system — CSS variables, SCSS, and a
> format that plugs straight into your design tool. Plus a lint rule so old
> habits don't creep back in.
>
> It even catches accessibility issues, spots your light and dark theme
> pairs, and lets you clean up existing code safely — one confident click at
> a time.
>
> Free, open source, and built to last. Install it today.

### Style notes for the video model
- Overall palette: dark editor background (near-black, `#111`–`#1a1a1a`)
  with accent swatches in blue, teal, and warm orange — consistent with a
  "design tokens" visual theme, not a copy of any specific brand's palette.
- Motion style: smooth, confident, slightly snappy easing (not bouncy/toy-like)
  — this is a developer tool, the tone should read as precise and calm, not
  playful.
- Typography: clean geometric sans-serif for on-screen text, high contrast
  against the dark background (this is also a nice subtle nod to the
  product's own accessibility-contrast feature, if the editor doing the cut
  wants to lean into it).
- Pacing: cuts on the beat of the music; no scene held longer than ~10
  seconds to keep it feeling fast without feeling rushed.
