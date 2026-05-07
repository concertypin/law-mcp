import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import app from "@/index";

describe("index.ts - app configuration", () => {
    const client = testClient(app);

    it.concurrent(
        "should respond with CORS headers on safe methods",
        async () => {
            const resp = await client.index.$get(
                {},
                {
                    headers: {
                        Origin: "http://example.com",
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers":
                            "Content-Type, Authorization",
                    },
                }
            );
            expect(resp.status).toBe(200);
            expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(
                "http://example.com"
            );
        }
    );
    it.concurrent(
        "should not respond as CORS on requests without Origin header",
        async () => {
            const resp = await client.index.$get({});
            expect(resp.status).toBe(200);
            expect(resp.headers.get("Access-Control-Allow-Origin")).toBeNull();
        }
    );
});
