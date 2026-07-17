# 요약봇

유튜브 채널 정보를 관리하고, 영상 URL을 구조적으로 요약한 뒤 **사건 / 원인 / 해결책&훈육**으로 분리 정리하는 웹앱입니다.

## 기능

1. **채널 관리** — 채널 추가, 구독자·조회수·영상 수, 소개, 연도별 업로드 수, 최신 영상
2. **영상 요약** — 유튜브 URL 입력 → 자막 기반 구조화 요약
3. **분리 정리** — 요약 후 사건 / 원인 / 해결책&훈육 버튼으로 관점별 재정리

## 로컬 실행

```bash
cp .env.example .env.local
# .env.local에 YOUTUBE_API_KEY, OPENAI_API_KEY 입력

npm install
npm run dev
```

http://localhost:3000 에서 확인합니다.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | 기본값 `gpt-4o-mini` |

## Vercel 배포

1. GitHub에 푸시
2. [Vercel](https://vercel.com)에서 Import
3. Environment Variables에 위 키 등록
4. Deploy

## 참고

- 채널 목록은 브라우저 `localStorage`에 저장됩니다.
- 요약은 영상의 자막(캡션)이 있어야 동작합니다.
