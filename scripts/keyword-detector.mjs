#!/usr/bin/env node

// Detects audit-related keywords in user prompts and suggests skills.
// Reads user input from stdin (Claude Code hook protocol).

import { readFileSync } from "node:fs";

const input = readFileSync("/dev/stdin", "utf-8").trim();

let parsed;
try {
  parsed = JSON.parse(input);
} catch {
  process.exit(0);
}

const prompt = (parsed.prompt || parsed.message || "").toLowerCase();
if (!prompt) process.exit(0);

const TRIGGERS = [
  {
    keywords: ["audit", "audit", "security audit", "vulnerability analysis", "vulnerability"],
    skill: "claude-audit:audit",
    description: "Full multi-agent smart contract audit",
  },
  {
    keywords: ["quick audit", "quick audit", "quick look", "quick scan"],
    skill: "claude-audit:audit-quick",
    description: "Quick single-pass audit",
  },
  {
    keywords: ["validate finding", "validate", "verify finding", "false positive"],
    skill: "claude-audit:validate",
    description: "Validate findings against source code",
  },
];

// Check specific triggers first (longer matches take priority)
const sortedTriggers = TRIGGERS.sort(
  (a, b) =>
    Math.max(...b.keywords.map((k) => k.length)) -
    Math.max(...a.keywords.map((k) => k.length))
);

for (const trigger of sortedTriggers) {
  if (trigger.keywords.some((kw) => prompt.includes(kw))) {
    // Check if it's a .sol context
    const hasSolContext =
      prompt.includes(".sol") ||
      prompt.includes("contract") ||
      prompt.includes("solidity") ||
      prompt.includes("smart contract") ||
      prompt.includes("smart contract");

    if (hasSolContext || trigger.keywords.some((kw) => kw.length > 5 && prompt.includes(kw))) {
      console.log(
        JSON.stringify({
          result: "suggest",
          message: `[SKILL SUGGESTION: /${trigger.skill}] ${trigger.description}`,
        })
      );
      process.exit(0);
    }
  }
}

process.exit(0);
