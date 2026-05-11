import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { HonoEnv } from "@/index";
import {
    fetchLawSearch,
    fetchLawService,
    normalizeParagraphs,
    type LawSummaryData,
} from "./law-api";

type ErrorContent = {
    type: "text";
    text: string;
};

function formatToolError(
    title: string,
    reason: string,
    hint?: string
): { content: ErrorContent[]; isError: true } {
    const lines = [title, "", `원인: ${reason}`];

    if (hint) {
        lines.push(`안내: ${hint}`);
    }

    return {
        content: [
            {
                type: "text",
                text: lines.join("\n"),
            },
        ],
        isError: true,
    };
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function normalizeSearchText(value?: string): string {
    if (!value) return "";

    return value
        .normalize("NFKC")
        .replace(/\s+/g, "")
        .replace(/[^\w\uAC00-\uD7A3]/g, "")
        .toLowerCase();
}

function bigramSimilarity(left: string, right: string): number {
    if (!left || !right) return 0;

    const buildBigrams = (text: string) => {
        const grams = new Set<string>();
        if (text.length < 2) {
            grams.add(text);
            return grams;
        }

        for (let index = 0; index < text.length - 1; index += 1) {
            grams.add(text.slice(index, index + 2));
        }

        return grams;
    };

    const leftBigrams = buildBigrams(left);
    const rightBigrams = buildBigrams(right);
    let intersectionSize = 0;

    for (const gram of leftBigrams) {
        if (rightBigrams.has(gram)) {
            intersectionSize += 1;
        }
    }

    return intersectionSize / Math.max(leftBigrams.size, rightBigrams.size, 1);
}

function rankSearchResults(
    query: string,
    laws: LawSummaryData[]
): LawSummaryData[] {
    const normalizedQuery = normalizeSearchText(query);
    const shortQuery = normalizedQuery.length <= 2;

    return laws
        .map((law, index) => {
            const normalizedName = normalizeSearchText(law.법령명한글);
            let score = 0;

            if (normalizedQuery && normalizedName === normalizedQuery) {
                score += 100000;
            }

            if (normalizedQuery && normalizedName.startsWith(normalizedQuery)) {
                score += shortQuery ? 80000 : 5000;
            }

            if (normalizedQuery && normalizedName.includes(normalizedQuery)) {
                score += 3000;
            }

            score += Math.round(
                bigramSimilarity(normalizedQuery, normalizedName) * 4000
            );
            score += Math.max(0, 50 - normalizedName.length);
            score += Math.max(0, 10 - index);

            return {
                law,
                score,
                index,
            };
        })
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return left.index - right.index;
        })
        .map(({ law }) => law);
}

let cachedApp: McpServer | undefined;
export function createApp(env: HonoEnv["Bindings"]) {
    if (cachedApp) return cachedApp;
    const app = new McpServer({
        name: "Law MCP Server",
        version: "1.0.0",
    });

    const SearchLawsInput = z.object({
        query: z
            .string()
            .describe(
                "검색할 법령 이름 또는 키워드. 예: '민법', '개인정보보호'"
            ),
    });

    const LawSummary = z.object({
        id: z
            .string()
            .describe(
                "법령일련번호(MST). list_articles / get_article 호출 시 사용"
            ),
        name: z.string().describe("법령명 한글"),
        type: z.string().describe("법령 종류. 예: '법률', '대통령령', '부령'"),
        ministry: z.string().describe("소관 부처명"),
        description: z
            .string()
            .optional()
            .describe(
                "제1조 목적 조문 전문. 제1조 제목이 '목적'인 경우에만 포함됨"
            ),
    });

    const SearchLawsOutput = z.object({
        results: z.array(LawSummary).describe("검색 결과 목록. 최대 10건"),
        total: z.number().describe("전체 검색 결과 수"),
    });

    app.registerTool(
        "search_laws",
        {
            inputSchema: SearchLawsInput,
            outputSchema: SearchLawsOutput,
            description: "법령 이름으로 검색. 법령명과 목적(제1조)만 반환.",
        },
        async (i) => {
            try {
                const apiKey = env.API_KEY;
                console.log(
                    "[search_laws] query:",
                    i.query,
                    "apiKey:",
                    apiKey ? "set" : "NOT SET"
                );
                const searchData = await fetchLawSearch(i.query, apiKey);
                console.log(
                    "[search_laws] searchData:",
                    JSON.stringify(searchData)
                        .replaceAll(env.API_KEY, "****apiKey****")
                        .slice(0, 500)
                );

                const total = Number(searchData.LawSearch.totalCnt);
                const laws = searchData.LawSearch.law || [];
                console.log(
                    "[search_laws] total:",
                    total,
                    "laws count:",
                    laws.length
                );

                const results = await Promise.all(
                    rankSearchResults(i.query, laws).map(async (law) => {
                        const mst = law.법령일련번호;
                        let description: string | undefined = undefined;

                        try {
                            const lawData = await fetchLawService(mst, apiKey);
                            const articles = lawData.법령.조문.조문단위;

                            const purposeArticle = articles.find(
                                (a) =>
                                    a.조문번호 === "1" && a.조문여부 === "조문"
                            );

                            if (
                                purposeArticle &&
                                purposeArticle.조문제목 === "목적"
                            ) {
                                description = purposeArticle.조문내용 || "";
                                const paragraphs = normalizeParagraphs(
                                    purposeArticle.항
                                );
                                if (paragraphs.length > 0) {
                                    const paraTexts = paragraphs.map(
                                        (p) => p.항내용
                                    );
                                    description = `${description}\n${paraTexts.join("\n")}`;
                                }
                            }
                        } catch (err) {
                            console.warn(
                                "[search_laws] description fetch skipped:",
                                mst,
                                errorMessage(err)
                            );
                        }

                        return {
                            id: mst,
                            name: law.법령명한글,
                            type: law.법령구분명,
                            ministry: law.소관부처명,
                            description,
                        };
                    })
                );

                return {
                    content: [],
                    isError: false,
                    structuredContent: {
                        results,
                        total,
                    } satisfies z.output<typeof SearchLawsOutput>,
                };
            } catch (err) {
                console.error("[search_laws] failed:", err);
                return formatToolError(
                    "법령 검색에 실패했습니다.",
                    errorMessage(err),
                    "잠시 후 다시 시도해 주세요."
                );
            }
        }
    );

    const ListArticlesInput = z.object({
        law_id: z
            .string()
            .describe("법령일련번호(MST). search_laws 결과의 id 필드"),
    });

    const ArticleSummary = z.object({
        article_no: z
            .string()
            .describe(
                "조문 번호. 가지조문 포함 시 '의'로 표기. 예: '1', '312의2'"
            ),
        title: z
            .string()
            .describe(
                "조문 제목. 예: '목적', '정의'. 제목 없는 조문은 빈 문자열"
            ),
        has_paragraphs: z
            .boolean()
            .describe("항(①②③...)이 1개 이상 존재하면 true"),
    });

    const ListArticlesOutput = z.object({
        law_name: z.string().describe("법령명 한글"),
        articles: z
            .array(ArticleSummary)
            .describe("조문 목록. 본문 텍스트는 포함하지 않음"),
    });

    app.registerTool(
        "list_articles",
        {
            inputSchema: ListArticlesInput,
            outputSchema: ListArticlesOutput,
            description: "특정 법령의 조문 목록을 반환. 조문번호와 제목만.",
        },
        async (i) => {
            try {
                const apiKey = env.API_KEY;
                const lawData = await fetchLawService(i.law_id, apiKey);

                const law_name =
                    lawData.법령.기본정보?.법령명_한글 || "법령명 알 수 없음";

                const articlesData = lawData.법령.조문.조문단위.filter(
                    (a) => a.조문여부 === "조문"
                );
                const articles = articlesData.map((a) => {
                    const article_no = a.조문가지번호
                        ? `${a.조문번호}의${a.조문가지번호}`
                        : a.조문번호;
                    const paragraphs = normalizeParagraphs(a.항);

                    return {
                        article_no,
                        title: a.조문제목 || "",
                        has_paragraphs: paragraphs.length > 0,
                    };
                });

                return {
                    content: [],
                    isError: false,
                    structuredContent: {
                        law_name,
                        articles,
                    } satisfies z.output<typeof ListArticlesOutput>,
                };
            } catch (err) {
                console.error("[list_articles] failed:", err);
                return formatToolError(
                    "조문 목록을 불러오지 못했습니다.",
                    errorMessage(err),
                    "법령 ID를 다시 확인해 주세요."
                );
            }
        }
    );

    const GetArticleInput = z.object({
        law_id: z
            .string()
            .describe("법령일련번호(MST). search_laws 결과의 id 필드"),
        article_no: z
            .string()
            .describe(
                "조문 번호. list_articles 결과의 article_no 필드. 예: '1', '312의2'"
            ),
        paragraph_no: z
            .string()
            .optional()
            .describe("항 번호. 예: '①', '②'. 생략하면 조문 전체 반환"),
    });

    const GetArticleOutput = z.object({
        law_name: z.string().describe("법령명 한글"),
        article_no: z.string().describe("조문 번호"),
        title: z.string().describe("조문 제목. 없으면 빈 문자열"),
        text: z
            .string()
            .describe("조문 본문 전체. paragraph_no 지정 시 해당 항 텍스트만"),
    });

    app.registerTool(
        "get_article",
        {
            inputSchema: GetArticleInput,
            outputSchema: GetArticleOutput,
            description: "특정 조문의 본문을 반환.",
        },
        async (i) => {
            try {
                const apiKey = env.API_KEY;
                const lawData = await fetchLawService(i.law_id, apiKey);
                const law_name =
                    lawData.법령.기본정보?.법령명_한글 || "법령명 알 수 없음";

                let no = i.article_no;
                let sub: string | undefined = undefined;
                if (no.includes("의")) {
                    const parts = no.split("의");
                    no = parts[0] || no;
                    sub = parts[1];
                }

                const articlesData = lawData.법령.조문.조문단위.filter(
                    (a) => a.조문여부 === "조문"
                );
                const article = articlesData.find(
                    (a) => a.조문번호 === no && a.조문가지번호 === sub
                );

                if (!article) {
                    return formatToolError(
                        "조문을 찾을 수 없습니다.",
                        `조문 ${i.article_no}에 해당하는 항목이 없습니다.`,
                        "조문번호와 가지조문(의) 표기를 다시 확인해 주세요."
                    );
                }

                let text = article.조문내용 || "";
                const paragraphs = normalizeParagraphs(article.항);

                if (i.paragraph_no) {
                    const para = paragraphs.find(
                        (p) => p.항번호 === i.paragraph_no
                    );
                    if (!para) {
                        return formatToolError(
                            "항을 찾을 수 없습니다.",
                            `조문 ${i.article_no}의 항 ${i.paragraph_no}에 해당하는 내용이 없습니다.`,
                            "항 번호(예: ①, ②)를 다시 확인해 주세요."
                        );
                    }
                    text = para.항내용;
                } else if (paragraphs.length > 0) {
                    const paraTexts = paragraphs.map((p) => p.항내용);
                    text = `${text}\n${paraTexts.join("\n")}`;
                }

                return {
                    content: [],
                    isError: false,
                    structuredContent: {
                        law_name,
                        article_no: i.article_no,
                        title: article.조문제목 || "",
                        text: text.trim(),
                    } satisfies z.output<typeof GetArticleOutput>,
                };
            } catch (err) {
                console.error("[get_article] failed:", err);
                return formatToolError(
                    "조문 본문을 불러오지 못했습니다.",
                    errorMessage(err),
                    "법령 ID와 조문 번호를 다시 확인해 주세요."
                );
            }
        }
    );

    cachedApp = app;
    return app;
}
