---
name: audit
description: Smart contract security audit with multi-agent orchestration
level: 4
aliases: ["audit-kr", "security-audit"]
---

<Purpose>
Multi-agent audit of Solidity smart contracts.
Automatically selects strategy based on bundle size + split + validate pipeline execution.
</Purpose>

<Use_When>
- User wants a full smart contract security audit
- User says "audit", "audit", "security audit", "vulnerability analysis"
- Target directory contains .sol files
</Use_When>

<Do_Not_Use_When>
- User wants a quick single-pass audit → use `audit-quick`
- User only wants to validate existing findings → use `validate`
- User wants to run benchmarks → use `benchmark`
</Do_Not_Use_When>

<Execution_Policy>

TARGET = ARGUMENTS or "src/"

## Phase 0: Build Audit Prompt (CRITICAL — ensures checklists + protocol docs are injected)

Call `mcp__audit__build_audit_prompt` with `targetDir = TARGET`.

This returns TWO content blocks:
- **Block 1 (metadata JSON)**: fileCount, totalKb, strategy, protocolTypes, matchedChecklists, matchedProtocols, calibration
- **Block 2 (AUDIT_PROMPT)**: Complete audit prompt with checklists, protocol docs, and source code already embedded

Extract from metadata: `fileCount`, `totalKb`, `strategy`, `protocolTypes`.
Save AUDIT_PROMPT for use in Phase 2 — this contains the source code AND all relevant checklists/protocol docs.

If fileCount == 0, stop and inform the user.

## Phase 0.5: External Protocol Research (if needed)

Check metadata from Phase 0:
- If `matchedProtocols` is EMPTY or contains only generic docs, external research is needed
- Also scan the source code imports for external protocol references (e.g., IConvexBooster, ICurvePool, IAavePool, IUniswapV3Pool, ICompound, ILayerZero, ILIDO)

If external protocol dependencies are detected but no matching protocol doc exists:

Spawn a research agent for EACH unmatched external protocol (up to 3, in parallel):

```
Agent(subagent_type="general-purpose", model="sonnet", run_in_background=true, prompt="""
Research the following DeFi protocol for smart contract audit context.

PROTOCOL: {detected_protocol_name} (e.g., "Convex Finance", "Curve", "Aave v3")

Search the web for:
1. "{protocol_name} smart contract known vulnerabilities"
2. "{protocol_name} integration best practices"  
3. "{protocol_name} audit findings"

Produce a concise summary (max 30 lines) covering:
- Core mechanism: how deposits/withdrawals/rewards work
- Known vulnerability patterns: reentrancy, oracle manipulation, shutdown scenarios
- Integration gotchas: operator changes, pool shutdown, reward claim ordering
- Key invariants: what must hold for integrators

Output as a protocol doc in this format:
### {Protocol Name}
- [key fact 1]
- [key fact 2]
...
""")
```

Append the research results to AUDIT_PROMPT before Phase 2.
This ensures that even without pre-written protocol docs, the audit has external context.

**Skip this phase if**: matchedProtocols already covers the detected external dependencies, OR if `--no-research` flag is passed.

## Phase 1: Protocol Analysis

Also call `mcp__audit__bundle_build` with `targetDir = TARGET` to get `allFiles` and `topFiles`.

Spawn the analyst agent:
```
Agent(subagent_type="BugChainAudit:analyst", model="opus", prompt="""
Analyze this smart contract bundle for audit preparation.

Protocol types detected: {protocolTypes}
File count: {fileCount}, Total size: {totalKb}KB
Top files by size: {topFiles}

Read the source code files from {TARGET} and provide:
1. Protocol type classification
2. 15+ invariants
3. Function pair mapping
4. Strategy recommendation
5. Cluster recommendation (if >200KB)
""")
```

Save analyst output as ANALYSIS for subsequent phases.

## Phase 2: Audit Execution

**IMPORTANT**: Each agent MUST receive AUDIT_PROMPT (from Phase 0) which contains the checklists, protocol docs, and source code. Do NOT build a separate prompt — use AUDIT_PROMPT directly.

### Strategy A: <200KB → Persona Ensemble

Spawn 3 agents IN PARALLEL (run_in_background=true):

```
Agent(subagent_type="BugChainAudit:attacker", prompt="""
INVARIANTS FROM ANALYSIS:
{ANALYSIS.invariants}

PROTOCOL TYPES: {ANALYSIS.protocolTypes}

Below is the complete audit prompt with checklists, protocol docs, and source code:

{AUDIT_PROMPT}
""")

Agent(subagent_type="BugChainAudit:defender", prompt="""
INVARIANTS FROM ANALYSIS:
{ANALYSIS.invariants}

Below is the complete audit prompt with checklists, protocol docs, and source code:

{AUDIT_PROMPT}
""")

Agent(subagent_type="BugChainAudit:protocol-expert", prompt="""
INVARIANTS FROM ANALYSIS:
{ANALYSIS.invariants}

PROTOCOL TYPES: {ANALYSIS.protocolTypes}
CRITICAL CONTRACTS: {ANALYSIS.criticalContracts}

Below is the complete audit prompt with checklists, protocol docs, and source code:

{AUDIT_PROMPT}
""")
```

**If protocolTypes includes "dex", "options", or code contains custom math functions (exp, log, sqrt, pow, TWAP, sqrtPrice):**

Also spawn a 4th agent:
```
Agent(subagent_type="BugChainAudit:math-auditor", model="opus", run_in_background=true, prompt="""
INVARIANTS FROM ANALYSIS:
{ANALYSIS.invariants}

PROTOCOL TYPES: {ANALYSIS.protocolTypes}

Audit ALL mathematical operations in this code for precision errors, overflow, approximation failures.
Focus on: fixed-point arithmetic, AMM math, fee calculations, reward distribution formulas.

{AUDIT_PROMPT}
""")
```

Wait for all agents (3 or 4). Collect findings.

### Strategy B: 200-500KB → Split + Ensemble

1. Call `mcp__audit__bundle_split` with allFiles, maxClusterKb=200
2. For each cluster:
   a. Read cluster files from disk and concatenate into a cluster bundle
   b. Call `mcp__audit__detect_protocol` with a temp bundle for the cluster to get calibrated checklists/protocol docs
   c. Spawn 3 persona agents with: ANALYSIS.invariants + cluster checklist/protocol content + cluster source code
3. Wait for all. Collect findings.

### Strategy C: 500KB+ → Split + Single + Critic Loop

1. Call `mcp__audit__bundle_split` with allFiles, maxClusterKb=200
2. For each cluster:
   a. Read cluster files and concatenate
   b. Get calibrated checklists/protocol docs for the cluster
   c. Spawn 1 agent (attacker persona) with: ANALYSIS.invariants + checklist/protocol content + cluster source code
3. Wait for all. Collect findings.
4. Proceed directly to Phase 4 (critic loop is mandatory for this strategy).

## Phase 3: Findings Union + Deduplication

Merge all agent findings into a single list:
1. Parse each agent's numbered findings
2. Deduplicate: same function + same issue → keep the more detailed one
3. Assign sequential VULN-NNN IDs
4. Verify code existence: referenced function/variable exists in source?

## Phase 4: Validation

Group findings into batches of 10.
For each batch, spawn a validator agent IN PARALLEL:

```
Agent(subagent_type="BugChainAudit:validator", prompt="""
Verify these findings against the source code.

FINDINGS:
{batch of 10 findings}

SOURCE CODE (relevant files):
{source files referenced by findings}
""")
```

Remove FALSE_POSITIVE findings. Keep VALID and UNCERTAIN.

## Phase 5: Critic Loop (1 round)

Spawn critic agent:
```
Agent(subagent_type="BugChainAudit:critic", model="opus", prompt="""
Review audit coverage. Here are the validated findings and the full file list.

VALIDATED FINDINGS:
{findings after validation}

ALL FILES IN SCOPE:
{allFiles}

ANALYST INVARIANTS:
{ANALYSIS.invariants}

MATCHED CHECKLISTS: {metadata.matchedChecklists}
MATCHED PROTOCOL DOCS: {metadata.matchedProtocols}

Identify gaps and produce re-audit directives.
""")
```

For each HIGH_PRIORITY gap from critic:
- Spawn 1 additional attacker agent targeting that specific area, with AUDIT_PROMPT for context
- Add new findings to the list
- Validate new findings (same as Phase 4)

## Phase 6: Report Generation

Spawn reporter agent:
```
Agent(subagent_type="BugChainAudit:reporter", prompt="""
Generate SECURITY_AUDIT_REPORT.md from these validated findings.

FINDINGS:
{all validated findings with verdicts}

PROTOCOL INFO:
{ANALYSIS output}

AUDIT METADATA:
- Strategy: {strategy}
- Files: {fileCount}
- Size: {totalKb}KB
- Protocol types: {protocolTypes}
- Checklists used: {matchedChecklists}
- Protocol docs used: {matchedProtocols}
- Agents deployed: {agent count}
""")
```

Write output to `SECURITY_AUDIT_REPORT.md` in the working directory.

</Execution_Policy>

<Completion_Criteria>
- SECURITY_AUDIT_REPORT.md generated
- All FALSE_POSITIVE findings removed
- Critic loop completed (at least 1 round)
- Report includes methodology section
</Completion_Criteria>
