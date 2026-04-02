import { z } from "zod";
import { readdir, readFile, stat } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";

export const BundleBuildInputSchema = z.object({
  targetDir: z.string().describe("Path to the Solidity project directory"),
  outputPath: z
    .string()
    .optional()
    .describe("Custom output path for the bundle file"),
});

export type BundleBuildInput = z.infer<typeof BundleBuildInputSchema>;

const EXCLUDE_DIRS =
  /(test|tests|lib|libs|mock|mocks|interfaces?|scripts?|node_modules|forge-std|openzeppelin|chainlink|uniswap|docs)\//i;
const EXCLUDE_FILES = /\.(t|s)\.sol$|(?:Test|Mock|Deploy)\.sol$/i;

const PROTOCOL_KEYWORDS: Record<string, RegExp> = {
  lending: /borrow|liquidat|healthFactor|collateral.*ratio|repay|lend/i,
  vault: /ERC4626|strategy|yield|vault.*share|pricePerShare/i,
  dex: /swap|pair|reserve|AMM|liquidity.*pool|addLiquidity/i,
  governance: /Governor|proposal|quorum|ballot|vote|delegate/i,
  staking: /stake|reward|epoch|gauge|distributeReward/i,
  options: /perpetual|position.*leg|chunkKey|tokenType|strike/i,
  bridge: /bridge|crosschain|LayerZero|relayer|sendFrom/i,
  nft: /ERC721|tokenURI|mint.*NFT|royalt/i,
};

async function collectSolFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".sol")) {
        const relPath = relative(dir, fullPath);
        if (!EXCLUDE_DIRS.test(relPath + "/") && !EXCLUDE_FILES.test(relPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files.sort();
}

function detectProtocolType(content: string): string[] {
  const types: string[] = [];
  for (const [type, regex] of Object.entries(PROTOCOL_KEYWORDS)) {
    const matches = content.match(new RegExp(regex, "gi"));
    if (matches && matches.length >= 3) {
      types.push(type);
    }
  }
  return types.length > 0 ? types : ["default"];
}

export async function bundleBuild(input: BundleBuildInput) {
  const { targetDir, outputPath } = input;

  const files = await collectSolFiles(targetDir);
  if (files.length === 0) {
    return {
      error: "No Solidity files found in scope",
      targetDir,
    };
  }

  let totalBytes = 0;
  const fileSizes: Array<{ path: string; sizeKb: number }> = [];
  const bundleParts: string[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const size = Buffer.byteLength(content);
    totalBytes += size;
    fileSizes.push({
      path: relative(targetDir, file),
      sizeKb: Math.round(size / 1024),
    });
    bundleParts.push(`## File: ${relative(targetDir, file)}\n${content}\n`);
  }

  const totalKb = Math.round(totalBytes / 1024);
  const bundleContent = bundleParts.join("\n");

  // Detect protocol type from top content
  const topContent = bundleContent.slice(0, 100_000);
  const protocolTypes = detectProtocolType(topContent);

  // Determine strategy
  let strategy: string;
  if (totalKb < 200) {
    strategy = "A"; // persona ensemble
  } else if (totalKb < 500) {
    strategy = "B"; // split + ensemble
  } else {
    strategy = "C"; // split + single + critic loop
  }

  // Write bundle
  const outPath =
    outputPath || `/tmp/audit-bundle-${basename(targetDir)}.txt`;
  await writeFile(outPath, bundleContent, "utf-8");

  // Sort files by size descending
  fileSizes.sort((a, b) => b.sizeKb - a.sizeKb);

  return {
    targetDir,
    fileCount: files.length,
    totalKb,
    bundlePath: outPath,
    strategy,
    protocolTypes,
    topFiles: fileSizes.slice(0, 15),
    allFiles: fileSizes.map((f) => f.path),
  };
}
