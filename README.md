# Provenance GitHub Action

Validates your `PROVENANCE.yml` file against the [Provenance Protocol](https://provenance.dev) specification in CI/CD.

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
