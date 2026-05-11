import {
    describe,
    expect,
    it,
    vi,
    beforeAll,
    beforeEach,
    afterAll,
    afterEach,
} from "vitest";
import {
    normalizeParagraphs,
    fetchLawSearch,
    fetchLawService,
} from "@/law-api";
import { createApp } from "@/route";
import type { MockedFunction } from "vitest";
import lawCasesRaw from "../fixtures/law-cases.md?raw";
const authKey = "test";

const app = createApp({
    AUTH_KEY: authKey,
});

// Mock globals safely
const mockCacheMatch =
    vi.fn<() => Promise<{ json: () => Promise<unknown> } | null>>();
const mockCachePut = vi.fn<() => Promise<void>>();
const mockCaches = {
    default: {
        match: mockCacheMatch,
        put: mockCachePut,
    },
};

const lawCases = lawCasesRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
const lawCaseIndexMap = new Map(
    lawCases.map((lawName, index) => [lawName, index])
);
const baseMstNumber = 1000;
const minimumLawFixtureCases = 30;

describe("Law API", () => {
    beforeEach(() => {
        global.fetch = vi.fn<typeof fetch>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (global as any).caches = mockCaches;
        mockCacheMatch.mockResolvedValue(null);
        mockCachePut.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizeParagraphs converts object to array", () => {
        const obj = { 항번호: "①", 항내용: "테스트" };
        expect(normalizeParagraphs(obj)).toEqual([obj]);
        expect(normalizeParagraphs([obj])).toEqual([obj]);
        expect(normalizeParagraphs(undefined)).toEqual([]);
    });

    it("fetchLawSearch fetches and parses data", async () => {
        const mockData = {
            LawSearch: {
                totalCnt: 1,
                law: [{ 법령일련번호: "123", 법령명한글: "민법" }],
            },
        };
        (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce({
            ok: true,
            json: async () => mockData,
        } as unknown as Response);

        const result = await fetchLawSearch("민법", "test");
        expect(result).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("lawSearch.do?OC=test")
        );
    });

    it("fetchLawSearch retries upstream failures up to three attempts", async () => {
        const mockData = {
            LawSearch: {
                totalCnt: 1,
                law: [{ 법령일련번호: "123", 법령명한글: "민법" }],
            },
        };

        (global.fetch as MockedFunction<typeof fetch>)
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: "Service Unavailable",
                text: async () => "upstream unavailable",
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: "Service Unavailable",
                text: async () => "upstream unavailable",
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => mockData,
            } as unknown as Response);

        const result = await fetchLawSearch("민법", "test");

        expect(result).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("fetchLawService uses cache if available", async () => {
        const mockData = { 법령: { 조문: { 조문단위: [] } } };
        mockCacheMatch.mockResolvedValueOnce({
            json: async () => mockData,
        });

        const result = await fetchLawService("123", "test");
        expect(result).toEqual(mockData);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe("MCP Tools", () => {
    beforeEach(() => {
        global.fetch = vi.fn<typeof fetch>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (global as any).caches = mockCaches;
        mockCacheMatch.mockResolvedValue(null);
        mockCachePut.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("search_laws tool works", async () => {
        const searchMockData = {
            LawSearch: {
                totalCnt: 1,
                law: [
                    {
                        법령일련번호: "123",
                        법령명한글: "민법",
                        법령구분명: "법률",
                        소관부처명: "법무부",
                    },
                ],
            },
        };
        const serviceMockData = {
            법령: {
                조문: {
                    조문단위: [
                        {
                            조문번호: "1",
                            조문여부: "조문",
                            조문제목: "목적",
                            조문내용: "이 법은...",
                            항: [],
                        },
                    ],
                },
            },
        };

        (global.fetch as MockedFunction<typeof fetch>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => searchMockData,
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => serviceMockData,
            } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["search_laws"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { query: "민법" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const content = result.structuredContent;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.total).toBe(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.results[0].description).toBe("이 법은...");
    });

    it("search_laws tool works with empty results", async () => {
        const searchMockData = { LawSearch: { totalCnt: 0, law: [] } };

        (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce({
            ok: true,
            json: async () => searchMockData,
        } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["search_laws"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { query: "없음" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const content = result.structuredContent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.total).toBe(0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.results.length).toBe(0);
    });

    it("search_laws ranks exact title matches first", async () => {
        const searchMockData = {
            LawSearch: {
                totalCnt: 3,
                law: [
                    {
                        법령일련번호: "123",
                        법령명한글:
                            "군에서의 형의 집행 및 군수용자의 처우에 관한 법률",
                        법령구분명: "법률",
                        소관부처명: "국방부",
                    },
                    {
                        법령일련번호: "124",
                        법령명한글: "형법",
                        법령구분명: "법률",
                        소관부처명: "법무부",
                    },
                    {
                        법령일련번호: "125",
                        법령명한글: "형사소송법",
                        법령구분명: "법률",
                        소관부처명: "법무부",
                    },
                ],
            },
        };
        const serviceMockData = {
            법령: {
                조문: {
                    조문단위: [
                        {
                            조문번호: "1",
                            조문여부: "조문",
                            조문제목: "목적",
                            조문내용: "이 법은...",
                            항: [],
                        },
                    ],
                },
            },
        };

        (global.fetch as MockedFunction<typeof fetch>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => searchMockData,
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => serviceMockData,
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => serviceMockData,
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => serviceMockData,
            } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["search_laws"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { query: "형법" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const content = result.structuredContent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.results[0].name).toBe("형법");
    });

    it("list_articles works correctly", async () => {
        const serviceMockData = {
            법령: {
                기본정보: { 법령명_한글: "민법" },
                조문: {
                    조문단위: [
                        {
                            조문번호: "1",
                            조문여부: "조문",
                            조문제목: "목적",
                            항: [],
                        },
                        {
                            조문번호: "2",
                            조문여부: "조문",
                            조문제목: "정의",
                            조문가지번호: "2",
                            항: [{ 항번호: "①", 항내용: "test" }],
                        },
                    ],
                },
            },
        };

        (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce({
            ok: true,
            json: async () => serviceMockData,
        } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["list_articles"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { law_id: "123" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const content = result.structuredContent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.law_name).toBe("민법");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.articles.length).toBe(2);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.articles[0].article_no).toBe("1");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.articles[0].has_paragraphs).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.articles[1].article_no).toBe("2의2");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.articles[1].has_paragraphs).toBe(true);
    });

    it("get_article works correctly", async () => {
        const serviceMockData = {
            법령: {
                기본정보: { 법령명_한글: "민법" },
                조문: {
                    조문단위: [
                        {
                            조문번호: "2",
                            조문여부: "조문",
                            조문제목: "정의",
                            조문가지번호: "2",
                            조문내용: "조문내용입니다",
                            항: [{ 항번호: "①", 항내용: "test" }],
                        },
                    ],
                },
            },
        };

        (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce({
            ok: true,
            json: async () => serviceMockData,
        } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["get_article"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { law_id: "123", article_no: "2의2" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const content = result.structuredContent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(content.text).toBe("조문내용입니다\ntest");
    });

    it("get_article returns a friendly error response when article is missing", async () => {
        const serviceMockData = {
            법령: {
                기본정보: { 법령명_한글: "민법" },
                조문: {
                    조문단위: [],
                },
            },
        };

        (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce({
            ok: true,
            json: async () => serviceMockData,
        } as unknown as Response);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const toolParams = (app as any)._registeredTools["get_article"];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const result = await toolParams.handler(
            { law_id: "123", article_no: "2의2" },
            { signals: [] }
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.isError).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.content[0]).toMatchObject({
            type: "text",
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            text: expect.stringContaining("조문을 찾을 수 없습니다."),
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.content[0]).toMatchObject({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            text: expect.stringContaining(
                "조문 2의2에 해당하는 항목이 없습니다."
            ),
        });
    });
});

describe("MCP Tools - expanded law fixtures", () => {
    let originalFetch: typeof fetch | undefined;
    let originalCaches: unknown;
    const globalWithCaches = global as unknown as { caches?: unknown };

    beforeAll(() => {
        originalFetch = global.fetch;
        originalCaches = globalWithCaches.caches;

        global.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
            const requestUrl =
                typeof input === "string"
                    ? input
                    : input instanceof URL
                      ? input.toString()
                      : input.url;
            const url = new URL(requestUrl);

            if (url.pathname.endsWith("/lawSearch.do")) {
                const query = url.searchParams.get("query") || "";
                const queryIndex = lawCaseIndexMap.get(query);
                if (queryIndex === undefined) {
                    throw new Error(
                        `Unknown law query in fixture test: ${query}`
                    );
                }
                const searchMockData = {
                    LawSearch: {
                        totalCnt: 1,
                        law: [
                            {
                                법령일련번호: String(
                                    baseMstNumber + queryIndex
                                ),
                                법령명한글: query,
                                법령구분명: "법률",
                                소관부처명: "법무부",
                            },
                        ],
                    },
                };
                return {
                    ok: true,
                    json: async () => searchMockData,
                } as unknown as Response;
            }

            if (url.pathname.endsWith("/lawService.do")) {
                const mst = Number(
                    url.searchParams.get("MST") || baseMstNumber
                );
                const lawName = lawCases[mst - baseMstNumber];
                if (!lawName) {
                    throw new Error(`Unknown MST in fixture test: ${mst}`);
                }
                const serviceMockData = {
                    법령: {
                        조문: {
                            조문단위: [
                                {
                                    조문번호: "1",
                                    조문여부: "조문",
                                    조문제목: "목적",
                                    조문내용: `${lawName} 목적입니다.`,
                                    항: [],
                                },
                            ],
                        },
                    },
                };
                return {
                    ok: true,
                    json: async () => serviceMockData,
                } as unknown as Response;
            }

            return { ok: false, statusText: "Not Found" } as Response;
        }) as MockedFunction<typeof fetch>;
        globalWithCaches.caches = mockCaches;
    });

    beforeEach(() => {
        (global.fetch as MockedFunction<typeof fetch>).mockClear();
        mockCacheMatch.mockResolvedValue(null);
        mockCachePut.mockResolvedValue(undefined);
    });

    afterAll(() => {
        if (!originalFetch) {
            throw new Error("original fetch is not initialized");
        }
        global.fetch = originalFetch;
        globalWithCaches.caches = originalCaches;
    });

    it("loads dozens of law names from markdown fixture", () => {
        expect(lawCases.length).toBeGreaterThanOrEqual(minimumLawFixtureCases);
        expect(new Set(lawCases).size).toBe(lawCases.length);
    });

    it.concurrent.each(lawCases.map((lawName, index) => ({ lawName, index })))(
        "search_laws handles law fixture case #$index: $lawName",
        async ({ lawName, index }) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
            const toolParams = (app as any)._registeredTools["search_laws"];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
            const result = await toolParams.handler(
                { query: lawName },
                { signals: [] }
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            expect(result.isError).toBe(false);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const content = result.structuredContent;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            expect(content.total).toBe(1);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            expect(content.results[0].id).toBe(String(baseMstNumber + index));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            expect(content.results[0].name).toBe(lawName);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            expect(content.results[0].description).toBe(
                `${lawName} 목적입니다.`
            );
        }
    );
});
