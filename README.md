# Provenance GitHub Action

Validates a `PROVENANCE.yml` **and cryptographically verifies it** — catching the
two failures that a shape check cannot see:

- a declaration **edited after it was signed** (the signature no longer matches)
- a **fork carrying the upstream declaration**, which claims to be someone else's agent

Both look perfectly well-formed to a validator.

Validates your `PROVENANCE.yml` file against the [Provenance Protocol](https://getprovenance.dev) specification in CI/CD.

## Usage

Add this to your `.github/workflows/provenance.yml`:

```yaml
name: Validate Agent Identity
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: provenance-protocol/action@v1
        with:
          file-path: 'PROVENANCE.yml'  # default
          fail-on-error: 'true'         # default
```

## What it checks

### Required Fields
- `provenance`: Protocol version (e.g., `"1.0"`)
- `name`: Agent name
- `description`: Agent description

### Recommended Fields
- `version`: Agent version
- `contact`: Contact information (name, email, or url)
- `capabilities`: What the agent can do
- `constraints`: What the agent will never do
- `model`: LLM provider and model ID

### Taxonomy Validation

The action warns about non-standard capabilities and constraints, encouraging use of canonical terms:

**Standard Capabilities:**
- `read:web`, `read:filesystem`, `write:filesystem`
- `execute:code`, `network:outbound`
- `database:read`, `database:write`, `api:external`

**Standard Constraints:**
- `no:financial:transact`, `no:pii`, `no:data:export`
- `no:code:execute`, `no:system:modify`

## Outputs

- `valid`: `"true"` or `"false"`
- `errors`: Validation errors (newline-separated)

## Example PROVENANCE.yml

```yaml
provenance: "1.0"
name: "Research Assistant"
description: "Autonomous research agent that gathers and summarizes information"
version: "2.1.0"

capabilities:
  - read:web
  - api:external

constraints:
  - no:financial:transact
  - no:pii

model:
  provider: "anthropic"
  model_id: "claude-sonnet-4"

contact:
  name: "Alice"
  url: "https://github.com/alice/research-assistant"
```

## License

MIT

## Inputs

| Input | Default | |
|---|---|---|
| `file-path` | `PROVENANCE.yml` | Where the declaration is |
| `fail-on-error` | `true` | Fail the build on validation errors |
| `verify-signature` | `true` | Cryptographically verify `identity.signature` when present |
| `require-signature` | `false` | Fail when the declaration carries no signature at all |
| `check-repository` | `true` | Check `provenance_id` names the repository this runs in |

## Outputs

| Output | |
|---|---|
| `valid` | `true` / `false` |
| `errors` | Validation errors, newline separated |
| `signature` | `declaration` (spec 0.2 — whole file covered), `identity` (spec 0.1 — identity only), `invalid`, `none`, or `unchecked` |

## A note on spec versions

Under spec **0.2** a signature covers the whole declaration, so deleting a
constraint breaks it. Under **0.1** it covered only the identity and key — your
declared capabilities and constraints were not protected. Both validate here,
but a 0.1 file gets a warning saying so, and `signature` reports which coverage
was found.
