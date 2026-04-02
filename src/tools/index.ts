import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bundleBuild, BundleBuildInputSchema } from "./bundle-builder.js";
import { bundleSplit, BundleSplitInputSchema } from "./bundle-splitter.js";
import {
  detectProtocol,
  ProtocolDetectInputSchema,
} from "./protocol-detector.js";
import {
  buildAuditPrompt,
  BuildAuditPromptInputSchema,
} from "./prompt-builder.js";
import {
  checklistScan,
  ChecklistScanInputSchema,
} from "./checklist-scanner.js";
import {
  bundleCompress,
  BundleCompressInputSchema,
} from "./bundle-compressor.js";

const server = new McpServer({
  name: "BugChainAudit",
  version: "0.1.0",
});

server.tool(
  "bundle_build",
  "Collect .sol files, build audit bundle, detect protocol type and strategy",
  BundleBuildInputSchema.shape,
  async (input) => {
    const result = await bundleBuild(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "bundle_split",
  "Split large bundles into clusters via import graph analysis (each <200KB)",
  BundleSplitInputSchema.shape,
  async (input) => {
    const result = await bundleSplit(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "detect_protocol",
  "Detect protocol type and match relevant checklists/docs with injection calibration",
  ProtocolDetectInputSchema.shape,
  async (input) => {
    const result = await detectProtocol(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "build_audit_prompt",
  "Build complete audit prompt with bundle + checklists + protocol docs pre-injected. Returns ready-to-use prompt.",
  BuildAuditPromptInputSchema.shape,
  async (input) => {
    const result = await buildAuditPrompt(input);
    if ("error" in result) {
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    // Return metadata separately, prompt is the main content
    return {
      content: [
        { type: "text", text: JSON.stringify(result.metadata, null, 2) },
        { type: "text", text: result.prompt },
      ],
    };
  }
);

server.tool(
  "checklist_scan",
  "Scan bundle code for checklist patterns — returns matched code snippets for each checklist item",
  ChecklistScanInputSchema.shape,
  async (input) => {
    const result = await checklistScan(input);
    return {
      content: [{ type: "text", text: JSON.stringify({
        totalItems: result.totalItems,
        matchedItems: result.matchedItems,
        scanOutputSizeKb: result.scanOutputSizeKb,
      }, null, 2) },
      { type: "text", text: result.scanOutput }],
    };
  }
);

server.tool(
  "bundle_compress",
  "Compress bundle by removing comments, unreferenced view functions, and interfaces. Reduces 300KB+ bundles by 20-40%.",
  BundleCompressInputSchema.shape,
  async (input) => {
    const result = await bundleCompress(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
