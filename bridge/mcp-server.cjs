#!/usr/bin/env node
"use strict";

// CJS bridge for the MCP server
// Resolves ESM dist/tools/index.js from the plugin root

const { resolve } = require("path");
const pluginRoot = resolve(__dirname, "..");

async function main() {
  await import(resolve(pluginRoot, "dist", "tools", "index.js"));
}

main().catch((err) => {
  console.error("claude-audit MCP server failed to start:", err);
  process.exit(1);
});
