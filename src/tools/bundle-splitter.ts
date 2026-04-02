import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";

export const BundleSplitInputSchema = z.object({
  targetDir: z.string().describe("Path to the Solidity project directory"),
  files: z.array(z.string()).describe("List of .sol file paths (relative to targetDir)"),
  maxClusterKb: z
    .number()
    .default(200)
    .describe("Maximum cluster size in KB"),
});

export type BundleSplitInput = z.infer<typeof BundleSplitInputSchema>;

export interface Cluster {
  id: number;
  files: string[];
  sizeKb: number;
  interfaces: string[];
}

interface FileNode {
  path: string;
  sizeBytes: number;
  imports: string[];
  contractNames: string[];
  signatures: string[];
}

function parseImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:{[^}]+}\s+from\s+)?["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function parseContractNames(content: string): string[] {
  const names: string[] = [];
  const regex = /(?:contract|library|interface|abstract\s+contract)\s+(\w+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function parseSignatures(content: string): string[] {
  const sigs: string[] = [];
  const regex =
    /^\s*(function\s+\w+\s*\([^)]*\)[^{;]*[;{]|event\s+\w+\s*\([^)]*\)\s*;|error\s+\w+\s*\([^)]*\)\s*;|mapping\s*\([^)]+\)\s+\w+|(?:uint|int|address|bytes|bool|string)\S*\s+(?:public|internal|private|external)\s+\w+)/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    sigs.push(match[1].trim());
  }
  return sigs;
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
  allFiles: string[]
): string | null {
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const resolved = join(dirname(fromFile), importPath).replace(/\\/g, "/");
    const normalized = resolved.replace(/\.sol$/, "") + ".sol";
    return allFiles.find(
      (f) => f === normalized || f === resolved || f.endsWith(normalized)
    ) || null;
  }
  // Non-relative: try matching by filename
  const fileName = importPath.split("/").pop()!;
  return allFiles.find((f) => f.endsWith(fileName)) || null;
}

function buildClusters(
  nodes: Map<string, FileNode>,
  allFiles: string[],
  maxClusterBytes: number
): Cluster[] {
  // Build adjacency (bidirectional import edges)
  const adj = new Map<string, Set<string>>();
  for (const file of allFiles) {
    adj.set(file, new Set());
  }

  for (const [filePath, node] of nodes) {
    for (const imp of node.imports) {
      const resolved = resolveImportPath(imp, filePath, allFiles);
      if (resolved && resolved !== filePath) {
        adj.get(filePath)!.add(resolved);
        adj.get(resolved)!.add(filePath);
      }
    }
  }

  // Connected components via BFS
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const file of allFiles) {
    if (visited.has(file)) continue;
    const component: string[] = [];
    const queue = [file];
    visited.add(file);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  // Split oversized components by file size
  const clusters: Cluster[] = [];
  let clusterId = 0;

  for (const component of components) {
    // Sort by size descending for greedy bin packing
    const sorted = component.sort(
      (a, b) => (nodes.get(b)?.sizeBytes || 0) - (nodes.get(a)?.sizeBytes || 0)
    );

    let currentFiles: string[] = [];
    let currentSize = 0;

    for (const file of sorted) {
      const fileSize = nodes.get(file)?.sizeBytes || 0;
      if (currentSize + fileSize > maxClusterBytes && currentFiles.length > 0) {
        clusters.push({
          id: clusterId++,
          files: currentFiles,
          sizeKb: Math.round(currentSize / 1024),
          interfaces: [],
        });
        currentFiles = [];
        currentSize = 0;
      }
      currentFiles.push(file);
      currentSize += fileSize;
    }
    if (currentFiles.length > 0) {
      clusters.push({
        id: clusterId++,
        files: currentFiles,
        sizeKb: Math.round(currentSize / 1024),
        interfaces: [],
      });
    }
  }

  // Extract interfaces: for each cluster, collect signatures from other clusters that it imports
  for (const cluster of clusters) {
    const clusterFileSet = new Set(cluster.files);
    const externalSigs: string[] = [];

    for (const file of cluster.files) {
      const node = nodes.get(file);
      if (!node) continue;
      for (const imp of node.imports) {
        const resolved = resolveImportPath(imp, file, allFiles);
        if (resolved && !clusterFileSet.has(resolved)) {
          const externalNode = nodes.get(resolved);
          if (externalNode) {
            externalSigs.push(
              `// From ${resolved}`,
              ...externalNode.signatures
            );
          }
        }
      }
    }
    cluster.interfaces = [...new Set(externalSigs)];
  }

  return clusters;
}

export async function bundleSplit(input: BundleSplitInput): Promise<{
  clusters: Cluster[];
  totalFiles: number;
  totalClusters: number;
}> {
  const { targetDir, files, maxClusterKb } = input;
  const maxClusterBytes = maxClusterKb * 1024;
  const nodes = new Map<string, FileNode>();

  for (const file of files) {
    const fullPath = join(targetDir, file);
    try {
      const content = await readFile(fullPath, "utf-8");
      nodes.set(file, {
        path: file,
        sizeBytes: Buffer.byteLength(content),
        imports: parseImports(content),
        contractNames: parseContractNames(content),
        signatures: parseSignatures(content),
      });
    } catch {
      // Skip unreadable files
    }
  }

  const clusters = buildClusters(nodes, files, maxClusterBytes);

  return {
    clusters,
    totalFiles: files.length,
    totalClusters: clusters.length,
  };
}
