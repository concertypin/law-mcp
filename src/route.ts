import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
    fetchLawSearch,
    fetchLawService,
    normalizeParagraphs,
} from "./law-api";
import type { HonoEnv } from "@/index";

let cachedApp: McpServer | undefined;
export function createApp(env: HonoEnv["Bindings"]) {
    if (cachedApp) return cachedApp;
    const app = new McpServer({
        name: "Law MCP Server",
        version: "1.0.0",
    });

    // search_laws
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
            const authKey = env.AUTH_KEY;
            console.log(
                "[search_laws] query:",
                i.query,
                "authKey:",
                authKey ? "set" : "NOT SET"
            );
            const searchData = await fetchLawSearch(i.query, authKey);
            console.log(
                "[search_laws] searchData:",
                JSON.stringify(searchData).slice(0, 500)
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
                laws.map(async (law) => {
                    const mst = law.법령일련번호;
                    let description: string | undefined = undefined;

                    try {
                        const lawData = await fetchLawService(mst, authKey);
                        const articles = lawData.법령.조문.조문단위;

                        const purposeArticle = articles.find(
                            (a) => a.조문번호 === "1" && a.조문여부 === "조문"
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
                        // Ignore service fetch errors for description
                        console.error(err);
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
        }
    );

    // list_articles
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
            const authKey = env.AUTH_KEY;
            const lawData = await fetchLawService(i.law_id, authKey);

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
        }
    );

    // get_article
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
            const authKey = env.AUTH_KEY;
            const lawData = await fetchLawService(i.law_id, authKey);
            const law_name =
                lawData.법령.기본정보?.법령명_한글 || "법령명 알 수 없음";

            // Parse article_no
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
                return {
                    content: [
                        {
                            type: "text",
                            text: `에러: 조문 ${i.article_no}를 찾을 수 없습니다.`,
                        },
                    ],
                    isError: true,
                };
            }

            let text = article.조문내용 || "";
            const paragraphs = normalizeParagraphs(article.항);

            if (i.paragraph_no) {
                const para = paragraphs.find(
                    (p) => p.항번호 === i.paragraph_no
                );
                if (!para) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `에러: 조문 ${i.article_no}의 항 ${i.paragraph_no}를 찾을 수 없습니다.`,
                            },
                        ],
                        isError: true,
                    };
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
        }
    );
    cachedApp = app;
    return app;
}
