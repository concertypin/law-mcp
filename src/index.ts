import { app as mcpServer } from "@/route";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

/**
 * @fileoverview
 * This is the main entry point of the Hono application. It sets up the routing and middleware for the application.
 * Don't make this file too large. If you need to add more routes, create separate route files and import them here.
 */

const transport = new StreamableHTTPTransport();
const app = new Hono<{ Bindings: CloudflareBindings }>()
    .use("*", async (c, next) => {
        // Expose AUTH_KEY globally for tools to use
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (globalThis as any).AUTH_KEY = c.env?.AUTH_KEY || "test";
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
