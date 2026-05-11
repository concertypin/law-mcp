import { createApp } from "@/route";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

/**
 * @fileoverview
 * This is the main entry point of the Hono application. It sets up the routing and middleware for the application.
 * Don't make this file too large. If you need to add more routes, create separate route files and import them here.
 */
export type HonoEnv = {
    Bindings: CloudflareBindings & { AUTH_KEY: string };
};
const transport = new StreamableHTTPTransport();
const app = new Hono<HonoEnv>()
    .use("*", async (c, next) => {
        // CORS allow all
        const requestedOrigin = c.req.header("Origin");
        if (requestedOrigin) {
            c.header("Access-Control-Allow-Origin", requestedOrigin);
        }
        c.header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, PATCH"
        );
        const requestedHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestedHeaders) {
            c.header("Access-Control-Allow-Headers", requestedHeaders);
            c.header("Access-Control-Expose-Headers", requestedHeaders);
        }
        if (c.req.method === "OPTIONS") {
            c.status(204);
            return c.newResponse(null);
        }
        return next();
    })
    .all("/mcp", async (c) => {
        const userKey = c.req.header("X-Upstream-Key");
        if (c.env.AUTH_KEY === undefined && userKey === undefined) {
            return c.text(
                "Server misconfiguration: AUTH_KEY is not set. For testing, you can set X-Upstream-Key header to call upstream API.",
                500
            );
        }
        const mcpServer = createApp({
            ...c.env,
            AUTH_KEY: userKey ?? c.env.AUTH_KEY,
        });
        if (!mcpServer.isConnected()) {
            // Connect the mcp with the transport
            await mcpServer.connect(transport);
        }
        return transport.handleRequest(c);
    })
    .get("/", (c) => {
        return c.text("Hello, World! This is MCP server.");
    });
export default app;
