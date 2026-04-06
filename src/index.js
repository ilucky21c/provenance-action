const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
  } else if (String(parsed.provenance) !== '0.1') {
    warnings.push(`Provenance version "${parsed.provenance}" may not be supported. Current version: "0.1"`);
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
        warnings.push('identity.signature is missing — required for identity_verified: true on registration');
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

async function run() {
  try {
    const filePath = core.getInput('file-path') || 'PROVENANCE.yml';
    const failOnError = core.getInput('fail-on-error') === 'true';

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
