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

export async function fetchLawSearch(
    query: string,
    authKey: string
): Promise<LawSearchResponse> {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${authKey}&target=law&type=JSON&query=${encodeURIComponent(query)}&display=10`;
    console.log("[fetchLawSearch] URL:", url);
    const res = await fetch(url);
    console.log(
        "[fetchLawSearch] status:",
        res.status,
        res.statusText,
        "ok:",
        res.ok
    );
    if (!res.ok) {
        const text = await res.text();
        console.log("[fetchLawSearch] error response:", text.slice(0, 500));
        throw new Error(
            `Failed to fetch law search: ${res.statusText || res.status}`
        );
    }
    const data = await res.json();
    console.log(
        "[fetchLawSearch] response keys:",
        Object.keys(data as Record<string, unknown>)
    );
    return data as LawSearchResponse;
}

export async function fetchLawService(
    mst: string,
    authKey: string
): Promise<LawServiceResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const cache = (caches as any).default as Cache;
    const cacheKey = new Request(`https://law-cache/${mst}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
        console.log("[fetchLawService] cached for mst:", mst);
        return cached.json();
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${authKey}&target=law&type=JSON&MST=${mst}`;
    console.log("[fetchLawService] URL:", url);
    const res = await fetch(url);
    console.log(
        "[fetchLawService] status:",
        res.status,
        res.statusText,
        "ok:",
        res.ok
    );
    if (!res.ok) {
        const text = await res.text();
        console.log("[fetchLawService] error response:", text.slice(0, 500));
        throw new Error(
            `Failed to fetch law service: ${res.statusText || res.status}`
        );
    }
    const data = await res.json();
    console.log(
        "[fetchLawService] response keys:",
        Object.keys(data as Record<string, unknown>)
    );

    // Store in cache
    const responseToCache = new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=86400",
        },
    });
    // Fire and forget caching
    cache.put(cacheKey, responseToCache).catch((err: unknown) => {
        console.error("Cache put error:", err);
    });

    return data as LawServiceResponse;
}

export function normalizeParagraphs(
    paragraphs?: ParagraphData | ParagraphData[]
): ParagraphData[] {
    if (!paragraphs) return [];
    if (Array.isArray(paragraphs)) return paragraphs;
    return [paragraphs];
}
