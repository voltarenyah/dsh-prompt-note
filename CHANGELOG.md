# Changelog

All notable changes to `@voltarenyah/dsh-prompt-note` are documented here. The
format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-10-21

Layout work on the note list; no API or storage changes.

### Changed

- **Each note is a block.** The text spans the full panel width and the
  Send / Edit / Delete controls sit in a footer row underneath it. A row layout
  used to leave the text only the width the three buttons did not take, so a
  long prompt folded into a narrow column.
- **Long notes clamp and fade.** Text taller than the clamp box fades out at the
  bottom and gets a `Show more` / `Show less` control on the same footer row as
  the buttons. That control appears only when the rendered text really
  overflows — measured with a `ResizeObserver` rather than a character
  threshold, so resizing the sidebar behaves.
- **The editor grows to fit.** Editing a long note used to show a fixed
  three-row box; the textarea now measures its content and grows to show all of
  it, capped at 55% of the viewport height, with the overflow scrolling inside
  the box. Manual resize stays available.

### Added

- `Show more` / `Show less` and the new README preview screenshot.

## [0.1.1] — 2026-10-20

Docs and release pipeline only; no runtime changes.

### Added

- npm version badge in the README header.
- `Compatibility` section stating the tested DSH floor (`>= 0.2.1-rc.2`, the
  release that ships the right-sidebar tab registry) and why an older Host
  refuses the installation instead of failing at runtime.
- `CHANGELOG.md`.
- GitHub Actions workflow that publishes to npm when a release is published,
  authenticating with npm **trusted publishing** (OIDC, no long-lived secret)
  and attaching a provenance attestation.

## [0.1.0] — 2026-10-20

First public release.

### Added

- A right-sidebar tab type holding one pending-prompt list per Session.
- Compose (`Ctrl+Enter`), inline edit, delete, and a reload control.
- **Send** through the Host's Session controller (`mode: 'queue'`), so a running
  turn queues the note exactly like a typed prompt and the composer draft is
  never touched.
- Host-side persistence in `<profile>/dsh-prompt-note/notes.json`, keyed by
  Session id (survives reloads, restarts, and other clients).
- English and Chinese UI copy following the app locale.
- Fenced `/prompt-note/api/*` route carrying the notes' CRUD and `send`.
