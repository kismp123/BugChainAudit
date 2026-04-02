import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bundleBuild } from "./bundle-builder.js";
import { detectProtocol } from "./protocol-detector.js";
import { checklistScan } from "./checklist-scanner.js";
import { bundleCompress } from "./bundle-compressor.js";

export const BuildAuditPromptInputSchema = z.object({
  targetDir: z.string().describe("Path to Solidity project directory"),
  dataDir: z
    .string()
    .optional()
    .describe("Path to plugin data/ directory (auto-detected if omitted)"),
});

const AUDIT_PROMPT_TEMPLATE = `You are an expert smart contract security auditor.

## Step 0 — Invariant Extraction (MOST IMPORTANT)
1. List ALL storage variables and their meaning
2. Derive 15+ invariants (asset conservation, liquidation, round-trip, share value, fees, state transitions, 5+ protocol-specific)
3. For each invariant: construct a call sequence that could break it
4. Trace full token lifecycle: deposit→accrue→transfer→liquidate→withdraw→burn

## Step 1 — Economic Flow Tracing
For each core flow (deposit, borrow, liquidate, claim, withdraw):
1. What tokens move, between whom?
2. What state variables change?
3. What external calls are made?
4. Can an attacker sandwich/frontrun this flow?

## Step 2 — Pattern Scan
reentrancy, flash loan, access control, oracle, integer precision, frontrunning,
token integration, initialization, DOS, signature replay, logic errors

## Step 3 — MANDATORY Checklist Verification (DO NOT SKIP)
For EACH item below, check the code and output: ✓ (safe), ✗ (vulnerable → add to findings), or N/A.
You MUST go through EVERY item. If you skip items, the audit is incomplete.

{CHECKLIST_CONTENT}

After completing the checklist, add ALL ✗ items to your findings list.

## Step 3.5 — Pre-Scanned Code Matches (AUTO-DETECTED)
The following code snippets were automatically found matching checklist patterns.
For EACH snippet below, determine if it represents a vulnerability. If yes, add to findings.

{CHECKLIST_SCAN}

## Step 4 — Mathematical Precision Audit
For EVERY custom math function (exp, log, sqrt, pow, division, multiplication sequences):
1. **Extreme value test**: Substitute 0, 1, type(uint256).max, and smallest non-zero value
2. **Ordering**: Is it (a*b)/c or (a/b)*c? Does order matter for precision?
3. **Intermediate overflow**: Can a*b overflow uint256 before dividing by c?
4. **Approximation bounds**: For Taylor/polynomial approximations, what is the max error? At what input range does the approximation diverge?
5. **Accumulation drift**: Does repeated application of the formula accumulate rounding errors?
6. **Fee/rate edge**: What happens at 0% fee? 100% fee? Fee larger than principal?

For AMM/DEX protocols specifically:
- sqrtPriceX96 calculations: overflow risk at extreme tick values?
- Tick arithmetic: off-by-one at spacing boundaries? Symmetric behavior at negative ticks?
- Liquidity math: what if liquidity = 0? What if position spans only 1 tick?
- TWAP: observation array index wrapping? Insufficient cardinality?
- Fee accumulation: feeGrowthGlobal overflow by design (uint256 wrapping) — but does subtraction handle wrapping correctly?

## Step 5 — Protocol-Specific Knowledge
{PROTOCOL_CONTENT}

## Step 6 — Adversarial Scenarios
For the top 5 highest-value functions:
1. What if an attacker has unlimited flash loan capital?
2. What if an attacker controls a keeper/relayer/oracle?
3. What if an attacker front-runs every admin transaction?
4. What if an external dependency (Convex, Aave, Curve) shuts down or changes behavior?
5. What if a token has fee-on-transfer, is rebasing, has callbacks (ERC777), or has two addresses?

## Step 7 — Cross-Contract State
- Which state changes in Contract A affect calculations in Contract B?
- Are there cross-contract reentrancy paths?
- Parameter change in one contract breaks assumptions in another?
- External protocol (Uniswap, Aave, Convex) changes operator/pauses/shuts down — does this code handle it?

## Severity Rules — Privileged Access Adjustment
If a finding is ONLY exploitable by a privileged role (owner, admin, guardian, keeper, relayer, deployer, rebalancer, multisig), you MUST lower severity:
- onlyOwner/onlyAdmin required → LOW (not H/M)
- Multisig + Timelock protection → INFO
- Intentional admin abuse (fee 99%, rug pull) → LOW
- Semi-trusted role (keeper, relayer) can harm users → MEDIUM at most
- No access control needed → Keep original severity
Do NOT report admin-dependent issues as HIGH. HIGH is reserved for issues any external user can exploit.

## Output
Numbered list of ALL findings.
Format: N. title | severity (H/M/L/INFO) | affected function | description
Minimum 25 findings. Recall > Precision (finding FP is OK, missing a real bug is not).
IMPORTANT: Include ALL ✗ items from Step 3 in your findings.

## SOURCE CODE BEGINS
{BUNDLE_CONTENT}`;

export async function buildAuditPrompt(
  input: z.infer<typeof BuildAuditPromptInputSchema>
) {
  const { targetDir } = input;

  // Resolve dataDir - try common locations
  let dataDir = input.dataDir;
  if (!dataDir) {
    const candidates = [
      join(process.env.CLAUDE_PLUGIN_ROOT || "", "data"),
      "/home/gegul/skills/claude-audit/data",
    ];
    for (const candidate of candidates) {
      try {
        await readFile(join(candidate, "checklists", "core.md"), "utf-8");
        dataDir = candidate;
        break;
      } catch {
        // try next
      }
    }
  }
  if (!dataDir) {
    dataDir = "/home/gegul/skills/claude-audit/data";
  }

  // Build bundle
  const bundleResult = await bundleBuild({ targetDir });
  if ("error" in bundleResult) {
    return { error: bundleResult.error };
  }

  // Detect protocol and get injection content
  const protocolResult = await detectProtocol({
    bundlePath: bundleResult.bundlePath,
    dataDir,
  });

  // Compress bundle if 200KB+ (medium for 200-400KB, aggressive for 400KB+)
  // NOTE: 100KB+ light compression tested and REJECTED — removes comments that
  // contain developer intent hints, causing 44pp drop on Paladin (100%→56%)
  let effectiveBundlePath = bundleResult.bundlePath;
  let compressionStats: { reductionPercent: number; removedFunctions: string[] } | null = null;

  if (bundleResult.totalKb >= 200) {
    const level = bundleResult.totalKb >= 400 ? "aggressive" : "medium";
    const compressed = await bundleCompress({
      bundlePath: bundleResult.bundlePath,
      level,
    });
    effectiveBundlePath = compressed.compressedBundlePath;
    compressionStats = {
      reductionPercent: compressed.reductionPercent,
      removedFunctions: compressed.removedFunctions,
    };
  }

  // Read bundle content (compressed if applicable)
  const bundleContent = await readFile(effectiveBundlePath, "utf-8");

  // Run checklist scan — grep code for checklist patterns (on original, not compressed)
  const scanResult = await checklistScan({
    bundlePath: bundleResult.bundlePath,
    dataDir,
  });

  // Assemble final prompt
  const checklistContent =
    protocolResult.injection.checklistContent || "No specific checklists matched.";
  const protocolContent =
    protocolResult.injection.protocolContent || "No specific protocol docs matched.";
  const checklistScanContent =
    scanResult.matchedItems > 0
      ? scanResult.scanOutput
      : "No automatic matches found. Manually verify each checklist item against the code.";

  const finalPrompt = AUDIT_PROMPT_TEMPLATE.replace(
    "{CHECKLIST_CONTENT}",
    checklistContent
  )
    .replace("{CHECKLIST_SCAN}", checklistScanContent)
    .replace("{PROTOCOL_CONTENT}", protocolContent)
    .replace("{BUNDLE_CONTENT}", bundleContent);

  return {
    prompt: finalPrompt,
    metadata: {
      targetDir,
      fileCount: bundleResult.fileCount,
      totalKb: bundleResult.totalKb,
      compressedKb: compressionStats
        ? Math.round(Buffer.byteLength(bundleContent) / 1024)
        : bundleResult.totalKb,
      strategy: (() => {
        const effectiveKb = compressionStats
          ? Math.round(Buffer.byteLength(bundleContent) / 1024)
          : bundleResult.totalKb;
        if (effectiveKb < 200) return "A";
        if (effectiveKb < 500) return "B";
        return "C";
      })(),
      protocolTypes: bundleResult.protocolTypes,
      matchedChecklists: protocolResult.matched.checklists,
      matchedProtocols: protocolResult.matched.protocols,
      calibration: protocolResult.calibration,
      checklistScan: {
        totalItems: scanResult.totalItems,
        matchedItems: scanResult.matchedItems,
        scanSizeKb: scanResult.scanOutputSizeKb,
      },
      compression: compressionStats
        ? {
            reductionPercent: compressionStats.reductionPercent,
            removedViewFunctions: compressionStats.removedFunctions.length,
          }
        : null,
      promptSizeKb: Math.round(Buffer.byteLength(finalPrompt) / 1024),
    },
  };
}
