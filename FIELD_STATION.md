# Field Station fork

This repository maintains the BetterOffice changes used by [Field Station](https://github.com/cfaulkingham/field-station). `origin` is `cfaulkingham/betteroffice`; `upstream` is `openooxml/betteroffice`.

The initial import preserves the Field Station host patch previously based on upstream `80341ac5c4f52c4884b6c9f319414c47410ece88`. This fork also includes upstream's `0ba58e5a726a352b492c5778102bdc580272bcff` fix for TEXT date formatting with the workbook epoch.

The maintained changes cover spreadsheet dirty/error/save/print/clipboard callbacks, selection navigation, row and column sizing, worksheet management and its undoable Rust operations, command search, PNG export handoff, DOCX immediate dirty notifications and full-document printing, and VSDX host saving and draft-aware serialization. Field Station owns native dialogs, storage, recovery, and application UI. This fork owns editor and engine behavior.

## Building application packages

Install Node.js, Bun 1.3.14, Rust with `wasm32-unknown-unknown`, `wasm-pack` 0.15.0, and Binaryen (`wasm-opt` on PATH). The CI workflow records the same build process. It does not require npm, crates.io, or PyPI publishing credentials.

```sh
bun install --frozen-lockfile --ignore-scripts --filter betteroffice --filter './packages/*'
node --test scripts/pack-fieldstation.test.mjs
node scripts/pack-fieldstation.mjs
```

Commit source changes before packaging. The builder refuses dirty or untracked source changes, rebuilds all twelve engine/editor/i18n packages, and writes `dist/fieldstation/<full-commit>/`. Each archive contains upstream licenses/notices, the fork repository, and `gitHead`. A version such as `0.2.1-fieldstation.g0123456789ab` identifies its source commit. The manifest records archive SHA-256 values, lockfile digests, and compiler/tool versions. Upstream package manifests and workspace dependencies remain intact in source; the packager rewrites the staged distribution metadata.

The `Field Station packages` workflow builds and tests the fork on pushes to main or manual dispatch, then uploads the archives and manifest as one GitHub Actions artifact. Public registry publishing and upstream website deployment are restricted to the upstream repository.

## Updating Field Station

From the sibling Field Station checkout:

```sh
npm run vendor:betteroffice -- ../betteroffice
npm install --ignore-scripts
npm run legal:generate
npm run check
npm run test:e2e
```

The import command builds the clean fork checkout and validates every archive before replacing the app's vendored packages and dependency paths. To reuse a local build or a downloaded Actions artifact, pass its extracted directory instead:

```sh
npm run vendor:betteroffice -- ../betteroffice/dist/fieldstation/<full-commit>
```

Commit the app's archives, manifest, package.json, lockfile, and notices together. Ordinary Field Station installs use these checked-in archives and do not need the sibling checkout. No submodule, moving Git dependency, registry token, or runtime connection to the fork is needed.

## Keeping up with upstream

Fetch `upstream`, review and merge desired upstream changes into the fork's main branch, and run the engine/editor tests. Build from the resulting committed revision, then import and test it in Field Station. A dependency update is an explicit app commit; upstream pushes cannot change an existing Field Station checkout's engines.
