# 법령 검색 MCP 서버 스펙

## 개요

법제처 국가법령정보 공동활용 API를 백엔드로 사용하는 MCP 서버.

- **템플릿**: `git clone https://github.com/templecon/template-mcp-ts`
- **런타임**: Cloudflare Workers
- **환경변수**: `API_KEY` — open.law.go.kr OC 값

---

## 업스트림 API

```
Base URL: https://www.law.go.kr/DRF
검색: GET /lawSearch.do?OC={API_KEY}&target=law&type=JSON&query={encoded}&display={n}&page={n}
본문: GET /lawService.do?OC={API_KEY}&target=law&type=JSON&MST={법령일련번호}
```

**주의사항**

- `query`는 반드시 `encodeURIComponent()` 적용
- 본문 응답은 법령 전체를 한 번에 내려줌 (민법 기준 조문 1337개)
- `항` 필드는 조문에 따라 `object` 또는 `object[]`로 타입이 불규칙함 → 항상 배열로 normalize 필요
- `조문가지번호` 필드: `312조의2`는 `조문번호: "312"`, `조문가지번호: "2"` 로 분리돼 있음

---

## MCP 툴 명세

### 1. `search_laws`

법령 이름으로 검색. 법령명과 목적(제1조)만 반환.

**Input**

```ts
{
    query: string; // 검색어 (예: "민법", "개인정보")
}
```

**Output**

```ts
{
    results: Array<{
        id: string; // 법령일련번호 (MST) — 다른 툴 호출에 사용
        name: string; // 법령명한글
        type: string; // 법령구분명 (법률 / 대통령령 / 부령 등)
        ministry: string; // 소관부처명
        description?: string; // 제1조 텍스트. 제목이 "목적"인 경우에만 포함, 아니면 필드 없음
    }>;
    total: number;
}
```

**구현 흐름**

1. `lawSearch.do` 호출 (display=10)
2. 결과 법령마다 `lawService.do` 병렬 호출하여 조문 fetch
3. 조문단위 중 `조문번호 === "1"` && `조문여부 === "조문"` 인 것 탐색
4. 해당 조문의 `조문제목 === "목적"` 일 때만 `description` 포함. 아니면 필드 자체를 생략
5. 포함 시: `조문내용 + 항내용들` 을 줄바꿈으로 합쳐서 `description`으로

> 검색 결과가 많을 수 있으니 display는 10으로 제한. 병렬 fetch에 `Promise.all` 사용.

---

### 2. `list_articles`

특정 법령의 조문 목록을 반환. 조문번호와 제목만.

**Input**

```ts
{
    law_id: string; // search_laws에서 받은 id (법령일련번호)
}
```

**Output**

```ts
{
    law_name: string;
    articles: Array<{
        article_no: string; // "1", "2", "312의2" (가지번호 있으면 합성)
        title: string; // 조문제목 (없으면 빈 문자열)
        has_paragraphs: boolean; // 항이 1개 이상인지
    }>;
}
```

**구현 흐름**

1. `lawService.do` 호출
2. `조문단위` 배열 중 `조문여부 === "조문"`만 필터
3. `조문번호` + `조문가지번호` 합성: 가지번호 있으면 `"${조문번호}의${조문가지번호}"`, 없으면 `조문번호` 그대로
4. 본문 텍스트는 포함하지 않음

---

### 3. `get_article`

특정 조문의 본문을 반환.

**Input**

```ts
{
  law_id: string       // 법령일련번호
  article_no: string   // "1", "312의2" 등 list_articles에서 받은 article_no
  paragraph_no?: string  // 항번호 ("①", "②" 등). 생략하면 조문 전체
}
```

**Output**

```ts
{
    law_name: string;
    article_no: string;
    title: string;
    text: string; // 요청한 조문(+항) 전체 텍스트. 항 지정 시 해당 항만.
}
```

**구현 흐름**

1. `lawService.do` 호출 (전체 법령 fetch)
2. `article_no` 파싱: `"312의2"` → `{ no: "312", sub: "2" }`, `"1"` → `{ no: "1", sub: undefined }`
3. 해당 조문 탐색: `조문번호 === no && 조문가지번호 === sub` (sub 없으면 가지번호 없는 것)
4. `paragraph_no` 지정 시: `항` 배열에서 `항번호 === paragraph_no`인 것만
5. 없는 조문/항 번호면 명확한 에러 메시지

---

## Structured Input/Output

모든 툴의 입력과 출력은 Zod 스키마로 정의. MCP SDK의 tool 등록 시 inputSchema에 `.toJsonSchema()` 결과 사용. 런타임에 output도 `.parse()` 통과시켜 타입 보장.

모든 필드에 `.describe()` 필수.

```ts
// search_laws
const SearchLawsInput = z.object({
    query: z
        .string()
        .describe("검색할 법령 이름 또는 키워드. 예: '민법', '개인정보보호'"),
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

// list_articles
const ListArticlesInput = z.object({
    law_id: z
        .string()
        .describe("법령일련번호(MST). search_laws 결과의 id 필드"),
});

const ArticleSummary = z.object({
    article_no: z
        .string()
        .describe("조문 번호. 가지조문 포함 시 '의'로 표기. 예: '1', '312의2'"),
    title: z
        .string()
        .describe("조문 제목. 예: '목적', '정의'. 제목 없는 조문은 빈 문자열"),
    has_paragraphs: z.boolean().describe("항(①②③...)이 1개 이상 존재하면 true"),
});

const ListArticlesOutput = z.object({
    law_name: z.string().describe("법령명 한글"),
    articles: z
        .array(ArticleSummary)
        .describe("조문 목록. 본문 텍스트는 포함하지 않음"),
});

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
```

---

## 캐싱

법령 본문은 자주 바뀌지 않음. `lawService.do` 응답은 **Cloudflare Cache API**로 캐싱.
TTL: 24시간 (`Cache-Control: max-age=86400`)

```ts
const cache = caches.default;
const cacheKey = new Request(`https://law-cache/${mst}`);
const cached = await cache.match(cacheKey);
if (cached) return cached.json();

const data = await fetchFromApi(mst);
const res = new Response(JSON.stringify(data), {
    headers: { "Cache-Control": "max-age=86400" },
});
await cache.put(cacheKey, res);
return data;
```

---

## 응답 크기 주의

`lawService.do` 전체 응답이 큰 법령은 수백KB. `get_article`에서 조문 하나만 쓰더라도 전체를 fetch해야 함. 캐싱으로 반복 비용 줄일 것.
