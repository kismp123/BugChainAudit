# BugChainAudit

Agentic smart contract security audit plugin for [Claude Code](https://claude.ai/code).

Multi-agent orchestration with automated checklist scanning, bundle compression, and protocol-aware analysis.

Built using [smart-contract-review-reports](https://github.com/kismp123/smart-contract-review-reports) — a curated dataset of real audit contest findings used as ground truth for benchmarking and iterative improvement of the audit pipeline.

## Benchmark

Benchmarked against [smart-contract-review-reports](https://github.com/kismp123/smart-contract-review-reports) ground truth across 24 contests:

| Bundle Size | Avg Recall | 80%+ Rate | vs Baseline |
|-------------|-----------|-----------|-------------|
| <200KB | 93% | 94% | +4pp |
| 300KB+ | 79% | 33% | +14pp |

3 contests achieved 100% on 300KB+ codebases (including Perpetual with +53pp improvement).

## Installation

```bash
claude plugin marketplace add https://github.com/kismp123/BugChainAudit.git
claude plugin install BugChainAudit
```

## Usage

```bash
# Full multi-agent pipeline (6-phase: analyst → personas → validator → critic → reporter)
/BugChainAudit:audit ./src

# Quick single-pass audit
/BugChainAudit:audit-quick ./src

# Ensemble mode — 3 parallel agents with different focus areas, findings merged
/BugChainAudit:audit-quick ./src --ensemble

# Validate existing findings against source code
/BugChainAudit:validate SECURITY_AUDIT_REPORT.md
```

## Architecture

### Agents (8)

| Agent | Model | Role |
|-------|-------|------|
| analyst | opus | Protocol analysis, invariant extraction, strategy selection |
| attacker | sonnet | Economic attacks, flash loans, MEV, game theory |
| defender | sonnet | Invariant violations, access control, edge cases |
| protocol-expert | sonnet | Domain-specific logic errors, external dependencies |
| math-auditor | opus | Mathematical precision, AMM math, approximation errors |
| critic | opus | Coverage gap analysis, re-audit directives |
| validator | sonnet | Finding verification (VALID / FALSE_POSITIVE / UNCERTAIN) |
| reporter | haiku | Final report generation |

### MCP Tools (6)

| Tool | Purpose |
|------|---------|
| `bundle_build` | Collect .sol files, build bundle, detect protocol type |
| `bundle_split` | Split large bundles via import graph clustering |
| `bundle_compress` | Remove comments, unused view functions (37-49% reduction) |
| `detect_protocol` | Match checklists and protocol docs with injection calibration |
| `build_audit_prompt` | Assemble complete audit prompt with all context pre-injected |
| `checklist_scan` | Auto-grep code for checklist patterns, inject matched snippets |

### Skills (3)

| Skill | Description |
|-------|-------------|
| `audit` | Full 6-phase pipeline with multi-agent orchestration |
| `audit-quick` | Single-pass audit with optional `--ensemble` mode |
| `validate` | Verify findings against source code, filter false positives |

## Key Features

- **Bundle Compression**: 300KB+ codebases reduced 37-49% by removing comments, imports, and unreferenced external view functions
- **Checklist Scanner**: Auto-greps code for 61 checklist patterns, injects matched code snippets directly into audit prompt
- **Mandatory Checklist Verification**: Forces systematic verification of every checklist item (not just free-form audit)
- **Mathematical Precision Audit**: Dedicated step for AMM math, fixed-point arithmetic, overflow, and approximation analysis
- **External Protocol Research**: Auto-searches web for protocol docs when no pre-written doc exists
- **Protocol-Aware**: 17+ protocol docs (Aave, Curve, Convex, Uniswap, Balancer, Chainlink, etc.)

## Data

- `data/checklists/`: 10 files with 61 items (core, lending, dex_amm, nft_token, bridge, governance, oracle, options, staking)
- `data/protocols/`: 17+ protocol-specific vulnerability docs

## License

MIT
