---
name: audit-quick
description: Quick single-pass smart contract audit (supports --ensemble for multi-run)
level: 2
aliases: ["quick-audit", "quick-audit-kr"]
---

<Purpose>
Single-pass quick audit. With --ensemble option, runs 3 parallel executions → union of findings.
</Purpose>

<Use_When>
- User wants a fast audit without full 6-phase orchestration
- User says "quick audit", "quick audit", "quick look"
- Code is small-medium (<300KB)
- Use --ensemble for higher recall (reduces non-determinism ±20pp → ±5pp)
</Use_When>

<Execution_Policy>

TARGET = first path argument or "src/"
ENSEMBLE = true if arguments contain "--ensemble" or "--e3"

## Step 1: Build Complete Audit Prompt

Call `mcp__audit__build_audit_prompt` with targetDir = TARGET.

This tool does everything in one call:
1. Collects all .sol files and builds the bundle
2. Detects protocol type (lending, vault, dex, etc.)
3. Matches relevant checklists and protocol docs
4. Runs checklist scanner (auto-grep code for checklist patterns)
5. Calibrates injection size (<20% of bundle)
6. Returns a complete, ready-to-use audit prompt with checklist items, protocol docs, scanned code snippets, and source code already embedded

The tool returns TWO content blocks:
- First block: JSON metadata (fileCount, totalKb, protocolTypes, matchedChecklists, matchedProtocols, checklistScan, calibration)
- Second block: The complete audit prompt with all context injected

## Step 1.5: External Protocol Research (if needed)

Check metadata from Step 1:
- If `matchedProtocols` is EMPTY, external research is needed
- Scan the source code for import patterns referencing external protocols (e.g., IConvex, ICurve, IAave, IUniswap, ICompound, ILayerZero, ILIDO, IGmx)

If unmatched external dependencies detected:
1. Use WebSearch to find: "{protocol_name} smart contract known vulnerabilities integration"
2. Summarize key facts (max 20 lines): core mechanism, known exploits, integration gotchas
3. Append the summary to AUDIT_PROMPT (between "Protocol-Specific Knowledge" and "SOURCE CODE BEGINS")

Skip if matchedProtocols already covers the dependencies or if bundle is very small (<20KB).

## Step 2: Execute Audit

### Default mode (single pass):
Execute AUDIT_PROMPT directly and produce findings.

### Ensemble mode (--ensemble):
Spawn 3 Agents IN PARALLEL (run_in_background=true), each with the SAME AUDIT_PROMPT but different focus emphasis:

```
Agent 1 (run_in_background=true, prompt="""
FOCUS EMPHASIS: Prioritize economic attacks, flash loans, MEV, reward gaming, and cross-function state manipulation.
{AUDIT_PROMPT}
""")

Agent 2 (run_in_background=true, prompt="""
FOCUS EMPHASIS: Prioritize access control, input validation, edge cases (zero, max, empty), and state machine violations.
{AUDIT_PROMPT}
""")

Agent 3 (run_in_background=true, prompt="""
FOCUS EMPHASIS: Prioritize external integrations, oracle issues, token compatibility, mathematical precision, and protocol-specific logic errors.
{AUDIT_PROMPT}
""")
```

Wait for all 3. Then:
1. Collect all findings from all 3 agents
2. Merge into a single list
3. Deduplicate: same function + same root cause → keep the more detailed description
4. Assign sequential numbers

## Step 3: Output

Write the findings list to SECURITY_AUDIT_REPORT.md in the target directory.

Include at the top:
```
# Security Audit Report
- Target: {targetDir}
- Files: {fileCount}
- Size: {totalKb}KB
- Protocol: {protocolTypes}
- Checklists: {matchedChecklists}
- Protocol docs: {matchedProtocols}
- Checklist scan: {checklistScan.matchedItems}/{checklistScan.totalItems} items matched in code
- Mode: {single | ensemble (3 agents)}
```

</Execution_Policy>
