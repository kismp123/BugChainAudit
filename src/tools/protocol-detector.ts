import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const ProtocolDetectInputSchema = z.object({
  bundlePath: z.string().describe("Path to the bundle file"),
  dataDir: z.string().describe("Path to plugin data/ directory"),
});

export type ProtocolDetectInput = z.infer<typeof ProtocolDetectInputSchema>;

interface DataFile {
  path: string;
  filename: string;
  keywords: string[];
  content: string;
  sizeBytes: number;
}

async function loadDataFiles(dir: string): Promise<DataFile[]> {
  const files: DataFile[] = [];
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const fullPath = join(dir, entry);
      const content = await readFile(fullPath, "utf-8");

      // Extract keywords from frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const kwLine = fmMatch[1]
        .split("\n")
        .find((l) => l.startsWith("keywords:"));
      if (!kwLine) continue;

      const keywords = kwLine
        .replace("keywords:", "")
        .trim()
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      // Strip frontmatter for content
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");

      files.push({
        path: fullPath,
        filename: entry,
        keywords,
        content: body,
        sizeBytes: Buffer.byteLength(body),
      });
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function matchKeywords(bundleContent: string, keywords: string[]): boolean {
  if (keywords.includes("always")) return true;
  const pattern = keywords.join("|");
  if (!pattern) return false;
  try {
    return new RegExp(pattern, "i").test(bundleContent);
  } catch {
    return false;
  }
}

export async function detectProtocol(input: ProtocolDetectInput) {
  const { bundlePath, dataDir } = input;
  const bundleContent = await readFile(bundlePath, "utf-8");
  const bundleSizeBytes = Buffer.byteLength(bundleContent);

  // Load checklists and protocol docs
  const checklists = await loadDataFiles(join(dataDir, "checklists"));
  const protocols = await loadDataFiles(join(dataDir, "protocols"));

  // Match against bundle
  const matchedChecklists = checklists.filter((f) =>
    matchKeywords(bundleContent, f.keywords)
  );
  const matchedProtocols = protocols.filter((f) =>
    matchKeywords(bundleContent, f.keywords)
  );

  // Calculate injection sizes
  const checklistSize = matchedChecklists.reduce(
    (sum, f) => sum + f.sizeBytes,
    0
  );
  const protocolSize = matchedProtocols.reduce(
    (sum, f) => sum + f.sizeBytes,
    0
  );
  const totalInjection = checklistSize + protocolSize;

  // Calibrate: keep total injection < 20% of bundle (min 8KB floor for small bundles)
  const maxInjectionBytes = Math.max(bundleSizeBytes * 0.2, 8 * 1024);
  let calibrated = false;
  let finalChecklists = matchedChecklists;
  let finalProtocols = matchedProtocols;

  if (totalInjection > maxInjectionBytes) {
    calibrated = true;
    let budget = maxInjectionBytes;

    // Priority 1: core checklist always included
    const coreChecklist = matchedChecklists.filter(
      (f) => f.filename === "core.md"
    );
    const otherChecklists = matchedChecklists.filter(
      (f) => f.filename !== "core.md"
    );
    finalChecklists = [...coreChecklist];
    budget -= coreChecklist.reduce((sum, f) => sum + f.sizeBytes, 0);

    // Priority 2: protocol docs (most impactful per benchmark data)
    finalProtocols = [];
    for (const p of matchedProtocols) {
      if (p.sizeBytes <= budget) {
        finalProtocols.push(p);
        budget -= p.sizeBytes;
      }
    }

    // Priority 3: remaining checklists
    for (const c of otherChecklists) {
      if (c.sizeBytes <= budget) {
        finalChecklists.push(c);
        budget -= c.sizeBytes;
      }
    }
  }

  const finalInjectionSize =
    finalChecklists.reduce((sum, f) => sum + f.sizeBytes, 0) +
    finalProtocols.reduce((sum, f) => sum + f.sizeBytes, 0);

  return {
    bundleSizeKb: Math.round(bundleSizeBytes / 1024),
    matched: {
      checklists: finalChecklists.map((f) => f.filename),
      protocols: finalProtocols.map((f) => f.filename),
    },
    injection: {
      checklistContent: finalChecklists.map((f) => f.content).join("\n"),
      protocolContent: finalProtocols.map((f) => f.content).join("\n"),
    },
    calibration: {
      calibrated,
      injectionKb: Math.round(finalInjectionSize / 1024),
      injectionRatio: +(finalInjectionSize / bundleSizeBytes).toFixed(3),
      dropped: calibrated
        ? {
            checklists: matchedChecklists
              .filter((c) => !finalChecklists.includes(c))
              .map((f) => f.filename),
            protocols: matchedProtocols
              .filter((p) => !finalProtocols.includes(p))
              .map((f) => f.filename),
          }
        : { checklists: [], protocols: [] },
    },
  };
}
