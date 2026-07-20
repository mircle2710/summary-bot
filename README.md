# 요약봇

유튜브 채널 정보를 관리하고, 영상 URL을 구조적으로 요약한 뒤 **사건 / 원인 / 해결책&훈육**으로 분리 정리하는 웹앱입니다.

요약 AI는 **Google Cloud Vertex AI**를 사용합니다. (AI Studio 선불이 아닌 Cloud 체험 크레딧 사용 가능)

## 기능

1. **채널 관리** — 채널 추가, 구독자·조회수·영상 수, 소개, 연도별 업로드 수, 최신 영상
2. **영상 요약** — 유튜브 URL 입력 → 자막 기반 구조화 요약 (없으면 제목·설명)
3. **분리 정리** — 요약 후 사건 / 원인 / 해결책&훈육 버튼으로 관점별 재정리

## Vertex AI 준비 (46만 원 크레딧용)

1. [Vertex AI API 사용 설정](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
2. [서비스 계정 만들기](https://console.cloud.google.com/iam-admin/serviceaccounts) → 역할 **Vertex AI User**
3. 키 → JSON 추가 → 다운로드
4. 앱 **설정**에 프로젝트 ID + JSON 붙여넣기 → **키 테스트**

## 로컬 실행

```bash
cp .env.example .env.local
# YOUTUBE_API_KEY, VERTEX_* 입력

npm install
npm run dev
```

## 환경 변수

| 변수 | 설명 |
|------|------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 |
| `VERTEX_PROJECT_ID` | GCP 프로젝트 ID |
| `VERTEX_LOCATION` | 기본 `us-central1` |
| `VERTEX_SERVICE_ACCOUNT_JSON` | 서비스 계정 JSON |
| `VERTEX_MODEL` | 기본 `gemini-2.0-flash-001` |

## 참고

- 우측 상단 **설정**에서 YouTube 키와 Vertex 자격 증명을 입력할 수 있습니다.
- AI Studio Gemini 선불 잔액이 아니라 **Cloud 프로젝트 결제/체험 크레딧**이 사용됩니다.
