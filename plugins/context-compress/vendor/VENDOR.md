# Vendored: context-compression-engine

| Field | Value |
| --- | --- |
| npm package | `context-compression-engine@1.0.0` |
| source | https://github.com/SimplyLiz/ContextCompressionEngine |
| gitHead | fa16341616891d2601ecbb519c97c27edd7e9fe3 |
| vendored on | 2026-09-05 |
| license | AGPL-3.0-only (see `./LICENSE`, author: Lisa Welsch) |
| OCP license | AGPL-3.0-or-later — combined work conveys under AGPL-3.0 |

Vendored so the shipped plugin (`../context-compress.ts`) stays self-contained:
it runs from `~/.config/opencode/plugins/` where no npm install step exists.
No shipped OCP plugin may rely on ambient node_modules resolution.

## Modifications

- `.d.ts.map` / `.js.map` source-map files dropped (build artifacts, ~8 KB).
- Root `package.json` renamed to `package.npm.json` (provenance snapshot; the
  real name would make module resolution treat `vendor/` as a package root).
- `dist/` contents otherwise byte-identical to the published tarball
  (integrity: sha512-gVnjEVpBfYffYWyI2FSkgnzSrRDXOnYNJhQG/7ulwO3ADn63NVPGILMhjiz0ReHSJFSnopZvZSe+9gDyrrubew==).

## Upgrading

`npm pack context-compression-engine@<ver>`, extract, refresh this directory,
update the table above, and re-run `tests/test-context-compress-unit.ts`.
