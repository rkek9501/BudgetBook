# CLAUDE.md

Mac용 개인 가계부. Tauri 2 + Vue 3 + TypeScript, 데이터는 SQLite(Rust).

## 먼저 읽을 것

- **설계 문서(구현 기준):** `docs/superpowers/specs/2026-11-15-mac-budgetbook-design.md`. 사용자가 정한 것과 작성자가 정한 것을 `[사용자 결정]`·`[제 결정]`으로 구분해 두었다.
- **기능 명세:** `docs/functional-spec.md`. 회계기간(§4.1), 집계(§4.5), 카테고리 정렬(§4.10), 메시지 문구(§6), Windows 버전 데이터 형식(§5.2, §8.4)의 기준이다.
- 설계와 다르게 구현해야 할 이유가 생기면, 구현 전에 사용자에게 묻고 설계 문서부터 고친다.

## 구조

- `app/src/domain/` — 비즈니스 규칙. 순수 TypeScript로 작성하고 Vue·Tauri·DB에 의존하지 않는다.
- `app/src/` — Vue 화면, Pinia 스토어
- `app/src-tauri/` — Rust 데이터 계층(`rusqlite`), Tauri 커맨드, macOS 메뉴

## 꼭 지킬 규칙

- **날짜:** 한국시간(Asia/Seoul) 기준이다. 날짜는 `YYYY-MM-DD`, 회계월은 `YYYY-MM` 문자열로 다루고, JS `Date`를 저장값으로 쓰지 않는다. "오늘"은 domain의 단일 함수로만 얻는다(테스트에서 시계를 고정할 수 있어야 함).
- **금액:** 원 단위 정수, 0 이상
- **계산 규칙:** 회계기간·집계·정렬 결과는 기능 명세와 완전히 같아야 한다. 명세 §4.1 예시 표는 테스트로 유지하고 기대값을 바꾸지 않는다.
- **트랜잭션:** 여러 단계 쓰기는 Rust 커맨드 하나 안의 트랜잭션으로 처리한다. TypeScript에서 `BEGIN`·`COMMIT`을 보내지 않고, `tauri-plugin-sql`은 쓰지 않는다.
- **데이터 보호:** DB를 열지 못해도 절대 새 DB로 덮어쓰지 않는다. 저장 실패는 반드시 화면에 알린다.
- **무결성:** `PRAGMA foreign_keys = ON`. 카테고리 ID는 `AUTOINCREMENT`로 재사용하지 않는다. 카테고리를 찾을 수 없는 지출 같은 고아 데이터를 만들지 않는다.
- **메뉴:** macOS 메뉴에 편집(Edit) 메뉴를 반드시 둔다. 없으면 입력칸에서 ⌘C·⌘V가 동작하지 않는다.
- **웹 기술 범위:** Safari 18(macOS 15 WebKit) 기준이다. 개발 중 확인하는 WebView2(Chromium)에서만 되는 기능은 쓰지 않는다.
- **스타일:** 색·간격·모서리는 CSS 변수(토큰)로만 지정한다. 테마 3종 × 라이트·다크를 모두 지원한다.
- **문구:** UI 문구는 한국어로 쓴다.

## 명령어 (`app/` 생성 후)

```bash
cd app
npm run tauri dev                                    # 개발 실행 (Windows)
npm test                                             # Vitest
(cd src-tauri && cargo test)                         # Rust 테스트
npm run tauri build -- --target aarch64-apple-darwin # Mac 빌드 (Mac에서만)
```

## 개발 흐름

- Windows에서 개발하고 `tauri dev`로 확인한다. Mac 빌드와 최종 확인은 사용자의 Mac(Apple Silicon, macOS 15 이상)에서 한다.
- 본인용 앱이라 서명·공증을 하지 않는다.
- 앱 의존성은 `app/`에만 설치한다.
