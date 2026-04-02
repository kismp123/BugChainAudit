---
name: validate
description: Validate audit findings against source code - filter false positives
level: 2
aliases: ["validate-findings", "validate-kr"]
---

<Purpose>
Validates existing audit findings against source code.
Verdicts each finding as VALID / FALSE_POSITIVE / UNCERTAIN and updates the report.
</Purpose>

<Use_When>
- User has an existing audit report and wants to filter false positives
- User says "validate", "validate", "verify findings"
- After a manual or external audit to improve precision
</Use_When>

<Execution_Policy>

FINDINGS_FILE = first argument or "SECURITY_AUDIT_REPORT.md"
SOURCE_DIR = --source argument or "src/"

## Step 1: Parse Findings
Read FINDINGS_FILE and extract all VULN-NNN findings with:
- title, severity, location (Contract.sol:line), description, attack scenario

## Step 2: Load Source
For each finding's location, find the source file:
```bash
find SOURCE_DIR -name "Contract.sol" -not -path "*/test/*" -not -path "*/lib/*"
```

For Diamond/Facet patterns, also search by function name:
```bash
grep -rl "function functionName" SOURCE_DIR --include="*.sol" | grep -v test/ | head -3
```

## Step 3: Validate

Group findings into batches of 10.
For each batch, spawn a validator agent IN PARALLEL:

```
Agent(subagent_type="BugChainAudit:validator", prompt="""
Verify these findings against the source code.

FINDINGS:
{batch}

SOURCE CODE:
{relevant source files, max 500 lines each}
""")
```

## Step 4: Update Report

Add verdict to each finding in the report:
```markdown
### VULN-001: [Title]
- **Severity**: HIGH
- **Verdict**: ✓ VALID
- **Reasoning**: (1-2 sentences)
```

## Step 5: Summary

Output:
```
## Validation Summary
- VALID:          X (real vulnerabilities)
- FALSE_POSITIVE: X (removed)
- UNCERTAIN:      X (manual review needed)

Precision estimate: X% (VALID / total)
```

</Execution_Policy>
