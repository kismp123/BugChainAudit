import { z } from "zod";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const ChecklistScanInputSchema = z.object({
  bundlePath: z.string().describe("Path to the bundle file"),
  dataDir: z.string().describe("Path to plugin data/ directory"),
});

interface ChecklistItem {
  text: string;
  grepPatterns: string[];
  file: string;
}

interface ScanResult {
  item: string;
  file: string;
  matches: Array<{
    pattern: string;
    snippets: string[];
  }>;
}

// Extract grep patterns from checklist items
// Format: "- Item text: description? ~grep:pattern1,pattern2~"
// Or auto-derive from keywords in the item text
function extractGrepPatterns(itemText: string): string[] {
  // Check for explicit grep annotation: ~grep:pattern1,pattern2~
  const explicit = itemText.match(/~grep:([^~]+)~/);
  if (explicit) {
    return explicit[1].split(",").map((p) => p.trim());
  }

  // Auto-derive patterns from key technical terms in the item
  const patterns: string[] = [];
  const autoPatterns: Array<[RegExp, string[]]> = [
    // External reward bypass
    [/getReward|reward.*direct|reward.*bypass/i, ["getReward", "claimReward"]],
    // CREATE2 reorg
    [/CREATE2.*reorg|reorg.*CREATE2|predictable.*deploy/i, ["CREATE2", "create2", "salt"]],
    // Reentrancy
    [/reentrancy|callback.*reentr/i, ["nonReentrant", "ReentrancyGuard", ".call{"]],
    // Pause bypass
    [/pause.*bypass|unpause|whenNotPaused/i, ["whenNotPaused", "pause()", "_pause"]],
    // Fee-on-transfer
    [/fee.on.transfer|deflationary/i, ["balanceOf", "transfer(", "safeTransfer("]],
    // Oracle staleness
    [/stale.*price|staleness|updatedAt/i, ["updatedAt", "latestRoundData", "stalePrice"]],
    // Flash loan
    [/flash.loan|flash.*borrow/i, ["flashLoan", "flash(", "executeOperation"]],
    // First depositor
    [/first.deposit|totalSupply.*0|share.*inflation/i, ["totalSupply", "totalAssets", "previewDeposit"]],
    // Unsafe downcast
    [/downcast|uint96|uint128.*trunc/i, ["uint96(", "uint128(", "uint112(", "uint80("]],
    // Division before multiply — need specific patterns, not generic operators
    [/division.*before.*mult/i, ["/ ", ") *", "divide("]],
    [/precision.*floor/i, ["/ ", ") *"]],
    // encodePacked collision
    [/encodePacked.*collision/i, ["abi.encodePacked"]],
    // Two-address token
    [/two.address|dual.*entry/i, ["withdrawOtherToken", "rescueToken", "sweepToken"]],
    // Supply cap
    [/supply.*cap|maxSupply/i, ["maxSupply", "cap()", "MAX_SUPPLY"]],
    // Withdrawal transfer before burn
    [/withdraw.*transfer.*before.*burn|transfer.*before.*state/i, ["withdraw", "redeem", "_burn", "transfer("]],
    // Convex/Curve integration
    [/convex.*operator|convex.*shutdown|pool.*shutdown/i, ["isShutdown", "poolInfo", "operator()"]],
    // Balancer composable
    [/composable.*pool|invariant.*balancer/i, ["getActualSupply", "composable", "BPT"]],
    // ERC721 tokenURI
    [/tokenURI.*injection|SVG.*XSS/i, ["tokenURI", "generateSVG", "string.concat"]],
    // Emergency mechanism
    [/emergency.*reachab|pause.*not.*callable/i, ["Pausable", "pause()", "emergency"]],
    // Stale reference
    [/stale.*reference|admin.*update.*child/i, ["setFeeRecipient", "setTreasury", "updateAddress"]],
    // Reward-pool token overlap
    [/reward.*pool.*token.*overlap|reinvest.*fail/i, ["rewardToken", "reinvest", "sellRewardTokens"]],
    // Role provider
    [/role.*provider|credential.*override/i, ["grantRole", "revokeRole", "hasRole"]],
    // Unwrap revert
    [/unwrap.*revert|WETH.*ETH.*block/i, ["unwrap", "withdraw(", "WETH"]],
    // Dust accumulation
    [/dust.*accumulat|totalPoolClaim/i, ["totalPoolClaim", "reinvest", "compound"]],
    // Time/expiry logic — block.timestamp vs stored expiry
    [/block\.timestamp.*expir|expir.*block\.timestamp|wrong.*timestamp|temporal.*guard/i, ["block.timestamp", "expiry", "maturityDate", "fixedTermEndTime"]],
    [/fixed.term|maturity.*lock|term.*check/i, ["fixedTerm", "maturity", "block.timestamp", "expiry"]],
    [/post.close.*withdraw|withdrawal.*after.*clos/i, ["closeMarket", "isClosed", "withdraw", "block.timestamp"]],
    // Function inconsistency — different fee/logic across similar paths
    [/fee.*inconsisten|repay.*path|different.*fee.*rate/i, ["repay(", "repayAndDeposit", "repayOnBehalf", "closeBorrow", "closeMarket"]],
    [/repay.*closeBorrow|closeBorrow.*repay|repay.*path.*differ/i, ["repay(", "repayOnBehalf", "closeBorrow", "closeMarket", "liquidate"]],
    // Curve V2 — reward/pool token overlap, use_eth, remove_liquidity
    [/reward.*pool.*overlap|reinvest.*reward.*pool/i, ["rewardToken", "poolToken", "reinvest", "sellRewardTokens", "REWARD_TOKEN"]],
    [/use_eth|native.*ETH.*remove|remove_liquidity.*ETH/i, ["use_eth", "remove_liquidity", "remove_liquidity_one_coin", "withdraw("]],
    [/curve.*v2|curve.*reinvest|curve.*reward/i, ["remove_liquidity", "use_eth", "rewardToken", "CRV", "CVX"]],
  ];

  for (const [regex, grepPats] of autoPatterns) {
    if (regex.test(itemText)) {
      patterns.push(...grepPats);
    }
  }

  return [...new Set(patterns)];
}

function findSnippets(
  bundleContent: string,
  pattern: string,
  maxSnippets: number = 3,
  contextLines: number = 3
): string[] {
  const lines = bundleContent.split("\n");
  const snippets: string[] = [];
  const patternLower = pattern.toLowerCase();

  for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
    if (lines[i].toLowerCase().includes(patternLower)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      const snippet = lines
        .slice(start, end + 1)
        .map((l, idx) => `${start + idx + 1}: ${l}`)
        .join("\n");
      snippets.push(snippet);
      // Skip ahead to avoid overlapping snippets
      i = end + 1;
    }
  }
  return snippets;
}

export async function checklistScan(
  input: z.infer<typeof ChecklistScanInputSchema>
) {
  const { bundlePath, dataDir } = input;
  const bundleContent = await readFile(bundlePath, "utf-8");

  // Load all checklist files
  const checklistDir = join(dataDir, "checklists");
  const files = await readdir(checklistDir);
  const allItems: ChecklistItem[] = [];

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readFile(join(checklistDir, file), "utf-8");
    // Strip frontmatter
    const body = content.replace(/^---[\s\S]*?---\n?/, "");
    const lines = body.split("\n").filter((l) => l.startsWith("- "));

    for (const line of lines) {
      const text = line.replace(/^- /, "").trim();
      const grepPatterns = extractGrepPatterns(text);
      if (grepPatterns.length > 0) {
        allItems.push({ text, grepPatterns, file });
      }
    }
  }

  // Scan bundle for each item
  const results: ScanResult[] = [];
  let totalMatches = 0;

  for (const item of allItems) {
    const matches: ScanResult["matches"] = [];

    for (const pattern of item.grepPatterns) {
      // Skip patterns that are too short/generic (< 4 chars) to avoid noise
      if (pattern.length < 4) continue;
      const snippets = findSnippets(bundleContent, pattern, 2, 2);
      if (snippets.length > 0) {
        matches.push({ pattern, snippets });
      }
    }

    if (matches.length > 0) {
      results.push({
        item: item.text,
        file: item.file,
        matches,
      });
      totalMatches++;
    }
  }

  // Format output for prompt injection
  let scanOutput = "";
  for (const result of results) {
    scanOutput += `\n### CHECK: ${result.item}\n`;
    scanOutput += `Source: ${result.file}\n`;
    for (const match of result.matches) {
      scanOutput += `Found "${match.pattern}" in code:\n`;
      for (const snippet of match.snippets) {
        scanOutput += `\`\`\`\n${snippet}\n\`\`\`\n`;
      }
    }
  }

  return {
    totalItems: allItems.length,
    matchedItems: totalMatches,
    unmatchedItems: allItems.length - totalMatches,
    scanOutput,
    scanOutputSizeKb: Math.round(Buffer.byteLength(scanOutput) / 1024),
  };
}
