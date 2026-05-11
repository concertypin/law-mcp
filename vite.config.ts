/// <reference types="vitest/config" />
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { cloudflare } from "@cloudflare/vite-plugin";
import { type UserConfig, createLogger, defineConfig } from "vite";
import { fileURLToPath } from "node:url";

type Config = Required<UserConfig>;

const resolve: Config["resolve"] = {
    alias: {
        "@": fileURLToPath(new URL("src", import.meta.url)),
    },
    external: [],
};

const custonLogger = createLogger();
const warn = custonLogger.warn.bind(custonLogger);
const logger = ((msg, options) => {
    if (
        msg.includes("Sourcemap for") &&
        msg.includes("points to missing source")
    )
        return;
    const ptn =
        /Adding `(?:[a-zA-Z0-9_])` compatiblity flag during tests as this feature is needed to support the Vitest runner\./;
    if (ptn.test(msg)) return;
    warn(msg, options);
}) satisfies typeof custonLogger.warn;

custonLogger.warn = logger;
custonLogger.info = logger;
custonLogger.error = logger;

const testConfig: Config["test"] = {
    coverage: {
        enabled: true,
        include: ["src/**/*.ts"],
        provider: "istanbul",
        reportOnFailure: true,
        reporter: ["text", "json-summary", "html"],
    },
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: "./tests/setup.ts",

    silent: "passed-only",
};
const isVitest = typeof process.env.VITEST !== "undefined";
export default defineConfig(() => {
    const cloudflarePlugin = isVitest
        ? cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
          })
        : cloudflare();
    return {
        plugins: [cloudflarePlugin],
        build: {
            lib: {
                entry: fileURLToPath(new URL("src/index.ts", import.meta.url)),
                formats: ["es"],
                fileName: "index",
            },
            outDir: "dist",
            sourcemap: true,
        },

        clearScreen: false,
        resolve,
        customLogger: custonLogger,
        test: testConfig,
    } satisfies UserConfig;
});
