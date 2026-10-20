# Changelog

All notable changes to `@voltarenyah/dsh-prompt-note` are documented here. The
format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
