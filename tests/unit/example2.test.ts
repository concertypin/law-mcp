import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import app from "@/index";

describe("index.ts - app configuration", () => {
    const client = testClient(app);

    it.concurrent("should respond with CORS preflight", async () => {
        //@ts-expect-error For checking CORS middleware, which is not registered on type.
        // Type casting is just for autocompletion.
        const resp = await (client.index.$options as typeof client.index.$get)(
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
        expect(resp.status).toBe(204);
    });
});
