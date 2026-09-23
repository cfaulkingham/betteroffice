import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packages, repository, versionBase } from './fieldstation-packages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (source, args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const versionOf = (command, args = ['--version']) => execFileSync(command, args, { encoding: 'utf8' }).trim();

/** Require an identifiable, committed source tree. */
export function sourceRevision(source) {
  const dirty = git(source, ['status', '--porcelain', '--untracked-files=normal']);
  if (dirty) throw new Error(`Commit or stash source changes before packaging:\n${dirty}`);
  return git(source, ['rev-parse', 'HEAD']);
}

/** Stamp provenance and resolve workspace dependencies without editing source manifests. */
export function packageMetadata(original, name, revision) {
  const metadata = structuredClone(original);
  const version = `${versionBase}-fieldstation.g${revision.slice(0, 12)}`;
  metadata.version = version;
  metadata.gitHead = revision;
  metadata.repository = { type: 'git', url: `${repository}.git`, directory: `packages/${name}` };
  metadata.homepage = repository;
  metadata.files = ['dist', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md', 'README.md'];
  delete metadata.scripts;
  delete metadata.devDependencies;
  delete metadata.publishConfig;
  metadata.private = true;
  for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependency, range] of Object.entries(metadata[group] ?? {})) {
      if (packages.some((entry) => dependency === `@betteroffice/${entry}`)) {
        metadata[group][dependency] = version;
      } else if (range.startsWith('workspace:')) {
        const dependencyName = dependency.slice('@betteroffice/'.length);
        const dependencyManifest = JSON.parse(readFileSync(join(root, 'packages', dependencyName, 'package.json'), 'utf8'));
        metadata[group][dependency] = dependencyManifest.version;
      }
    }
  }
  return metadata;
}

/** Build and package all Field Station engines from the current clean commit. */
export function packFieldStation(output) {
  const revision = sourceRevision(root);
  const version = `${versionBase}-fieldstation.g${revision.slice(0, 12)}`;
  const destination = resolve(output ?? join(root, 'dist', 'fieldstation', revision));
  const toolchain = {
    node: process.version,
    bun: versionOf('bun'),
    rustc: versionOf('rustc'),
    wasmPack: versionOf('wasm-pack'),
    wasmOpt: versionOf('wasm-opt'),
    bunLockSha256: sha256(join(root, 'bun.lock')),
    cargoLockSha256: sha256(join(root, 'Cargo.lock')),
  };
  execFileSync('bun', ['run', 'build:packages'], { cwd: root, stdio: 'inherit' });
  if (sourceRevision(root) !== revision) throw new Error('The source commit changed during the build.');
  const staging = mkdtempSync(join(tmpdir(), 'fieldstation-pack-'));
  const artifacts = [];
  try {
    const packedDirectory = join(staging, 'archives');
    mkdirSync(packedDirectory);
    for (const name of packages) {
      const upstream = join(root, 'packages', name);
      const target = join(staging, name);
      mkdirSync(target);
      cpSync(join(upstream, 'dist'), join(target, 'dist'), { recursive: true });
      for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) {
        cpSync(join(root, file), join(target, file));
      }
      cpSync(existsSync(join(upstream, 'README.md')) ? join(upstream, 'README.md') : join(root, 'README.md'), join(target, 'README.md'));
      const original = JSON.parse(readFileSync(join(upstream, 'package.json'), 'utf8'));
      const metadata = packageMetadata(original, name, revision);
      writeFileSync(join(target, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
      const [packed] = JSON.parse(execFileSync('npm', [
        'pack', '--cache', join(staging, 'npm-cache'), '--ignore-scripts', '--json', '--pack-destination', packedDirectory,
      ], { cwd: target, encoding: 'utf8' }));
      artifacts.push({ name: metadata.name, version, archive: packed.filename, sha256: sha256(join(packedDirectory, packed.filename)) });
    }
    const manifest = { schemaVersion: 2, repository, revision, version, toolchain, packages: artifacts };
    mkdirSync(destination, { recursive: true });
    for (const artifact of artifacts) {
      const target = join(destination, artifact.archive);
      if (existsSync(target) && sha256(target) !== artifact.sha256) {
        throw new Error(`A different build already exists at ${target}; use a new output directory.`);
      }
    }
    for (const artifact of artifacts) cpSync(join(packedDirectory, artifact.archive), join(destination, artifact.archive));
    writeFileSync(join(destination, 'betteroffice-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Packaged ${artifacts.length} packages from ${revision} into ${destination}`);
    return destination;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args[0] !== '--output' || args.length !== 2)) {
    throw new Error('Usage: node scripts/pack-fieldstation.mjs [--output /path/to/artifacts]');
  }
  packFieldStation(args[1]);
}
