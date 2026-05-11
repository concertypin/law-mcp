# Law MCP Server

한국 법령 검색 MCP 서버. law.go.kr API 사용.

Cloudflare Workers에서는 law.go.kr HTTPS upstream에서 525가 발생할 수 있어 DRF 호출은 HTTPS를 먼저 시도하고 retryable failure면 HTTP endpoint로 fallback한다.

## MCP Tools

| Tool            | 설명                                         |
| --------------- | -------------------------------------------- |
| `search_laws`   | 법령 이름 검색 — 결과 10건, 제1조(목적) 포함 |
| `list_articles` | 특정 법령의 조문 목록 — 번호/제목만          |
| `get_article`   | 특정 조문 본문 — 항(①②③) 지정 가능           |

## 사용 예시

```
search_laws("민법") → id, name, type, ministry, description
list_articles(id) → article_no, title, has_paragraphs
get_article(id, "1") → 제1조 전체 텍스트
get_article(id, "312", "①") → 제312조 제1항만
```

## 구조

```
src/
  law-api.ts    # lawSearch.do / lawService.do API + Cloudflare caching
  route.ts      # MCP tool 정의 (Zod schema)
  index.ts      # Hono 서버
```

## 환경변수

- `API_KEY` — law.go.kr OC 값 (open.law.go.kr에서 발급)

## 실행

```bash
pnpm install
pnpm dev
```

MCP endpoint: `/mcp`

## API 특이사항

- `항` 필드가 object 또는 object[]로 불규칙 → 배열로 normalize
- `조문가지번호` — "312조의2" → `조문번호: "312"`, `조문가지번호: "2"`
- 전체 법령 fetch 후 조문 하나만 사용 — Cache API로 반복 비용 감소

## 스펙 문서

`law_mcp_spec.md`에 전체 명세 있음.

## License

Apache-2.0
