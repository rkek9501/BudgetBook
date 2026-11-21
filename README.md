# 가계부 (Mac)

달력에서 바로 지출을 기록하는 macOS용 개인 가계부입니다. 월급일 같은 회계기간 시작일을 기준으로 한 달을 묶어 보여줍니다.

> 상태: 구현 완료, Mac 실기 확인 대기 ([Mac 확인 체크리스트](docs/mac-checklist.md))

## 주요 기능

- 달력에서 날짜별 지출 기록 (카테고리 색 칩으로 표시)
- 사용자 지정 회계기간 (시작일 1~31일, 종료일은 다음 시작일 전날)
- 월간 요약: 카테고리별 합계, 고정 지출, 월간 총 지출, 무지출 데이 횟수
- 카테고리별 월 메모
- 월 고정 지출 관리 (지난달 금액 불러오기)
- 카테고리 관리 (색상 프리셋 8종, 팔레트 48색, HEX 입력)
- 테마 3종(macOS 기본 / 따뜻한 다이어리 / 미니멀 모노톤) × 화면 모드(시스템 / 라이트 / 다크)
- 자동 백업과 앱 안에서 복원, JSON 내보내기, Windows 버전 데이터 가져오기

## 기술 스택

| 영역 | 기술 |
|---|---|
| 앱 셸 | Tauri 2 |
| 화면 | Vue 3, TypeScript, Vite, Pinia |
| 데이터 | SQLite (Rust `rusqlite`로 접근) |
| 날짜 | date-fns, @date-fns/tz (Asia/Seoul 기준) |
| 테스트 | Vitest (TypeScript), cargo test (Rust) |

## 문서

| 문서 | 내용 |
|---|---|
| [설계 문서](docs/superpowers/specs/2026-11-15-mac-budgetbook-design.md) | 구현 기준. 화면 구조, 데이터 설계, 안전장치, 검증 방법 |
| [기능 명세](docs/functional-spec.md) | 계산 규칙(회계기간·집계·정렬), 메시지, Windows 버전 데이터 형식 |
| [Mac 확인 체크리스트](docs/mac-checklist.md) | Mac 빌드·실행·확인 순서 |
| [기존 화면](docs/asis-screens/) | Windows 버전 화면 캡처 (디자인 개선 전 참고용) |

## 프로젝트 구조

```
.
├── app/                  Tauri 앱
│   ├── src/              Vue 화면, Pinia 스토어
│   │   └── domain/       비즈니스 규칙 (회계기간, 정렬, 집계, 가져오기 변환)
│   └── src-tauri/        Rust: 데이터 계층(SQLite), Tauri 커맨드, 메뉴
└── docs/
```

## 개발 환경

| 용도 | 환경 | 필요한 도구 |
|---|---|---|
| 개발 | Windows 11 | Node.js LTS, Rust(rustup), Visual Studio C++ Build Tools, WebView2(Windows 11 기본 포함) |
| Mac 빌드·확인 | Apple Silicon, macOS 15 이상 | Xcode Command Line Tools, Rust, Node.js LTS |

본인용 앱이라 서명·공증 없이 Mac에서 직접 빌드합니다.

## 명령어

```bash
cd app
npm ci
npm run tauri dev                                    # 개발 실행
npm test                                             # TypeScript 단위 테스트 (Vitest)
npm run build                                        # 타입 검사(vue-tsc) + 프런트 빌드
(cd src-tauri && cargo test --lib)                   # Rust 데이터 계층 테스트
npm run tauri build -- --target aarch64-apple-darwin # Mac 빌드 (Mac에서 실행)
```

## 데이터 위치 (Mac)

- DB: `~/Library/Application Support/<번들 ID>/budgetbook.db`
- 자동 백업: 같은 폴더의 `backups/` (하루 1회, 최근 14개 보관)
