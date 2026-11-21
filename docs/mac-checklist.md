# Mac 확인 체크리스트

Windows에서 개발한 앱을 Apple Silicon Mac(macOS 15 이상)에서 빌드하고 확인하는 순서입니다.

## 1. Mac 준비

1. Xcode Command Line Tools: `xcode-select --install`
2. Rust: [rustup](https://rustup.rs)으로 설치 후 `rustup target add aarch64-apple-darwin`
3. Node.js LTS 설치
4. 저장소를 Mac으로 가져옵니다.

## 2. 빌드

```bash
cd app
npm ci
npm run tauri build -- --target aarch64-apple-darwin
```

## 3. 실행 위치

`app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/가계부.app`

서명·공증을 하지 않으므로 처음 열 때 Finder에서 앱을 우클릭 → 열기로 실행합니다.

## 4. 확인 항목

### 공통 (Windows에서 확인한 것을 Mac에서 다시)

- [ ] 첫 실행 시 기본 카테고리가 만들어진다
- [ ] 지출 추가·수정·삭제
- [ ] 무지출 지정·해제 (지출이 있는 날은 막힌다)
- [ ] 카테고리별 월 메모
- [ ] 고정 지출 저장, 이월(지난달 금액 불러오기) 버튼
- [ ] 카테고리 삭제 시 지출 이동
- [ ] 설정에서 시작일을 16으로 바꿔도 오늘이 달력에 보인다 (ISSUE-01)
- [ ] 백업 생성: 데이터 폴더의 `backups/`에 파일이 생긴다
- [ ] 테마 3종 × 화면 모드 3종(시스템·라이트·다크)

### Mac에서만 확인되는 것

- [ ] 편집 메뉴: 입력칸에서 ⌘C·⌘X·⌘V·⌘A가 동작한다
- [ ] 단축키: ⌘, (설정), ⌘← / ⌘→ (이전·다음 달), ⌘T (오늘), ⌘1 (날짜 탭), ⌘2 (요약 탭), ⌘N (새 지출 입력)
- [ ] 입력칸 안에서 ⌘←/⌘→는 커서 이동으로 동작하고 달이 바뀌지 않는다
- [ ] 설정·확인 창이 떠 있는 동안 단축키가 달을 바꾸지 않는다
- [ ] 파일 메뉴: 가져오기, 내보내기, 백업 폴더 열기
- [ ] macOS 시스템 설정에서 라이트/다크를 바꾸면 화면 모드 "시스템"이 따라간다
- [ ] 창 크기와 위치가 다시 실행해도 복원된다
- [ ] 한글 입력 중 Enter가 입력을 확정만 하고 저장하지 않는다
- [ ] Safari 엔진 렌더링: 달력 칸의 카테고리 칩 넘침, 시트(설정·고정 지출) 모양
- [ ] 데이터 위치: `~/Library/Application Support/com.budgetbook.desktop/` 아래에 `budgetbook.db`와 `backups/`

## 참고

- 번들 ID `com.budgetbook.desktop`은 임시 값입니다. `app/src-tauri/tauri.conf.json`의 `identifier`를 바꾸면 데이터 폴더가 달라져 기존 데이터가 보이지 않으니, 바꿀 때는 폴더를 함께 옮기세요.
- 문제가 있으면 확인한 항목과 증상을 그대로 알려 주세요.
