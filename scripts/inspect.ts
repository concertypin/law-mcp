import { spawn } from "node:child_process";

const WELL_KNOWN_ENDPOINTS = {
    remote: "https://law-mcp.condev.workers.dev/mcp",
    local: "http://localhost:5173/mcp",
} as const;

if (process.argv.length !== 3) {
    console.log("Usage: ");
    console.log("  node inspect.ts <endpoint>");
    console.log("  pnpm [run] inspect <endpoint>");
    console.log("known endpoint alias:");
    for (const alias in WELL_KNOWN_ENDPOINTS) {
        console.log(
            `  ${alias} -> ${WELL_KNOWN_ENDPOINTS[alias as keyof typeof WELL_KNOWN_ENDPOINTS]}`
        );
    }
    process.exit(1);
}
const input = process.argv[2] as string;

const endpoint =
    WELL_KNOWN_ENDPOINTS[input as keyof typeof WELL_KNOWN_ENDPOINTS] ??
    (URL.canParse(input) ? input : null);

if (!endpoint) {
    console.error(`❌ Invalid endpoint or unknown alias: "${input}"`);
    process.exit(1);
}

// 3. 인스펙터 실행 인자
const args = [
    "dlx",
    "@modelcontextprotocol/inspector",
    "--cli",
    endpoint,
    "--transport",
    "http",
    "--method",
    "tools/call",
    "--tool-name",
    "search_laws",
    "--tool-arg",
    "query=형법",
];

console.log(`🚀 Launching MCP Inspector for: ${endpoint}`);

const child = spawn("pnpm", args, {
    stdio: "inherit",
});

child.on("error", (err) => {
    console.error("Failed to start inspector:", err);
    process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
