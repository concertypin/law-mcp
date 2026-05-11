export interface LawSummaryData {
    법령일련번호: string;
    법령명한글: string;
    법령구분명: string;
    소관부처명: string;
}

export interface LawSearchResponse {
    LawSearch: {
        law: LawSummaryData[];
        totalCnt: number;
    };
}

export interface LawServiceResponse {
    법령: {
        기본정보?: {
            법령명_한글?: string;
        };
        조문: {
            조문단위: ArticleData[];
        };
    };
}

export interface ParagraphData {
    항번호: string;
    항내용: string;
}

export interface ArticleData {
    조문번호: string;
    조문가지번호?: string;
    조문여부: string;
    조문제목?: string;
    조문내용?: string;
    항?: ParagraphData | ParagraphData[];
}

const UPSTREAM_RETRY_LIMIT = 3;

class UpstreamError extends Error {
    retryable: boolean;

    constructor(message: string, retryable: boolean) {
        super(message);
        this.retryable = retryable;
    }
}

function formatHttpError(label: string, res: Response, body: string): string {
    const statusText = res.statusText ? ` ${res.statusText}` : "";
    const bodyText = body.trim().slice(0, 300);

    return [
        `${label} 실패 (${res.status}${statusText})`,
        bodyText ? bodyText : undefined,
    ]
        .filter(Boolean)
        .join(": ");
}

function shouldRetryHttpStatus(status: number): boolean {
    return status >= 500;
}

async function fetchJsonWithRetry<T>(label: string, url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= UPSTREAM_RETRY_LIMIT; attempt += 1) {
        try {
            const res = await fetch(url);
            console.log(
                `[${label}] status:`,
                res.status,
                res.statusText,
                "ok:",
                res.ok
            );

            if (!res.ok) {
                const text = await res.text();
                console.log(`[${label}] error response:`, text.slice(0, 500));
                const error = new UpstreamError(
                    formatHttpError(label, res, text),
                    shouldRetryHttpStatus(res.status)
                );

                if (error.retryable && attempt < UPSTREAM_RETRY_LIMIT) {
                    lastError = error;
                    continue;
                }

                throw error;
            }

            const data = await res.json();
            console.log(
                `[${label}] response keys:`,
                Object.keys(data as Record<string, unknown>)
            );
            return data as T;
        } catch (err) {
            lastError = err;
            if (err instanceof UpstreamError && !err.retryable) {
                throw err;
            }

            if (attempt < UPSTREAM_RETRY_LIMIT) {
                console.warn(
                    `[${label}] retry ${attempt}/${UPSTREAM_RETRY_LIMIT} after error:`,
                    err
                );
                continue;
            }
            throw err;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error(`${label} 요청에 실패했습니다.`);
}

export async function fetchLawSearch(
    query: string,
    apiKey: string
): Promise<LawSearchResponse> {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${apiKey}&target=law&type=JSON&query=${encodeURIComponent(query)}&display=10`;
    console.log("[fetchLawSearch] URL:", url.replace(apiKey, "****apiKey****"));
    return fetchJsonWithRetry<LawSearchResponse>("fetchLawSearch", url);
}

export async function fetchLawService(
    mst: string,
    apiKey: string
): Promise<LawServiceResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const cache = (caches as any).default as Cache;
    const cacheKey = new Request(`https://law-cache/${mst}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
        console.log("[fetchLawService] cached for mst:", mst);
        return cached.json();
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${apiKey}&target=law&type=JSON&MST=${mst}`;
    console.log(
        "[fetchLawService] URL:",
        url.replace(apiKey, "****apiKey****")
    );
    const data = await fetchJsonWithRetry<LawServiceResponse>(
        "fetchLawService",
        url
    );

    const responseToCache = new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=86400",
        },
    });
    cache.put(cacheKey, responseToCache).catch((err: unknown) => {
        console.error("Cache put error:", err);
    });

    return data;
}

export function normalizeParagraphs(
    paragraphs?: ParagraphData | ParagraphData[]
): ParagraphData[] {
    if (!paragraphs) return [];
    if (Array.isArray(paragraphs)) return paragraphs;
    return [paragraphs];
}
