import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";

export const BundleCompressInputSchema = z.object({
  bundlePath: z.string().describe("Path to the bundle file"),
  outputPath: z.string().optional().describe("Output path (default: {bundlePath}.compressed)"),
  level: z
    .enum(["light", "medium", "aggressive"])
    .default("medium")
    .describe("Compression level: light=comments only, medium=+unused views, aggressive=+interfaces"),
});

interface FunctionInfo {
  name: string;
  visibility: "external" | "internal" | "public" | "private";
  mutability: "view" | "pure" | "payable" | "";
  startLine: number;
  endLine: number;
  file: string;
  signature: string;
}

interface CompressStats {
  originalSizeKb: number;
  compressedSizeKb: number;
  reductionPercent: number;
  removedCommentLines: number;
  removedFunctions: string[];
  removedInterfaces: string[];
  keptFunctions: number;
}

function extractFunctions(content: string, fileName: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const funcMatch = line.match(
      /^\s*function\s+(\w+)\s*\(([^)]*)\)\s*(external|public|internal|private)?\s*(view|pure|payable)?\s*/
    );
    if (!funcMatch) continue;

    const name = funcMatch[1];
    const visibility = (funcMatch[3] || "public") as FunctionInfo["visibility"];
    const mutability = (funcMatch[4] || "") as FunctionInfo["mutability"];

    // Find function end (matching braces)
    let braceCount = 0;
    let started = false;
    let endLine = i;

    // Check if it's interface/abstract (ends with ;)
    if (line.endsWith(";")) {
      endLine = i;
    } else {
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            braceCount++;
            started = true;
          }
          if (ch === "}") braceCount--;
        }
        if (started && braceCount === 0) {
          endLine = j;
          break;
        }
      }
    }

    functions.push({
      name,
      visibility,
      mutability,
      startLine: i,
      endLine,
      file: fileName,
      signature: `${name}(${funcMatch[2].replace(/\s+/g, " ").trim()})`,
    });
  }

  return functions;
}

function isReferencedInBundle(
  funcName: string,
  sourceFile: string,
  allFiles: Map<string, string>
): boolean {
  // Check if this function is called from OTHER files in the bundle
  // Patterns: .funcName(, .funcName{, interfaceName(target).funcName(
  const callPattern = new RegExp(`\\.${funcName}\\s*[({]|${funcName}\\s*\\(`, "g");

  for (const [fileName, content] of allFiles) {
    if (fileName === sourceFile) continue;
    if (callPattern.test(content)) return true;
  }
  return false;
}

function removeComments(content: string): { result: string; linesRemoved: number } {
  const lines = content.split("\n");
  const result: string[] = [];
  let inMultiLine = false;
  let linesRemoved = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Multi-line comment tracking
    if (inMultiLine) {
      linesRemoved++;
      if (trimmed.includes("*/")) {
        inMultiLine = false;
      }
      continue;
    }

    // Start of multi-line comment
    if (trimmed.startsWith("/*") || trimmed.startsWith("/**")) {
      linesRemoved++;
      if (!trimmed.includes("*/")) {
        inMultiLine = true;
      }
      continue;
    }

    // Single-line comment (full line)
    if (trimmed.startsWith("//")) {
      linesRemoved++;
      continue;
    }

    // SPDX license
    if (trimmed.startsWith("// SPDX-License")) {
      linesRemoved++;
      continue;
    }

    // Empty lines (keep max 1 consecutive)
    if (trimmed === "" && result.length > 0 && result[result.length - 1].trim() === "") {
      linesRemoved++;
      continue;
    }

    result.push(line);
  }

  return { result: result.join("\n"), linesRemoved };
}

function compressStrings(content: string): { result: string; charsRemoved: number } {
  let charsRemoved = 0;
  let result = content;

  // 1. Shorten require/revert message strings (keep first 4 chars as ID)
  // require(cond, "Amount must be greater than zero") → require(cond, "Amou")
  result = result.replace(
    /(require\s*\([^,]+,\s*)"([^"]{8,})"/g,
    (_match, prefix, msg) => {
      const shortened = msg.substring(0, 4);
      charsRemoved += msg.length - 4;
      return `${prefix}"${shortened}"`;
    }
  );

  // revert("Long error message") → revert("Long")
  result = result.replace(
    /(revert\s*\(\s*)"([^"]{8,})"/g,
    (_match, prefix, msg) => {
      const shortened = msg.substring(0, 4);
      charsRemoved += msg.length - 4;
      return `${prefix}"${shortened}"`;
    }
  );

  // 2. Compress string constants/literals (name, symbol, description, URI)
  // string public name = "Very Long Protocol Name" → string public name = "..."
  result = result.replace(
    /(string\s+(?:public\s+|private\s+|internal\s+)?(?:constant\s+)?(?:override\s+)?\w+\s*=\s*)"([^"]{10,})"/g,
    (_match, prefix, str) => {
      charsRemoved += str.length - 3;
      return `${prefix}"..."`;
    }
  );

  // 3. Compress URI/URL strings in assignments
  result = result.replace(
    /=\s*"(https?:\/\/[^"]{10,})"/g,
    (_match, url) => {
      charsRemoved += url.length - 7;
      return `= "http..."`;
    }
  );

  // 4. Compress long string concatenations in return statements (tokenURI builders)
  // Keep abi.encodeWithSignature, abi.encodeWithSelector, keccak256 strings intact
  result = result.replace(
    /(string\s*\(\s*abi\.encodePacked\s*\(\s*)"([^"]{20,})"/g,
    (_match, prefix, str) => {
      // Only compress if it looks like metadata/HTML/JSON, not function sigs
      if (/^[a-zA-Z]+\(/.test(str)) return _match; // function signature, keep
      charsRemoved += str.length - 5;
      return `${prefix}"[str]"`;
    }
  );

  return { result, charsRemoved };
}

function removeImports(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("import "))
    .join("\n");
}

function removePragma(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("pragma "))
    .join("\n");
}

export async function bundleCompress(
  input: z.infer<typeof BundleCompressInputSchema>
): Promise<CompressStats & { compressedBundlePath: string }> {
  const { bundlePath, level } = input;
  const outputPath = input.outputPath || bundlePath.replace(".txt", ".compressed.txt");
  const bundleContent = await readFile(bundlePath, "utf-8");
  const originalSize = Buffer.byteLength(bundleContent);

  // Parse bundle into files
  const fileMap = new Map<string, string>();
  const fileSections = bundleContent.split(/^## File: /m);

  for (const section of fileSections) {
    if (!section.trim()) continue;
    const firstNewline = section.indexOf("\n");
    if (firstNewline === -1) continue;
    const fileName = section.substring(0, firstNewline).trim();
    const fileContent = section.substring(firstNewline + 1);
    if (fileName) fileMap.set(fileName, fileContent);
  }

  let totalCommentLines = 0;
  const removedFunctions: string[] = [];
  const removedInterfaces: string[] = [];
  const compressedFiles = new Map<string, string>();

  for (const [fileName, content] of fileMap) {
    let processed = content;

    // Level 1 (light): Remove comments, imports, pragma, compress strings
    if (level === "light" || level === "medium" || level === "aggressive") {
      const commentResult = removeComments(processed);
      processed = commentResult.result;
      totalCommentLines += commentResult.linesRemoved;
      processed = removeImports(processed);
      processed = removePragma(processed);
      const stringResult = compressStrings(processed);
      processed = stringResult.result;
    }

    // Level 2 (medium): Remove unreferenced external view/pure functions
    if (level === "medium" || level === "aggressive") {
      const functions = extractFunctions(processed, fileName);
      const lines = processed.split("\n");

      // Find removable functions (external view/pure not referenced elsewhere)
      const toRemove: Array<{ start: number; end: number; name: string }> = [];

      for (const func of functions) {
        if (
          (func.visibility === "external" || func.visibility === "public") &&
          (func.mutability === "view" || func.mutability === "pure")
        ) {
          // Check if referenced in other files
          if (!isReferencedInBundle(func.name, fileName, fileMap)) {
            // Don't remove standard ERC functions
            const standardFuncs = [
              "balanceOf", "totalSupply", "allowance", "name", "symbol",
              "decimals", "ownerOf", "tokenURI", "supportsInterface",
              "getApproved", "isApprovedForAll",
            ];
            if (!standardFuncs.includes(func.name)) {
              toRemove.push({
                start: func.startLine,
                end: func.endLine,
                name: `${fileName}:${func.signature}`,
              });
            }
          }
        }
      }

      // Remove functions (reverse order to preserve line numbers)
      if (toRemove.length > 0) {
        toRemove.sort((a, b) => b.start - a.start);
        for (const rm of toRemove) {
          // Replace function lines with a single comment
          const placeholder = `    // [compressed] ${rm.name.split(":").pop()} — external view, not referenced in bundle`;
          lines.splice(rm.start, rm.end - rm.start + 1, placeholder);
          removedFunctions.push(rm.name);
        }
        processed = lines.join("\n");
      }
    }

    // Level 3 (aggressive): Remove interface files if implementation exists
    if (level === "aggressive") {
      const isInterface = /^\s*interface\s+\w+/m.test(processed);
      if (isInterface) {
        // Check if any contract in bundle implements this interface
        const ifaceMatch = processed.match(/interface\s+(\w+)/);
        if (ifaceMatch) {
          const ifaceName = ifaceMatch[1];
          let hasImpl = false;
          for (const [otherFile, otherContent] of fileMap) {
            if (otherFile === fileName) continue;
            if (
              new RegExp(`contract\\s+\\w+[^{]*\\b${ifaceName}\\b`).test(
                otherContent
              )
            ) {
              hasImpl = true;
              break;
            }
          }
          if (hasImpl) {
            processed = `// [compressed] Interface ${ifaceName} — implementation exists in bundle\n`;
            removedInterfaces.push(fileName);
          }
        }
      }
    }

    compressedFiles.set(fileName, processed);
  }

  // Reassemble bundle
  const compressedParts: string[] = [];
  for (const [fileName, content] of compressedFiles) {
    compressedParts.push(`## File: ${fileName}\n${content}`);
  }
  const compressedBundle = compressedParts.join("\n\n");
  const compressedSize = Buffer.byteLength(compressedBundle);

  await writeFile(outputPath, compressedBundle, "utf-8");

  const keptFunctions =
    [...compressedFiles.values()]
      .join("\n")
      .split("\n")
      .filter((l) => /^\s*function\s+\w+/.test(l)).length;

  return {
    originalSizeKb: Math.round(originalSize / 1024),
    compressedSizeKb: Math.round(compressedSize / 1024),
    reductionPercent: Math.round((1 - compressedSize / originalSize) * 100),
    removedCommentLines: totalCommentLines,
    removedFunctions,
    removedInterfaces,
    keptFunctions,
    compressedBundlePath: outputPath,
  };
}
