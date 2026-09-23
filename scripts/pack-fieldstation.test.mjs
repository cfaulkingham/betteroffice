import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { packageMetadata, sourceRevision } from './pack-fieldstation.mjs';

test('packages preserve licensing and pin internal dependencies to the source commit', () => {
  const original = {
    name: '@betteroffice/xlsx-react', version: '0.2.1', license: 'Apache-2.0',
    scripts: { build: 'tsup' }, devDependencies: { typescript: '6.0.3' },
    dependencies: { '@betteroffice/xlsx': 'workspace:*', '@betteroffice/xlsx-i18n': 'workspace:*' },
    peerDependencies: { react: '^18.0.0 || ^19.0.0' }, publishConfig: { access: 'public' },
  };
  const revision = 'a'.repeat(40);
  const result = packageMetadata(original, 'xlsx-react', revision);
  assert.equal(result.gitHead, revision);
  assert.equal(result.version, '0.2.1-fieldstation.gaaaaaaaaaaaa');
  assert.equal(result.dependencies['@betteroffice/xlsx'], result.version);
  assert.equal(result.dependencies['@betteroffice/xlsx-i18n'], result.version);
  assert.equal(result.peerDependencies.react, original.peerDependencies.react);
  assert.equal(result.license, 'Apache-2.0');
  assert.equal(result.private, true);
  assert.equal(result.scripts, undefined);
  assert.equal(result.devDependencies, undefined);
  assert.equal(result.publishConfig, undefined);
  assert.equal(original.dependencies['@betteroffice/xlsx'], 'workspace:*');
});

test('packaging refuses staged, unstaged, and untracked source changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'fieldstation-source-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git('init');
    git('config', 'user.name', 'Package test');
    git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(root, 'source.txt'), 'committed');
    git('add', '.');
    git('commit', '-m', 'Initial source');
    assert.equal(sourceRevision(root), git('rev-parse', 'HEAD'));
    writeFileSync(join(root, 'source.txt'), 'changed');
    assert.throws(() => sourceRevision(root), /Commit or stash/);
    git('add', '.');
    assert.throws(() => sourceRevision(root), /Commit or stash/);
    git('reset', '--hard', 'HEAD');
    writeFileSync(join(root, 'new-source.txt'), 'untracked');
    assert.throws(() => sourceRevision(root), /Commit or stash/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
