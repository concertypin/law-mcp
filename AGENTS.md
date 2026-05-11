# AGENTS.md

AI agent 작업용 가이드.

## Project Type

**법령 검색 MCP 서버** — law.go.kr API + Cloudflare Workers.

## Commands

```bash
pnpm dev      # wrangler dev (로컬 Workers)
pnpm build    # production 빌드
pnpm deploy   # Cloudflare 배포 (wrangler)
pnpm lint     # oxlint
pnpm test     # Vitest
```

## Architecture

```
src/
  law-api.ts    # lawSearch.do / lawService.do 호출 + caching
  route.ts      # MCP tools — search_laws, list_articles, get_article
  index.ts      # Hono 서버 — globalThis.API_KEY 설정
tests/
  unit/
    law.test.ts # API mock + Zod schema 테스트
```

**Entry**: `src/index.ts` → Hono app → `/mcp` endpoint

## MCP Tools

| Tool            | Input                                   | Output                                |
| --------------- | --------------------------------------- | ------------------------------------- |
| `search_laws`   | `query`                                 | id, name, type, ministry, description |
| `list_articles` | `law_id`                                | article_no, title, has_paragraphs     |
| `get_article`   | `law_id`, `article_no`, `paragraph_no?` | law_name, title, text                 |

## Key Details

- API: `https://www.law.go.kr/DRF/lawSearch.do`, `/lawService.do`
- OC 값: `API_KEY` 환경변수 — `wrangler.jsonc` binding
- `항` 필드 normalize: `object | object[]` → 항상 `[]`
- `조문가지번호`: `"312의2"` → `조문번호: "312"`, `조문가지번호: "2"`
- Cache API: `caches.default` — TTL 24h

## Zod Schemas

`src/route.ts`에 정의 — input/output 모두 `.parse()` 통과.

```ts
(SearchLawsInput, SearchLawsOutput);
(ListArticlesInput, ListArticlesOutput);
(GetArticleInput, GetArticleOutput);
```

## Testing

`tests/unit/law.test.ts`:

- fetchLawSearch, fetchLawService mock
- 항 normalize edge case
- schema validation

## Dependencies

- Hono — HTTP transport
- Zod — schema validation
- MCP SDK — tool 등록
- Wrangler — Cloudflare Workers
- pnpm

## Notes

- 전체 법령 fetch 후 조문 하나만 사용 — 캐싱으로 비용 감소
- `lawService.do` 응답 큼 (민법 1337 조문) — Cache 필수
- 스펙 전체는 `law_mcp_spec.md` 참조
