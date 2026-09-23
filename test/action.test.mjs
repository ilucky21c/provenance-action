/**
 * Runs the built action the way GitHub runs it: as a subprocess with inputs in
 * the environment, reading a file from disk.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateProvenanceKeyPair, signDeclaration, signForProvenance } from 'provenance-protocol/keygen';
import { stringify } from 'yaml';

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  ok ? pass++ : fail++;
};

const dir = mkdtempSync(join(tmpdir(), 'action-'));
const { publicKey, privateKey } = generateProvenanceKeyPair();
const REPO = 'alice/research-agent';
const ID = `provenance:github:${REPO}`;

function runAction(declaration, env = {}) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.yml`);
  writeFileSync(file, stringify(declaration));
  const outFile = join(dir, 'out.txt');
  writeFileSync(outFile, '');
  try {
    const stdout = execFileSync('node', ['dist/index.js'], {
      env: {
        ...process.env,
        'INPUT_FILE-PATH': file,
        GITHUB_OUTPUT: outFile,
        GITHUB_REPOSITORY: REPO,
        ...env,
      },
      encoding: 'utf8',
    });
    return { failed: false, stdout, outputs: readFileSync(outFile, 'utf8') };
  } catch (e) {
    return { failed: true, stdout: (e.stdout || '') + (e.stderr || ''), outputs: readFileSync(outFile, 'utf8') };
  }
}

const base = {
  provenance: '0.2', name: 'Research Agent', description: 'Searches and summarises.',
  provenance_id: ID, capabilities: ['read:web'], constraints: ['no:pii'],
  identity: { public_key: publicKey, algorithm: 'ed25519' },
};
const signed = { ...base, identity: { ...base.identity, signature: signDeclaration(privateKey, base) } };

// 1. a correctly signed 0.2 declaration in its own repo
let r = runAction(signed);
t('accepts a correctly signed 0.2 declaration', !r.failed, r.stdout.slice(-300));
t('reports the whole declaration is covered', r.outputs.includes('declaration'), r.outputs);
t('no spurious version warning', !r.stdout.includes('not known to this action'));

// 2. THE CASE SHAPE VALIDATION CANNOT CATCH: edited after signing
r = runAction({ ...signed, constraints: [] });
t('rejects a declaration edited after signing', r.failed);
t('and says why', r.stdout.includes('does not verify'), r.stdout.slice(-200));

// 3. a fork carrying the upstream declaration
r = runAction(signed, { GITHUB_REPOSITORY: 'mallory/research-agent-fork' });
t('rejects a fork carrying the original declaration', r.failed);
t('and explains the fix', r.stdout.includes('fork'), r.stdout.slice(-200));

// 4. a 0.1 declaration still passes, with an honest warning
const decl01 = { ...base, provenance: '0.1' };
const signed01 = { ...decl01, identity: { ...decl01.identity, signature: signForProvenance(privateKey, ID, publicKey) } };
r = runAction(signed01);
t('accepts a valid 0.1 declaration', !r.failed, r.stdout.slice(-300));
t('warns that 0.1 leaves constraints unprotected', r.stdout.includes('NOT protected'));
t('reports identity-only coverage', r.outputs.includes('identity'), r.outputs);

// 5. unsigned: allowed by default, rejected when required
r = runAction(base);
t('allows an unsigned declaration by default', !r.failed);
r = runAction(base, { 'INPUT_REQUIRE-SIGNATURE': 'true' });
t('rejects an unsigned declaration when required', r.failed);

// 6. opting out
r = runAction(signed, { GITHUB_REPOSITORY: 'mallory/fork', 'INPUT_CHECK-REPOSITORY': 'false' });
t('repository check can be disabled', !r.failed, r.stdout.slice(-200));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
