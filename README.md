# Local Quester web

Next.js 기반 모바일 웹앱입니다. 화면은 최대 402px로 고정하고 넓은 화면에서는 가운데 정렬합니다.

```bash
npm ci
npm run dev
```

검사는 `npm run lint`, `npm run typecheck`, `npm run build`로 실행합니다.
Figma의 스플래시·로그인 화면을 구현했습니다. 카카오·구글 버튼은 `/api/auth/start/{provider}`로 이동하고, 서버의 OAuth 콜백이 발급한 일회용 티켓을 `/api/auth/callback`에서 교환합니다. 세션 토큰은 HTTP 전용 쿠키에 저장합니다.

로컬에서 API를 연결하려면 `.env.example`을 `.env.local`로 복사해 `API_URL`을 설정합니다. 운영 Vercel 프로젝트에도 배포된 API 주소를 `API_URL` 환경 변수로 설정해야 실제 로그인할 수 있습니다. 지도·AR 기능은 이후 구현합니다.
