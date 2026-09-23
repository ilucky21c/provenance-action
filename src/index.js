const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Spec versions this action understands. 0.2 signs the whole declaration;
// 0.1 signs only the identity, leaving capabilities and constraints unprotected.
const KNOWN_SPEC_VERSIONS = ['0.1', '0.2'];

// Standard capability vocabulary — https://getprovenance.dev/docs#capabilities
const CANONICAL_CAPABILITIES = [
  'read:web',
  'write:code',
  'write:files',
  'write:email',
  'write:summaries',
  'execute:shell',
  'execute:browser',
  'delegate:agents',
  'ajp:receiver',
  'ajp:sender',
];

// Standard constraint vocabulary — https://getprovenance.dev/docs#capabilities
const CANONICAL_CONSTRAINTS = [
  'no:pii',
  'no:financial:transact',
  'no:external:network',
  'no:persist:data',
  'no:user:impersonation',
];

function validateProvenanceYml(content) {
  const errors = [];
  const warnings = [];

  // Parse YAML
  let parsed;
  try {
    parsed = yaml.load(content);
  } catch (e) {
    errors.push(`YAML parsing failed: ${e.message}`);
    return { valid: false, errors, warnings };
  }

  // Required fields
  if (!parsed.provenance) {
    errors.push('Missing required field: provenance');
  } else if (!KNOWN_SPEC_VERSIONS.includes(String(parsed.provenance))) {
    // Unknown versions warn rather than fail: a reader written for today's spec
    // must not break a build because a file uses a later one.
    warnings.push(
      `Provenance version "${parsed.provenance}" is not known to this action. Known versions: ${KNOWN_SPEC_VERSIONS.join(', ')}`
    );
  }

  if (!parsed.name) {
    errors.push('Missing required field: name');
  } else if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
    errors.push('Field "name" must be a non-empty string');
  }

  if (!parsed.description) {
    errors.push('Missing required field: description');
  } else if (typeof parsed.description !== 'string' || parsed.description.trim().length === 0) {
    errors.push('Field "description" must be a non-empty string');
  }

  // Optional but recommended fields
  if (!parsed.version) {
    warnings.push('Recommended field missing: version');
  }

  if (!parsed.contact) {
    warnings.push('Recommended field missing: contact');
  } else {
    if (!parsed.contact.name && !parsed.contact.email && !parsed.contact.url) {
      warnings.push('Contact should include at least one of: name, email, url');
    }
  }

  // Capabilities validation
  if (parsed.capabilities) {
    if (!Array.isArray(parsed.capabilities)) {
      errors.push('Field "capabilities" must be an array');
    } else {
      parsed.capabilities.forEach(cap => {
        if (typeof cap !== 'string') {
          errors.push(`Capability must be a string: ${cap}`);
        } else if (!CANONICAL_CAPABILITIES.includes(cap)) {
          warnings.push(`Non-standard capability: "${cap}". Consider using: ${CANONICAL_CAPABILITIES.join(', ')}`);
        }
      });
    }
  }

  // Constraints validation
  if (parsed.constraints) {
    if (!Array.isArray(parsed.constraints)) {
      errors.push('Field "constraints" must be an array');
    } else {
      parsed.constraints.forEach(con => {
        if (typeof con !== 'string') {
          errors.push(`Constraint must be a string: ${con}`);
        } else if (!CANONICAL_CONSTRAINTS.includes(con)) {
          warnings.push(`Non-standard constraint: "${con}". Consider using: ${CANONICAL_CONSTRAINTS.join(', ')}`);
        }
      });
    }
  }

  // Model validation
  if (parsed.model) {
    if (typeof parsed.model !== 'object') {
      errors.push('Field "model" must be an object');
    } else {
      if (!parsed.model.provider) {
        errors.push('Field "model.provider" is required when model is specified');
      }
      if (!parsed.model.model_id) {
        warnings.push('Recommended field missing: model.model_id');
      }
    }
  }

  // provenance_id recommendation
  if (!parsed.provenance_id) {
    warnings.push('Recommended field missing: provenance_id (e.g. provenance:github:your-org/your-agent)');
  }

  // Identity block validation (for verified agents)
  if (parsed.identity) {
    if (typeof parsed.identity !== 'object') {
      errors.push('Field "identity" must be an object');
    } else {
      if (!parsed.identity.public_key) {
        errors.push('Field "identity.public_key" is required when identity is specified');
      }
      if (!parsed.identity.algorithm) {
        warnings.push('Recommended field missing: identity.algorithm (expected: ed25519)');
      } else if (parsed.identity.algorithm !== 'ed25519') {
        warnings.push(`identity.algorithm "${parsed.identity.algorithm}" is non-standard. Expected: ed25519`);
      }
      if (!parsed.identity.signature) {
        warnings.push(
          'identity.signature is missing — this declaration is not tamper-evident. Sign it with signDeclaration() from provenance-protocol/keygen'
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed
  };
}

/**
 * Verify the declaration's signature, and check that it belongs to this repo.
 *
 * Shape validation cannot catch the two failures that actually matter: a
 * declaration edited after it was signed, and a fork carrying the original's
 * declaration. Both look perfectly well-formed.
 */
async function verifyIdentity(parsed, { checkRepository }) {
  const errors = [];
  const warnings = [];
  const notes = [];
  let signatureState = 'none';

  // The verifier is ESM; this action is CommonJS. A dynamic import is bundled
  // as an async chunk, so dist/ still runs standalone with no node_modules.
  const { verifyDeclaration, checkLocation } = await import('provenance-protocol/verify');

  if (parsed.identity && parsed.identity.signature) {
    const result = await verifyDeclaration(parsed);

    if (!result.valid) {
      signatureState = 'invalid';
      errors.push(
        `identity.signature does not verify: ${result.reason || 'unknown reason'}. ` +
          'If you edited this file after signing it, re-sign it.'
      );
    } else if ((signatureState = result.coverage) === 'identity') {
      // Valid, but for 0.1 that means far less than people assume.
      warnings.push(
        'identity.signature is valid but covers only provenance_id and public_key — your declared ' +
          'capabilities and constraints are NOT protected by it. Set provenance: "0.2" and re-sign ' +
          'with signDeclaration() to cover the whole declaration.'
      );
    } else {
      notes.push('identity.signature verifies and covers the whole declaration');
    }
  }

  // In CI we know which repository we are in, so the location check that a
  // remote verifier would do can be done here — and it catches a fork that kept
  // the upstream declaration, which is the impersonation case.
  const repo = process.env.GITHUB_REPOSITORY;
  if (checkRepository && repo && typeof parsed.provenance_id === 'string') {
    const location = checkLocation(parsed.provenance_id, `https://github.com/${repo}`);
    if (location === 'mismatch') {
      errors.push(
        `provenance_id "${parsed.provenance_id}" does not name this repository (${repo}). ` +
          'If this is a fork, change provenance_id to your own repository or remove the declaration — ' +
          "as it stands the file claims to be someone else's agent."
      );
    } else if (location === 'match') {
      notes.push(`provenance_id matches this repository (${repo})`);
    }
  }

  return { errors, warnings, notes, signatureState };
}

async function run() {
  try {
    const filePath = core.getInput('file-path') || 'PROVENANCE.yml';
    // Default to true when the input is absent. action.yml declares 'true', and
    // an action that quietly stops failing because an input was not passed is
    // the worst kind of broken check: every build goes green regardless.
    const failOnError = (core.getInput('fail-on-error') || 'true') === 'true';
    const verifySignature = (core.getInput('verify-signature') || 'true') === 'true';
    const requireSignature = (core.getInput('require-signature') || 'false') === 'true';
    const checkRepository = (core.getInput('check-repository') || 'true') === 'true';

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      core.setFailed(`PROVENANCE.yml not found at: ${filePath}`);
      core.setOutput('valid', 'false');
      core.setOutput('errors', 'File not found');
      return;
    }

    // Read and validate
    const content = fs.readFileSync(filePath, 'utf8');
    const result = validateProvenanceYml(content);

    if (requireSignature && result.parsed && !(result.parsed.identity && result.parsed.identity.signature)) {
      result.errors.push('identity.signature is required (require-signature is enabled) but is absent');
      result.valid = false;
    }

    // Only worth verifying a file that parsed; a shape failure already reported.
    if (verifySignature && result.parsed) {
      try {
        const identity = await verifyIdentity(result.parsed, { checkRepository });
        result.errors.push(...identity.errors);
        result.warnings.push(...identity.warnings);
        identity.notes.forEach((n) => core.info(`\u2713 ${n}`));
        if (identity.errors.length > 0) result.valid = false;
        core.setOutput('signature', identity.signatureState);
      } catch (e) {
        // A verifier that cannot run must not be reported as a bad declaration.
        core.warning(`Signature could not be verified: ${e.message}. The declaration was not checked cryptographically.`);
        core.setOutput('signature', 'unchecked');
      }
    }

    // Output results
    core.setOutput('valid', result.valid ? 'true' : 'false');
    core.setOutput('errors', result.errors.join('\n'));

    // Log warnings
    if (result.warnings.length > 0) {
      core.warning('PROVENANCE.yml validation warnings:');
      result.warnings.forEach(w => core.warning(`  - ${w}`));
    }

    // Log errors
    if (result.errors.length > 0) {
      core.error('PROVENANCE.yml validation failed:');
      result.errors.forEach(e => core.error(`  - ${e}`));
      
      if (failOnError) {
        core.setFailed('PROVENANCE.yml validation failed. See errors above.');
      }
    } else {
      core.info('✓ PROVENANCE.yml is valid');
      if (result.warnings.length === 0) {
        core.info('✓ No warnings');
      }
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
