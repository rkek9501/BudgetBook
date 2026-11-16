# Mac 가계부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 가계부의 기능을 새 디자인으로 옮긴 macOS용 개인 가계부 앱을 만든다.

**Architecture:**
- `app/` 안의 Tauri 2 앱이다.
- **TypeScript (`app/src/domain`):** 비즈니스 규칙(회계기간, 정렬, 집계, 가져오기 변환)을 UI·DB와 무관한 순수 함수로 둔다.
- **Rust (`app/src-tauri`):** SQLite 저장소를 `rusqlite`로 다루고, 여러 단계 쓰기를 커맨드 하나 안의 트랜잭션으로 처리한다.
- **Vue 3 + Pinia:** 두 계층을 엮어 화면을 그린다.

**Tech Stack:**
- 셸·UI: Tauri 2.12, Vue 3.5, Vite, TypeScript, Pinia
- 날짜: date-fns 4, @date-fns/tz 1
- 테스트: Vitest + @vue/test-utils + happy-dom
- Rust: rusqlite 0.43(`bundled`), serde, uuid 1(`v4`), chrono 0.4, thiserror 2, tempfile 3(dev)
- Tauri 플러그인: dialog 2, opener 2, window-state 2

**Spec:**
- 설계 문서 `docs/superpowers/specs/2026-11-15-mac-budgetbook-design.md` (이하 "설계")
- 기능 명세 `docs/functional-spec.md` (이하 "명세")

실행자는 계획과 함께 두 문서를 읽는다.

## Global Constraints

**기술**
- 데이터 접근은 Rust `rusqlite`(`bundled`)로만 한다. `tauri-plugin-sql`은 쓰지 않는다. TypeScript는 `BEGIN`·`COMMIT`을 보내지 않는다.
- 앱 의존성은 `app/`에만 설치한다. 패키지 매니저는 npm이다.

**날짜·금액**
- 모든 날짜 판단은 `Asia/Seoul` 기준이다. 날짜는 `YYYY-MM-DD`, 회계월은 `YYYY-MM` 문자열로 다룬다. 기록 시각은 ISO 8601 `+09:00` 형식이다. JS `Date`를 저장값으로 쓰지 않는다.
- 금액은 원 단위 정수, `0` ~ `99,999,999,999`
- 회계기간·집계·정렬 결과는 명세 §4.1·§4.5·§4.10과 완전히 같아야 한다. 명세 §4.1 예시 표의 기대값은 바꾸지 않는다.

**데이터 안전**
- DB 연결마다 `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`을 설정한다. `categories.id`는 `AUTOINCREMENT`다.
- DB를 열거나 마이그레이션하다 실패해도 기존 파일을 지우거나 덮어쓰지 않는다. 쓰기 실패는 화면에 알린다.

**빌드 대상**
- Mac 빌드 대상은 `aarch64-apple-darwin`, `bundle.macOS.minimumSystemVersion = "15.0"`이다.
- 웹 기술은 Safari 18 범위만 쓴다. Chromium 전용 API는 쓰지 않는다.
- `productName = "가계부"`, `identifier = "com.budgetbook.desktop"`(임시 값). identifier를 바꾸면 Mac 데이터 폴더가 바뀌므로 실사용 전에 사용자와 확정한다.

**창·메뉴**
- 창은 기본 1280×800, 최소 1024×700이다. 크기와 위치는 `tauri-plugin-window-state`로 복원하고, 실행 시 최대화하지 않는다.
- macOS 메뉴에 편집 메뉴(실행 취소·다시 실행·잘라내기·복사·붙여넣기·모두 선택)가 반드시 있어야 한다.

**화면·문구**
- UI 문구는 한국어다. 명세 §6 문구는 `app/src/domain/messages.ts`의 `MESSAGES`로만 참조한다.
- 색·간격·모서리는 CSS 변수로만 지정한다. 테마는 `macos` | `diary` | `mono`(기본 `macos`), 화면 모드는 `system` | `light` | `dark`(기본 `system`)이다.

**작업 방식**
- 작업마다 로컬 커밋한다. push, 원격 저장소 생성, rebase는 하지 않는다.
- 명령은 모두 `app/`에서 실행한다(별도 표기 제외). 테스트 명령은 다음과 같다.
  - TypeScript: `npm test -- <경로>`
  - Rust: `cd src-tauri && cargo test --lib <필터>`

## Review Focus

1. **금액 붙여넣기 변형** (`12,000원`, ` 12000 `, `1000.5`, `100000000000`): 앞의 둘은 12000으로 받는다. 소수는 `invalid`, 상한 초과는 `too-large` 메시지를 보여준다. Task 4 테스트 `parseAmount 변형 입력`
2. **Enter 연타·더블클릭 중복 추가:** 저장이 진행 중이면 두 번째 제출을 무시해 지출이 1건만 생긴다. Task 16 테스트 `저장 중 재제출 무시`
3. **마지막 카테고리 삭제:** 카테고리가 하나뿐이면 삭제를 거부하고 `MESSAGES.lastCategory`를 보여준다. Task 8 테스트 `last_category_cannot_be_deleted`
4. **형식이 다른 JSON 가져오기** (`{}`, `[]`, `{"DayData": 3}`): `unsupported-format`으로 거절하고 DB는 바뀌지 않는다. Task 6 테스트 `형식이 다른 JSON`
5. **자정을 넘겨 켜 둔 앱:** 한국시간 날짜가 바뀌면 오늘 표시가 갱신된다(창 포커스 시와 1분 주기 확인). Task 13 테스트 `자정이 지나면 오늘 갱신`, 주기·포커스 연결은 Task 14 `AppShell`

---

## 파일 구조

```
app/
├── package.json, vite.config.ts, tsconfig*.json, index.html
├── src/
│   ├── main.ts, App.vue
│   ├── domain/            # 순수 TS. Vue·Tauri import 금지
│   │   ├── types.ts       # 공유 타입
│   │   ├── dates.ts       # KST 오늘, 날짜 연산·표기
│   │   ├── period.ts      # 회계기간·회계월·달력 배치
│   │   ├── categories.ts  # 색 계열·정렬·HEX·프리셋·팔레트·기본 카테고리
│   │   ├── money.ts       # 금액 파싱·표기
│   │   ├── messages.ts    # UI 문구 상수
│   │   ├── summary.ts     # 월간 요약·날짜 칸 데이터
│   │   ├── importWindows.ts  # Windows data.json 변환
│   │   └── *.test.ts
│   ├── api/commands.ts    # Rust 커맨드 타입 래퍼 (invoke)
│   ├── stores/            # settings.ts, ledger.ts (+ *.test.ts)
│   ├── composables/       # useAppearance.ts, useShortcuts.ts
│   ├── styles/            # tokens.css, themes/{macos,diary,mono}.css
│   └── components/        # 화면 컴포넌트 (+ *.test.ts)
└── src-tauri/
    ├── Cargo.toml, tauri.conf.json, capabilities/default.json
    └── src/
        ├── main.rs, lib.rs     # 빌더, 플러그인, 상태, 커맨드 등록
        ├── error.rs            # AppError
        ├── time.rs             # KST 시각
        ├── models.rs           # 직렬화 구조체 (camelCase)
        ├── db/{mod.rs, migrations/0001_init.sql, test_util.rs}
        ├── repo/{categories.rs, expenses.rs, days.rs, notes.rs, fixed.rs, settings.rs}
        ├── backup.rs, transfer.rs   # 백업·복원, 가져오기·내보내기
        ├── commands.rs, menu.rs
```

---

### Task 1: 개발 도구 설치와 Tauri 프로젝트 생성

**Files:**
- Create: `app/` 전체(템플릿), `app/src/domain/.gitkeep`
- Modify: `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs`, `app/vite.config.ts`, `app/tsconfig.json`, `app/package.json`

**Interfaces:**
- Produces: `npm test`(Vitest, happy-dom, `@` → `src` 별칭, `passWithNoTests`), `cargo test --lib`, Rust 라이브러리 크레이트 이름 `budgetbook_lib`, 창 라벨 `main`

- [ ] **Step 1: 필수 도구 확인 후 설치 승인 받기**

현재 이 PC에는 Node 22만 있고 Rust와 MSVC 빌드 도구는 없다. WebView2는 설치되어 있다. 다음 두 명령은 설치 용량이 수 GB이므로 **사용자 승인 후** 실행한다.

```powershell
winget install -e --id Rustlang.Rustup
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

새 셸에서 확인: `rustc --version`, `cargo --version`이 버전을 출력해야 한다.

- [ ] **Step 2: 프로젝트 생성 (저장소 루트에서)**

```bash
npm create tauri-app@latest app -- --template vue-ts --manager npm --identifier com.budgetbook.desktop --yes
cd app && npm install
```

- [ ] **Step 3: 이름·창·빌드 대상 설정**

- `Cargo.toml`: 패키지 이름 `budgetbook`, `[lib] name = "budgetbook_lib"`
- `tauri.conf.json`:
  - `productName "가계부"`, 창 `title "가계부"`, `width 1280`, `height 800`, `minWidth 1024`, `minHeight 700`, `center true`
  - `bundle.macOS.minimumSystemVersion "15.0"`
- 템플릿의 `greet` 데모 커맨드와 화면을 지운다.

- [ ] **Step 4: 의존성 추가**

```bash
npm install pinia date-fns@4 @date-fns/tz@1 @tauri-apps/plugin-dialog@2 @tauri-apps/plugin-opener@2 @tauri-apps/plugin-window-state@2
npm install -D vitest @vue/test-utils happy-dom
```

- vitest 피어 의존성이 설치된 vite와 충돌하면, 피어 범위가 맞는 가장 새 vitest를 고른다.
- TypeScript·vue-tsc는 템플릿 버전을 유지한다.

Rust 의존성:
- `tauri-plugin-dialog = "2"`, `tauri-plugin-opener = "2"`, `tauri-plugin-window-state = "2"`
- `rusqlite = { version = "0.43", features = ["bundled"] }`
- `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`
- `uuid = { version = "1", features = ["v4"] }`, `chrono = "0.4"`, `thiserror = "2"`
- `[dev-dependencies] tempfile = "3"`

`lib.rs`에서 세 플러그인을 등록하고, `capabilities/default.json`에 `dialog:default`, `opener:default`, `window-state:default`를 추가한다.

- [ ] **Step 5: Vitest 설정**

`vite.config.ts`에 `test: { environment: 'happy-dom', passWithNoTests: true }`와 `resolve.alias['@'] = src`를 넣는다. `tsconfig.json`에 `paths: { "@/*": ["src/*"] }`를 넣고, `package.json`에 `"test": "vitest run"`을 추가한다.

- [ ] **Step 6: 확인**

Run: `npm test` → 테스트 없음으로 통과
Run: `cd src-tauri && cargo test --lib` → 통과(0 tests)
Run: `npm run tauri dev` → 제목이 "가계부"인 빈 창이 1280×800으로 열림. 창 크기를 바꾸고 다시 실행하면 그 크기로 열림

- [ ] **Step 7: Commit**

```bash
git add app && git commit -m "chore: Tauri 2 + Vue 3 프로젝트 생성과 기본 설정"
```

---

### Task 2: 도메인 타입과 KST 날짜 유틸

**Files:**
- Create: `app/src/domain/types.ts`, `app/src/domain/dates.ts`
- Test: `app/src/domain/dates.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type DateStr = string;  // 'YYYY-MM-DD'
  export type MonthStr = string; // 'YYYY-MM'
  export interface Category { id: number; name: string; color: string }   // '#RRGGBB'
  export interface Expense { id: string; date: DateStr; description: string; amount: number; categoryId: number }
  export interface CategoryNote { month: MonthStr; categoryId: number; note: string }
  export interface FixedItem { id: string; name: string; sortOrder: number }
  export interface FixedAmount { itemId: string; month: MonthStr; amount: number }
  export interface Period { start: DateStr; end: DateStr }
  export type Theme = 'macos' | 'diary' | 'mono';
  export type Appearance = 'system' | 'light' | 'dark';
  export interface Settings { accountingStartDay: number; theme: Theme; appearance: Appearance }
  ```
- Produces (`dates.ts`):
  - `setNowProvider(fn: () => number): void` — 테스트용. 기본값은 `Date.now`
  - `todayKst(): DateStr` — `@date-fns/tz`의 `TZDate(now, 'Asia/Seoul')` 사용
  - `addDays(d: DateStr, n: number): DateStr`
  - `addMonths(m: MonthStr, n: number): MonthStr`
  - `daysInMonth(m: MonthStr): number`
  - `weekday(d: DateStr): number` — 0=일요일
  - `monthOf(d: DateStr): MonthStr`
  - `formatMonthTitle(m): string` — `2026년 11월`
  - `formatDateLong(d): string` — `2026년 10월 25일`
  - `formatDayTitle(d): string` — `11월 15일 (일)`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('UTC 15:30은 한국 날짜로 다음 날', () => {
  setNowProvider(() => Date.UTC(2026, 10, 15, 15, 30));
  expect(todayKst()).toBe('2026-11-16');
});
it('날짜 연산', () => {
  expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  expect(addMonths('2026-12', 1)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(daysInMonth('2028-02')).toBe(29);
  expect(weekday('2026-11-15')).toBe(0);
  expect(monthOf('2026-11-15')).toBe('2026-11');
});
it('표기', () => {
  expect(formatMonthTitle('2026-09')).toBe('2026년 9월');
  expect(formatDateLong('2026-10-25')).toBe('2026년 10월 25일');
  expect(formatDayTitle('2026-11-15')).toBe('11월 15일 (일)');
});
```

- [ ] **Step 2:** Run `npm test -- src/domain/dates.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3: 구현.** 날짜 연산은 문자열 ↔ `Date.UTC` 정수 계산으로 하고, 로컬 시간대에 의존하지 않는다.
- [ ] **Step 4:** Run 같은 명령 → PASS
- [ ] **Step 5:** `git commit -m "feat(domain): KST 날짜 유틸과 공유 타입"`

---

### Task 3: 회계기간 계산

**Files:**
- Create: `app/src/domain/period.ts`
- Test: `app/src/domain/period.test.ts`

**Interfaces:**
- Consumes: Task 2 `dates.ts`
- Produces:
  - `accountPeriod(month: MonthStr, startDay: number): Period` — 명세 §4.1 알고리즘 그대로
  - `accountMonthOf(date: DateStr, startDay: number): MonthStr` — 그 날짜를 포함하는 회계월
  - `periodDates(p: Period): DateStr[]`
  - `calendarLayout(p: Period): { leadingBlanks: number; rows: number }` — `leadingBlanks = weekday(start)`, `rows = ceil((leadingBlanks + 일수) / 7)`

- [ ] **Step 1: 실패하는 테스트 작성** — 명세 §4.1 표 9행을 `it.each`로 그대로 넣는다.

```ts
it.each([
  [25, '2026-11', '2026-10-25', '2026-11-24'], [1, '2026-11', '2026-11-01', '2026-11-30'],
  [10, '2026-11', '2026-11-10', '2026-12-09'], [19, '2026-11', '2026-11-19', '2026-12-18'],
  [20, '2026-11', '2026-10-20', '2026-11-19'], [31, '2026-02', '2026-01-31', '2026-02-27'],
  [31, '2026-03', '2026-02-28', '2026-03-30'], [30, '2028-03', '2028-02-29', '2028-03-29'],
  [29, '2028-03', '2028-02-29', '2028-03-28'],
])('시작일 %i, %s → %s ~ %s', (s, m, start, end) => {
  expect(accountPeriod(m, s)).toEqual({ start, end });
});
it.each([
  ['2026-11-26', 25, '2026-12'], ['2026-11-03', 5, '2026-10'],
  ['2026-11-15', 25, '2026-11'], ['2026-11-15', 16, '2026-10'],
  ['2026-01-31', 31, '2026-02'], ['2026-03-30', 31, '2026-03'],
])('%s, 시작일 %i → 회계월 %s', (d, s, m) => expect(accountMonthOf(d, s)).toBe(m));
it('연속성: 시작일 1~31, 2026-01~2028-12의 모든 회계기간은 빈틈·겹침 없이 이어진다', () => { /* 다음 기간 start === addDays(이전 end, 1) */ });
it('달력 배치', () => {
  expect(calendarLayout(accountPeriod('2026-11', 25))).toEqual({ leadingBlanks: 0, rows: 5 });
});
```

- [ ] **Step 2:** Run `npm test -- src/domain/period.test.ts` → FAIL
- [ ] **Step 3: 구현.** `accountMonthOf`는 `monthOf(date)`를 후보로 잡는다. 날짜가 그 기간 시작보다 앞이면 −1개월, 끝보다 뒤면 +1개월로 바꾼다.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(domain): 회계기간과 회계월 계산"`

---

### Task 4: 카테고리 색 규칙, 금액, 문구

**Files:**
- Create: `app/src/domain/categories.ts`, `app/src/domain/money.ts`, `app/src/domain/messages.ts`
- Test: `app/src/domain/categories.test.ts`, `app/src/domain/money.test.ts`

**Interfaces:**
- Produces (`categories.ts`):
  - `colorGroup(hex: string): number` — 명세 §4.10 표 그대로(0~7, 해석 실패 999)
  - `compareCategories(a: Category, b: Category): number` — 색 계열, 그다음 `a.name.localeCompare(b.name, 'ko')`
  - `sortCategories(list: Category[]): Category[]` — 새 배열
  - `normalizeHex(input: string): string | null` — `RRGGBB`나 `#rrggbb`를 `#RRGGBB`로 바꾼다. 3자리·8자리·기타는 `null`
  - `textColorFor(hex: string): '#000000' | '#FFFFFF'` — WCAG 대비가 큰 쪽
  - `PRESETS: { name: string; color: string }[]`(8개)
  - `PALETTE: string[]`(명세 F-CAT의 48색, 같은 순서)
  - `DEFAULT_CATEGORIES: { name: string; color: string }[]`(8개)
- Produces (`money.ts`):
  - `parseAmount(input: string): { ok: true; value: number } | { ok: false; error: 'empty' | 'invalid' | 'negative' | 'too-large' }`
  - `formatWon(n: number): string` — `12,000`(`원` 없음)
  - `formatAmountInput(raw: string): string` — 숫자만 남기고 콤마를 넣는다
  - `MAX_AMOUNT = 99_999_999_999`
- Produces (`messages.ts`): `MESSAGES`. 다음 문구를 정확히 쓴다.
  - 명세 §6의 문구(`descriptionRequired`, `amountInvalid`, `amountNegative`, `amountInvalidForEdit`, `categoryRequired`, `categoryNameRequired`, `categoryDuplicate`, `colorInvalid`, `fixedNameRequired`, `fixedDuplicate`, `fixedAmountInvalid(name)`, `confirmDeleteExpense`, `confirmDeleteCategory(name)`, `confirmDeleteFixed(name)`, `emptyMonth`, `emptyFixed`)
  - 새 문구
    - `amountTooLarge = '금액은 999억 9999만 9999원까지 입력할 수 있어요.'`
    - `noExpenseBlocked = '지출이 있는 날은 무지출로 표시할 수 없어요'`
    - `lastCategory = '카테고리는 최소 1개가 있어야 해요.'`
    - `saveFailed = '저장하지 못했어요. 다시 시도해 주세요.'`
    - `confirmDeleteCategoryWithNotes(name, n) = `'${name}' 카테고리를 삭제하시겠습니까? 메모 ${n}개도 함께 삭제됩니다.``

프리셋 8종 (설계 §6.6, 주황·초록 값 확정):

| 이름 | HEX | 계열 |
|---|---|---|
| 빨강 | `#FCB9BA` | 0 |
| 주황 | `#FCD5B5` | 1 |
| 노랑 | `#FBF6A5` | 2 |
| 초록 | `#C5F0C0` | 3 |
| 파랑 | `#B7D9FC` | 4 |
| 보라 | `#DAB6FC` | 5 |
| 분홍 | `#FCBBFB` | 6 |
| 검정/회색 | `#BDBDBD` | 7 |

기본 카테고리 (설계 §6.9): 식비 `#FCB9BA`, 카페·간식 `#FCD5B5`, 생활 `#FBF6A5`, 교통 `#B7D9FC`, 쇼핑 `#DAB6FC`, 문화·여가 `#FCBBFB`, 의료 `#C5F0C0`, 기타 `#BDBDBD`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('프리셋은 이름과 같은 계열', () => expect(PRESETS.map(p => colorGroup(p.color))).toEqual([0,1,2,3,4,5,6,7]));
it('계열 판정', () => {
  expect(colorGroup('#333333')).toBe(7); expect(colorGroup('#FF0000')).toBe(0);
  expect(colorGroup('#80FF00')).toBe(3); expect(colorGroup('zzz')).toBe(999);
  expect(colorGroup('#FCEBB7')).toBe(2); expect(colorGroup('#B8F6EE')).toBe(4); // 원본 프리셋 (ISSUE-20)
});
it('정렬: 계열 → 이름', () => {
  const r = sortCategories([{id:1,name:'생활',color:'#B8F6EE'},{id:2,name:'교통',color:'#B7D9FC'},{id:3,name:'식비',color:'#FCB9BA'},{id:4,name:'기타',color:'#333333'}]);
  expect(r.map(c => c.name)).toEqual(['식비','교통','생활','기타']);
});
it('HEX 정규화', () => {
  expect(normalizeHex('333333')).toBe('#333333'); expect(normalizeHex(' #fcb9ba ')).toBe('#FCB9BA');
  expect(normalizeHex('#12')).toBeNull(); expect(normalizeHex('#FFFFFFFF')).toBeNull();
});
it('글자색', () => { expect(textColorFor('#FCB9BA')).toBe('#000000'); expect(textColorFor('#333333')).toBe('#FFFFFF'); });
it('팔레트 48색, 기본 카테고리 8개', () => { expect(PALETTE).toHaveLength(48); expect(DEFAULT_CATEGORIES).toHaveLength(8); });
// money.test.ts
it('parseAmount 변형 입력', () => {
  expect(parseAmount('12,000원')).toEqual({ ok: true, value: 12000 });
  expect(parseAmount(' 12000 ')).toEqual({ ok: true, value: 12000 });
  expect(parseAmount('0')).toEqual({ ok: true, value: 0 });
  expect(parseAmount('')).toEqual({ ok: false, error: 'empty' });
  expect(parseAmount('1000.5')).toEqual({ ok: false, error: 'invalid' });
  expect(parseAmount('abc')).toEqual({ ok: false, error: 'invalid' });
  expect(parseAmount('-1')).toEqual({ ok: false, error: 'negative' });
  expect(parseAmount('100000000000')).toEqual({ ok: false, error: 'too-large' });
});
it('표기', () => { expect(formatWon(51450)).toBe('51,450'); expect(formatAmountInput('12a000')).toBe('12,000'); });
```

- [ ] **Step 2:** Run `npm test -- src/domain` → FAIL
- [ ] **Step 3:** 세 파일을 구현한다. 계열 판정은 명세 §4.10의 순서(무채색 판정을 먼저)를 그대로 따른다.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(domain): 카테고리 색 규칙, 금액 파싱, UI 문구"`

---

### Task 5: 월간 요약과 날짜 칸 데이터

**Files:**
- Create: `app/src/domain/summary.ts`
- Test: `app/src/domain/summary.test.ts`

**Interfaces:**
- Consumes: Task 2·3·4
- Produces:
  ```ts
  export interface SummaryRow { category: Category; total: number; note: string }
  export interface MonthSummary { rows: SummaryRow[]; variableTotal: number; fixedTotal: number; grandTotal: number; noExpenseCount: number }
  export function buildMonthSummary(i: { period: Period; month: MonthStr; categories: Category[]; expenses: Expense[];
    noExpenseDays: DateStr[]; notes: CategoryNote[]; fixedAmounts: FixedAmount[] }): MonthSummary
  export interface DayCellData { date: DateStr; expenses: Expense[]; total: number; noExpense: boolean }
  export function buildDayCells(period: Period, expenses: Expense[], noExpenseDays: DateStr[], categories: Category[]): DayCellData[]  // periodDates 순서
  export function fitChips(count: number, availablePx: number, chipPx: number, morePx: number): { visible: number; hidden: number }
  ```

**규칙**
- `rows`: 기간 안 지출이 있거나 그 회계월 메모가 있는 카테고리. 순서는 `compareCategories`
- 칸 안 지출 순서: 카테고리 순서로 정렬한 안정 정렬
- 기간 밖 데이터는 모두 무시한다.
- `fitChips`: 모두 들어가면 `hidden = 0`. 아니면 `visible = max(0, floor((available - morePx) / chipPx))`

- [ ] **Step 1: 실패하는 테스트 작성** — 명세 §10 실행 검증 값을 쓴다.

```ts
// 기간 2026-10-25~2026-11-24, 카테고리 식비(1 #FCB9BA)/교통(2 #B7D9FC)/생활(3 #B8F6EE)/기타(4 #333333)
// 11-15: 점심 12000(1), 커피 5000(1), 버스 1450(2), 장보기 33000(4); 11-14 무지출; 11-25 지출 999(1, 기간 밖)
// 고정 2026-11: 월세 500000, 통신비 55000; 2026-12: 1 (다른 달); 메모 2026-11 식비 '회식이 많았음', 2026-11 생활(3) '메모만'
it('명세 실행 검증 값과 같다', () => {
  expect(s.rows.map(r => [r.category.name, r.total])).toEqual([['식비',17000],['교통',1450],['생활',0],['기타',33000]]);
  expect([s.variableTotal, s.fixedTotal, s.grandTotal, s.noExpenseCount]).toEqual([51450, 555000, 606450, 1]);
  expect(s.rows[0].note).toBe('회식이 많았음');
});
it('날짜 칸', () => {
  const c = cells.find(x => x.date === '2026-11-15')!;
  expect(c.expenses.map(e => e.description)).toEqual(['점심','커피','버스','장보기']);
  expect(c.total).toBe(51450);
  expect(cells.find(x => x.date === '2026-11-14')!.noExpense).toBe(true);
  expect(cells).toHaveLength(31);
});
it('fitChips', () => { expect(fitChips(2, 100, 24, 18)).toEqual({ visible: 2, hidden: 0 }); expect(fitChips(4, 90, 24, 18)).toEqual({ visible: 3, hidden: 1 }); });
```

- [ ] **Step 2:** Run `npm test -- src/domain/summary.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(domain): 월간 요약과 날짜 칸 데이터"`

---

### Task 6: Windows data.json 가져오기 변환

**Files:**
- Create: `app/src/domain/importWindows.ts`
- Test: `app/src/domain/importWindows.test.ts`

**Interfaces:**
- Consumes: Task 4 `normalizeHex`
- Produces:
  ```ts
  export interface ImportPayload {
    categories: { sourceId: number; name: string; color: string }[];
    expenses: { date: DateStr; description: string; amount: number; sourceCategoryId: number }[];
    noExpenseDays: DateStr[];
    fixedItems: { name: string; sortOrder: number; amounts: { month: MonthStr; amount: number }[] }[];
    notes: { month: MonthStr; sourceCategoryId: number; note: string }[];
    accountingStartDay: number;
  }
  export interface ImportPreview { categories: number; expenses: number; noExpenseDays: number; fixedItems: number; notes: number; unclassified: number }
  export function parseWindowsData(text: string):
    { ok: true; payload: ImportPayload; preview: ImportPreview } | { ok: false; error: 'invalid-json' | 'unsupported-format' }
  ```

**규칙** (명세 §5, §8.4, 설계 §8.4)
- **형식 판정:** 루트가 객체이고 `Categories`·`DayData`가 배열이어야 한다. 아니면 `unsupported-format`
- **날짜와 금액:** `Date`는 앞 10자리만 쓴다. `Amount`는 `Math.round`로 정수화한다.
- **무지출:** `IsNoExpenseDay`는 `noExpenseDays`로 옮기고 중복을 없앤다. 같은 날짜에 일반 지출이 있으면 무지출 표시를 버린다.
- **색:** `normalizeHex(color.slice(-6))`. 실패하면 `#BDBDBD`
- **카테고리 이름:** 대소문자 무시로 중복되면 첫 항목만 남기고, 뒤 항목의 `sourceId`는 첫 항목으로 연결한다.
- **미분류:** 카테고리를 찾을 수 없는 지출·메모가 있으면 카테고리 `{ sourceId: -1, name: '미분류', color: '#BDBDBD' }`를 추가하고 그쪽으로 연결한다. 이 건수가 `preview.unclassified`다. 원본에 '미분류'라는 이름이 이미 있으면 그 카테고리를 쓴다.
- **빈 내용:** 빈 `Description`은 `'(내용 없음)'`으로 바꾼다.
- **고정 지출:** `MonthlyAmounts`의 0은 제외한다. `sortOrder`는 원본 순서를 따른다.
- **메모:** `CategoryNotes` 키를 `yyyy-MM:id`로 해석한다. 형식이 틀린 키는 버린다.
- **시작일:** `AccountingStartDay`가 1~31이 아니면 25로 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('명세 §5.2 예시', () => {
  const r = parseWindowsData(SPEC_EXAMPLE_JSON) as Ok;   // 명세 §5.2의 JSON 블록을 그대로 문자열로
  expect(r.payload.categories).toEqual([{ sourceId: 1, name: '식비', color: '#FCB9BA' }]);
  expect(r.payload.expenses).toEqual([{ date: '2026-11-15', description: '점심', amount: 12000, sourceCategoryId: 1 }]);
  expect(r.payload.noExpenseDays).toEqual(['2026-11-16']);
  expect(r.payload.fixedItems).toEqual([{ name: '월세', sortOrder: 0, amounts: [{ month: '2026-10', amount: 500000 }, { month: '2026-11', amount: 500000 }] }]);
  expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: 1, note: '회식이 많았음' }]);
  expect(r.preview).toEqual({ categories: 1, expenses: 1, noExpenseDays: 1, fixedItems: 1, notes: 1, unclassified: 0 });
});
it('손상된 JSON', () => expect(parseWindowsData('{"Categories": [')).toEqual({ ok: false, error: 'invalid-json' }));
it.each(['{}', '[]', '{"Categories": [], "DayData": 3}'])('형식이 다른 JSON %s', t =>
  expect(parseWindowsData(t)).toEqual({ ok: false, error: 'unsupported-format' }));
it('찾을 수 없는 카테고리 → 미분류, 고정 0 제외, 소수 반올림, 9자리 색', () => { /* CategoryId 9 지출, Amount 1000.5, 'Color':'#FFFCB9BA', MonthlyAmounts {"2026-12":0} */
  // expect: 미분류 sourceId -1 추가, amount 1001, color '#FCB9BA', 2026-12 금액 없음, preview.unclassified 1
});
```

- [ ] **Step 2:** Run `npm test -- src/domain/importWindows.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(domain): Windows 데이터 가져오기 변환"`

---

### Task 7: Rust DB 기반 (열기, 마이그레이션, 오류, 시각)

**Files:**
- Create: `src-tauri/src/error.rs`, `src-tauri/src/time.rs`, `src-tauri/src/models.rs`, `src-tauri/src/db/mod.rs`, `src-tauri/src/db/migrations/0001_init.sql`, `src-tauri/src/db/test_util.rs`
- Modify: `src-tauri/src/lib.rs`(모듈 선언)

**Interfaces:**
- Produces:
  - `AppError`(thiserror)를 `{ "code": string, "message": string }`로 직렬화한다. 코드: `db_unavailable`, `duplicate_name`, `category_in_use`, `last_category`, `day_has_expenses`, `not_found`, `invalid_input`, `io`, `sqlite`
  - `pub type AppResult<T> = Result<T, AppError>`
  - `time::now_kst_iso() -> String` — `2026-11-16T00:30:00+09:00`. `chrono::FixedOffset::east_opt(9*3600)`
  - `time::today_kst_compact() -> String` — `20261116`
  - `db::open(path: &Path) -> AppResult<Connection>`: 열기 → pragma 설정 → `migrate`. 실패하면 `db_unavailable`(원인 포함)을 돌려준다. 어떤 경우에도 파일을 지우거나 새로 만들어 덮어쓰지 않는다.
  - `db::migrate(conn: &mut Connection) -> AppResult<()>` — `user_version` 0이면 `0001_init.sql`(`include_str!`)을 적용하고 1로 올린다.
  - `db::test_util::test_db() -> (tempfile::TempDir, Connection)`
  - `models.rs`: 모든 구조체에 `#[serde(rename_all = "camelCase")]`
    - `Category { id: i64, name, color }`
    - `Expense { id, date, description, amount: i64, category_id: i64 }`
    - `NewExpense { date, description, amount, category_id }`
    - `ExpenseUpdate { id, description, amount, category_id }`
    - `CategoryUsage { expense_count: i64, note_count: i64 }`
    - `CategoryNote { month, category_id, note }`
    - `NewCategory { name, color }`
    - `FixedItem { id, name, sort_order: i64 }`
    - `FixedAmount { item_id, month, amount: i64 }`
    - `FixedData { items, amounts }`
    - `PeriodData { expenses, no_expense_days: Vec<String>, notes, fixed_amounts }`
    - `Settings { accounting_start_day: i64, theme: String, appearance: String }`
    - `Bootstrap { settings, categories, is_fresh: bool }`
    - `DbStatus { ok: bool, error: Option<String> }`
    - `BackupInfo { file_name, created_at: String, expense_count: i64 }`
    - `ImportPayload` 및 하위 구조(Task 6과 같은 필드)
    - `ImportResult { categories, expenses, no_expense_days, fixed_items, notes: i64 }`

`0001_init.sql`은 설계 §8.2 스키마를 그대로 쓴다(`category_notes`는 `ON DELETE CASCADE`).

- [ ] **Step 1: 실패하는 테스트 작성** (`db/mod.rs`의 tests)

```rust
#[test] fn fresh_db_migrates_to_v1() { /* user_version == 1, 7개 테이블 존재 */ }
#[test] fn foreign_keys_and_wal_enabled() { /* PRAGMA foreign_keys == 1, journal_mode == "wal" */ }
#[test] fn reopen_keeps_data() { /* settings 행 insert → drop → open 다시 → 행 유지 */ }
#[test] fn corrupted_file_is_reported_and_untouched() {
    // 임시 경로에 b"not a database at all" 기록 → open() 결과 Err(code == "db_unavailable")
    // 파일 내용이 바이트 단위로 그대로인지 확인 (ISSUE-05)
}
#[test] fn category_ids_are_not_reused() { /* 3개 insert → id 3 delete → insert → id == 4 (ISSUE-03) */ }
#[test] fn kst_time_format() { /* now_kst_iso()가 +09:00으로 끝나고 길이 25 */ }
```

- [ ] **Step 2:** Run `cargo test --lib db::` → FAIL(컴파일 오류)
- [ ] **Step 3:** 구현. 기존 파일은 `OpenFlags::SQLITE_OPEN_READ_WRITE`로 열고, 파일이 없을 때만 `CREATE`를 붙인다.
- [ ] **Step 4:** Run `cargo test --lib` → PASS
- [ ] **Step 5:** `git commit -m "feat(db): SQLite 열기·마이그레이션과 오류 타입"`

---

### Task 8: Rust 카테고리·메모 저장소

**Files:**
- Create: `src-tauri/src/repo/mod.rs`, `src-tauri/src/repo/categories.rs`, `src-tauri/src/repo/notes.rs`

**Interfaces:**
- Consumes: Task 7
- Produces (`categories.rs`):
  - `list(conn) -> AppResult<Vec<Category>>`
  - `create(conn, name: &str, color: &str) -> AppResult<Category>` — 이름은 trim, 비면 `invalid_input`, 중복이면 `duplicate_name`. 색은 `#RRGGBB`만 받는다.
  - `update(conn, id, name, color) -> AppResult<Category>`
  - `usage(conn, id) -> AppResult<CategoryUsage>`
  - `delete(conn: &mut Connection, id: i64, move_to: Option<i64>) -> AppResult<()>` — 설계 §6.6 규칙, 하나의 트랜잭션
    - 카테고리가 1개뿐이면 `last_category`
    - 지출이 있는데 `move_to`가 없으면 `category_in_use`
    - `move_to`가 있으면 지출을 옮기고 메모를 병합한다. 같은 달 메모가 있으면 `기존 + "\n" + 옮겨 온 메모`. 그다음 삭제
    - 지출이 없으면 삭제(메모는 CASCADE)
  - `seed_defaults(conn: &mut Connection, list: &[NewCategory]) -> AppResult<Vec<Category>>` — 카테고리가 0개일 때만 넣는다. 아니면 기존 목록을 돌려준다.
- Produces (`notes.rs`):
  - `list_month(conn, month) -> AppResult<Vec<CategoryNote>>`
  - `save(conn, month, category_id, note) -> AppResult<()>` — trim 후 비면 삭제, 아니면 upsert(`updated_at` 갱신)

- [ ] **Step 1: 실패하는 테스트 작성**

```rust
#[test] fn create_trims_and_rejects_duplicates_case_insensitive() { /* "식비 " 생성 → name "식비"; "식비" 다시 → duplicate_name */ }
#[test] fn last_category_cannot_be_deleted() { /* 1개만 있을 때 delete → last_category */ }
#[test] fn delete_in_use_without_target_fails() { /* 지출 1건 연결 → delete(id, None) → category_in_use, 데이터 그대로 */ }
#[test] fn delete_with_move_moves_expenses_and_merges_notes() {
    // A(지출 2건, 2026-11 메모 "a"), B(2026-11 메모 "b") → delete(A, Some(B))
    // B의 지출 2건, B 2026-11 메모 == "b\na", A 없음
}
#[test] fn delete_notes_only_category_cascades_notes() {}
#[test] fn seed_only_when_empty() {}
#[test] fn note_empty_deletes_row() {}
```

- [ ] **Step 2:** Run `cargo test --lib repo::categories repo::notes` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(repo): 카테고리·메모 저장소와 안전한 삭제"`

---

### Task 9: Rust 지출·무지출 저장소

**Files:**
- Create: `src-tauri/src/repo/expenses.rs`, `src-tauri/src/repo/days.rs`

**Interfaces:**
- Consumes: Task 7·8
- Produces (`expenses.rs`):
  - `list_range(conn, start: &str, end: &str) -> AppResult<Vec<Expense>>` — `ORDER BY date, created_at, rowid`
  - `add(conn: &mut Connection, e: NewExpense) -> AppResult<Expense>` — 검증 후 UUID를 붙여 저장하고, 같은 트랜잭션에서 그 날짜의 무지출 표시를 지운다.
  - `update(conn, u: ExpenseUpdate) -> AppResult<Expense>`
  - `delete(conn, id: &str) -> AppResult<()>`
  - 검증: 내용 trim 후 비어 있지 않을 것, 금액 0 이상 `99_999_999_999` 이하, 날짜 형식 `YYYY-MM-DD`. 아니면 `invalid_input`
- Produces (`days.rs`):
  - `list_no_expense(conn, start, end) -> AppResult<Vec<String>>`
  - `set_no_expense(conn: &mut Connection, date: &str, on: bool) -> AppResult<()>` — `on`인데 지출이 있으면 `day_has_expenses`

- [ ] **Step 1: 실패하는 테스트 작성**

```rust
#[test] fn add_clears_no_expense_mark_same_day() {}
#[test] fn cannot_mark_no_expense_when_expenses_exist() { /* → day_has_expenses */ }
#[test] fn rejects_unknown_category_and_bad_input() { /* category 999 → sqlite FK 오류는 not_found로 매핑; 금액 -1, 1e11 → invalid_input */ }
#[test] fn list_range_is_inclusive_and_ordered() {}
```

- [ ] **Step 2:** Run `cargo test --lib repo::expenses repo::days` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(repo): 지출과 무지출 저장소"`

---

### Task 10: Rust 고정 지출·설정 저장소

**Files:**
- Create: `src-tauri/src/repo/fixed.rs`, `src-tauri/src/repo/settings.rs`

**Interfaces:**
- Produces (`fixed.rs`):
  - `load(conn) -> AppResult<FixedData>` — 항목은 `sort_order` 순, 금액은 전체 월
  - `amounts_for_month(conn, month) -> AppResult<Vec<FixedAmount>>`
  - `save(conn: &mut Connection, items: Vec<FixedItem>, amounts: Vec<FixedAmount>) -> AppResult<()>` — 한 트랜잭션에서 전체를 교체한다. 목록에 없는 항목은 삭제(금액 CASCADE)한다. 이름 중복은 `duplicate_name`. 빈칸은 행 없음, `0`은 금액 0인 행으로 저장한다(설계 §8.2).
- Produces (`settings.rs`):
  - `load(conn) -> AppResult<Settings>` — 기본값 `{ 25, "macos", "system" }`
  - `set(conn, key: &str, value: &str) -> AppResult<()>` — 허용 키: `accounting_start_day`(1~31), `theme`(`macos`|`diary`|`mono`), `appearance`(`system`|`light`|`dark`). 그 밖은 `invalid_input`

- [ ] **Step 1: 실패하는 테스트 작성**

```rust
#[test] fn save_replaces_and_cascades_removed_items() {}
#[test] fn zero_amount_is_kept_distinct_from_blank() { /* amounts에 0 포함 → load 시 존재; 빠진 달은 없음 */ }
#[test] fn duplicate_fixed_names_rejected_and_nothing_changes() {}
#[test] fn settings_defaults_and_validation() { /* 기본값; set("accounting_start_day","32") → invalid_input */ }
```

- [ ] **Step 2:** Run `cargo test --lib repo::fixed repo::settings` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(repo): 고정 지출과 설정 저장소"`

---

### Task 11: Rust 백업·복원·가져오기·내보내기

**Files:**
- Create: `src-tauri/src/backup.rs`, `src-tauri/src/transfer.rs`

**Interfaces:**
- Consumes: Task 7~10
- Produces (`backup.rs`). 백업 파일명은 `budgetbook-YYYYMMDD-HHMMSS.db`(KST)다.
  - `create_backup(conn: &Connection, dir: &Path) -> AppResult<PathBuf>` — `VACUUM INTO`
  - `daily_backup(conn, dir) -> AppResult<Option<PathBuf>>` — 오늘(KST) 날짜 백업이 없을 때만 만들고, 이후 `prune(dir, 14)`
  - `prune(dir, keep: usize) -> AppResult<()>` — 파일명 기준 최신 `keep`개만 남긴다.
  - `list(dir) -> AppResult<Vec<BackupInfo>>` — 최신순. `expense_count`는 읽기 전용으로 열어 센다.
  - `restore(slot: &mut Option<Connection>, db_path: &Path, dir: &Path, file_name: &str) -> AppResult<()>` 순서:
    1. 현재 DB가 열려 있으면 백업한다.
    2. 연결을 닫는다(`slot.take()`).
    3. 백업 파일을 `db_path`로 복사하고, `-wal`·`-shm` 파일을 지운다.
    4. `db::open`으로 다시 열어 `slot`에 넣는다.
    - `file_name`은 `dir` 안의 파일명만 허용한다(경로 구분자 거부).
- Produces (`transfer.rs`):
  - `import_replace_all(conn: &mut Connection, p: ImportPayload) -> AppResult<ImportResult>` — 한 트랜잭션에서 실행한다.
    1. 모든 데이터 테이블을 비운다(settings는 유지).
    2. 카테고리를 넣으면서 `sourceId → 새 id` 대응표를 만든다.
    3. 지출(새 UUID), 무지출, 고정 항목·금액, 메모를 넣는다.
    4. `accounting_start_day`를 설정한다.
    - 실패하면 롤백한다.
  - `export_json(conn) -> AppResult<String>` — `{ "formatVersion": 1, "exportedAt", "settings", "categories", "expenses", "noExpenseDays", "fixedItems", "fixedAmounts", "notes" }`

- [ ] **Step 1: 실패하는 테스트 작성**

```rust
#[test] fn daily_backup_once_per_day_and_prune_keeps_14() { /* 이름만 다른 더미 20개 + 실행 → 14개 */ }
#[test] fn restore_replaces_data_and_backs_up_current() { /* 백업 시점 이후 추가한 지출이 복원 후 사라지고, 복원 전 상태가 새 백업으로 남음 */ }
#[test] fn restore_rejects_path_traversal() { /* "../x.db" → invalid_input */ }
#[test] fn import_maps_ids_and_replaces_everything() { /* 기존 데이터 → import → 기존 없음, 지출의 category_id가 새 id */ }
#[test] fn import_failure_rolls_back() { /* 두 번째 카테고리 이름이 첫 번째와 중복 → Err, 기존 데이터 그대로 */ }
#[test] fn export_contains_all_tables() {}
```

- [ ] **Step 2:** Run `cargo test --lib backup transfer` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat: 백업·복원과 가져오기·내보내기"`

---

### Task 12: Tauri 커맨드, 앱 상태, 메뉴, TS API 래퍼

**Files:**
- Create: `src-tauri/src/commands.rs`, `src-tauri/src/menu.rs`, `app/src/api/commands.ts`
- Modify: `src-tauri/src/lib.rs`
- Test: `app/src/api/commands.test.ts`, `src-tauri/src/commands.rs`(tests)

**Interfaces:**
- **`AppState`:** `{ db: Mutex<Option<Connection>>, db_path: PathBuf, backup_dir: PathBuf, open_error: Mutex<Option<String>> }`
- **setup:**
  1. `app_data_dir()/budgetbook.db`를 만든다(백업 폴더는 `backups/`).
  2. `db::open`에 성공하면 `daily_backup`을 실행한다. 백업 실패는 무시하고 로그만 남긴다.
  3. 열기에 실패하면 `open_error`에 기록한다.
- **커맨드** (Rust 이름 = TS 함수 이름의 snake_case. TS 인자는 camelCase). DB가 없으면 모두 `db_unavailable`:
  - `db_status() -> DbStatus`, `retry_open() -> DbStatus`, `bootstrap() -> Bootstrap`(`is_fresh` = 카테고리 0개)
  - `seed_default_categories(categories: Vec<NewCategory>) -> Vec<Category>`
  - `load_period(start, end, month) -> PeriodData`
  - `add_expense(input: NewExpense) -> Expense`, `update_expense(input: ExpenseUpdate) -> Expense`, `delete_expense(id) -> ()`
  - `set_no_expense_day(date, on) -> ()`
  - `create_category(name, color)`, `update_category(id, name, color) -> Category`, `category_usage(id) -> CategoryUsage`, `delete_category(id, move_to: Option<i64>) -> ()`
  - `save_note(month, category_id, note) -> ()`
  - `load_fixed() -> FixedData`, `save_fixed(items, amounts) -> ()`
  - `set_setting(key, value) -> ()`
  - `list_backups() -> Vec<BackupInfo>`, `restore_backup(file_name) -> ()`, `open_backup_folder() -> ()`(opener로 폴더 열기)
  - `read_text_file(path) -> String`, `import_replace_all(payload: ImportPayload) -> ImportResult`(실행 전 `create_backup`)
  - `export_json(path) -> ()`
- **메뉴** (`menu.rs`). 사용자 정의 항목은 앱 이벤트 `menu`로 `id` 문자열을 보낸다.
  - 가계부: 정보, `settings`(`CmdOrCtrl+,`), 구분선, 종료
  - 파일: `import`, `export`, `open-backups`
  - 편집: OS 기본 항목(undo, redo, cut, copy, paste, select all)
  - 보기: `prev-month`(`CmdOrCtrl+Left`), `next-month`(`CmdOrCtrl+Right`), `today`(`CmdOrCtrl+T`), `tab-day`(`CmdOrCtrl+1`), `tab-summary`(`CmdOrCtrl+2`)
- **`commands.ts`:**
  - 위 커맨드 각각에 대해 `export async function loadPeriod(start: DateStr, end: DateStr, month: MonthStr): Promise<PeriodData>` 같은 형태로 1:1 래퍼를 둔다. 타입은 Task 2·6과 같은 이름을 쓴다.
  - `models.rs`와 같은 필드(camelCase)의 응답 타입도 이 파일에서 export한다: `PeriodData`, `Bootstrap`, `DbStatus`, `NewExpense`, `ExpenseUpdate`, `CategoryUsage`, `FixedData`, `BackupInfo`, `ImportResult`
  - 실패하면 `ApiError extends Error { code: string }`을 던진다.
  - `onMenu(handler: (id: string) => void): Promise<() => void>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
it('커맨드 이름과 인자 표기', async () => {
  await deleteCategory(3, 5);  expect(invoke).toHaveBeenCalledWith('delete_category', { id: 3, moveTo: 5 });
  await saveNote('2026-11', 1, 'x'); expect(invoke).toHaveBeenCalledWith('save_note', { month: '2026-11', categoryId: 1, note: 'x' });
  await loadPeriod('2026-10-25', '2026-11-24', '2026-11'); expect(invoke).toHaveBeenCalledWith('load_period', { start: '2026-10-25', end: '2026-11-24', month: '2026-11' });
});
it('오류는 ApiError(code)', async () => {
  vi.mocked(invoke).mockRejectedValueOnce({ code: 'last_category', message: 'x' });
  await expect(deleteCategory(1, null)).rejects.toMatchObject({ code: 'last_category' });
});
```

```rust
#[test] fn commands_fail_with_db_unavailable_when_closed() { /* AppState db None → bootstrap_impl → db_unavailable */ }
```

커맨드 본문은 `fn xxx_impl(state: &AppState, ...)`로 분리해 테스트한다.

- [ ] **Step 2:** Run `npm test -- src/api` and `cargo test --lib commands` → FAIL
- [ ] **Step 3:** 구현하고 `invoke_handler`에 모두 등록한다.
- [ ] **Step 4:** Run 둘 다 → PASS. `npm run tauri dev`로 메뉴 4개가 보이고, 입력칸 없이도 편집 메뉴가 있는지 확인한다.
- [ ] **Step 5:** `git commit -m "feat: Tauri 커맨드, 앱 상태, macOS 메뉴"`

---

### Task 13: 스토어 (설정·장부)

**Files:**
- Create: `app/src/stores/settings.ts`, `app/src/stores/ledger.ts`
- Test: `app/src/stores/ledger.test.ts`, `app/src/stores/settings.test.ts`

**Interfaces:**
- Consumes: Task 2~6 domain, Task 12 `commands.ts`(테스트에서 `vi.mock('@/api/commands')`)
- Produces (`useSettingsStore`):
  - state: `accountingStartDay`, `theme`, `appearance`
  - actions: `load(s: Settings)`, `setStartDay(n)`, `setTheme(t)`, `setAppearance(a)` — 각각 `setSetting`을 호출한 뒤 반영한다.
- Produces (`useLedgerStore`):
  - state:
    - `ready`, `dbError: string | null`, `categories`, `viewMonth: MonthStr`, `period: Period`
    - `selectedDate: DateStr | null`, `activeTab: 'day' | 'summary'`, `data: PeriodData`, `today: DateStr`
    - `toast: string | null`, `saving: boolean`
  - getters: `dayCells`(→ `buildDayCells`), `summary`(→ `buildMonthSummary`), `sortedCategories`
  - actions:
    - `init()` — `dbStatus` → `bootstrap` → 처음이면 `seedDefaultCategories(DEFAULT_CATEGORIES)` → `viewMonth = accountMonthOf(today)` → 오늘 선택 + 날짜 탭 → `reload()`
    - `reload()`, `goPrev()`, `goNext()`, `goToday()`, `select(date)`, `setTab(t)`
    - `refreshToday()` — 날짜가 바뀌었으면 `today`를 갱신한다.
    - `onStartDayChanged(old, new)`
    - `addExpense(input): Promise<boolean>`, `updateExpense(u): Promise<boolean>`, `deleteExpense(id)`, `setNoExpense(date, on)`, `saveNote(categoryId, note)`
    - 쓰기 액션은 실패하면 `toast = MESSAGES.saveFailed`(또는 코드별 문구)로 두고 `false`를 돌려준다.

**규칙** (설계 §6.9, §6.6)
- **달 이동:** 선택한 날짜가 새 기간 밖이면 선택을 풀고 요약 탭으로 바꾼다.
- **시작일 변경:** 값이 실제로 바뀌었을 때만 오늘이 속한 회계월로 이동한다.
- **기본 카테고리:** `bootstrap.isFresh`일 때만 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('시작일 16, 오늘 11-15 → 회계월 2026-10, 오늘 선택, 날짜 탭 (ISSUE-01)', async () => { /* setNowProvider로 2026-11-15 KST 고정 */ });
it('처음 실행이면 기본 카테고리 8개를 넣는다', async () => {});
it('다음 달로 가면 기간 밖 선택이 풀리고 요약 탭', async () => {});
it('시작일이 같으면 보던 달 유지 (ISSUE-02)', async () => {});
it('자정이 지나면 오늘 갱신', () => { /* now를 다음 날 00:01 KST로 바꾸고 refreshToday() → today 변경 */ });
it('추가 실패 시 false와 저장 실패 문구', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/stores` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat: 설정·장부 스토어"`

---

### Task 14: 테마·화면 모드와 앱 골격

**Files:**
- Create: `app/src/styles/tokens.css`, `app/src/styles/themes/macos.css`, `diary.css`, `mono.css`, `app/src/composables/useAppearance.ts`, `app/src/components/AppShell.vue`, `app/src/components/Toast.vue`, `app/src/components/ErrorScreen.vue`
- Modify: `app/src/App.vue`, `app/src/main.ts`
- Test: `app/src/composables/useAppearance.test.ts`, `app/src/components/ErrorScreen.test.ts`

**Interfaces:**
- **CSS 변수 이름**(모든 테마가 정의): `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--accent`, `--danger`, `--sunday`, `--saturday`, `--today-ring`, `--selected-ring`, `--radius-card`, `--radius-chip`, `--space-1`~`--space-4`, `--font-ui`, `--shadow-sheet`
- **선택자:** `html[data-theme="macos"][data-appearance="dark"] { ... }` 형식. 테마 방향은 설계 §6.7, 금액은 `font-variant-numeric: tabular-nums`
- **`useAppearance()`:** settings 스토어를 보고 `<html>`에 `data-theme`·`data-appearance`(`light`|`dark`로 확정한 값)를 설정한다.
  - `system`이면 `matchMedia('(prefers-color-scheme: dark)')` 변경을 구독한다.
  - Tauri 창 테마를 `getCurrentWindow().setTheme(system ? null : 값)`으로 맞춘다.
- **`AppShell`:** `ledger.dbError`가 있으면 `ErrorScreen`, 없으면 메인 레이아웃 슬롯을 보여준다. 1분 주기와 창 포커스 시 `refreshToday()`를 호출한다.
- **`ErrorScreen`:** 버튼 `다시 시도`(`retryOpen` → 성공 시 `init`), `백업에서 복원`(백업 목록 → `restoreBackup`), `백업 폴더 열기`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('system + OS 다크 → data-appearance=dark, OS가 라이트로 바뀌면 즉시 light', () => {});
it('light 고정이면 OS 다크여도 light, 창 테마 setTheme("light")', () => {});
it('오류 화면에 세 버튼, 다시 시도 성공 시 init 호출', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/composables src/components/ErrorScreen.test.ts` → FAIL
- [ ] **Step 3:** 구현. 테마별 색 값은 실행자가 정하되, 설계 §6.7 방향과 각 테마 라이트·다크 모두에서 본문 대비 4.5:1 이상을 지킨다.
- [ ] **Step 4:** Run → PASS. `npm run tauri dev`에서 Windows 다크 모드 전환이 반영되는지 확인한다.
- [ ] **Step 5:** `git commit -m "feat: 테마 3종·화면 모드와 앱 골격"`

---

### Task 15: 메인 화면 — 상단 줄, 달력, 날짜 칸

**Files:**
- Create: `app/src/components/Toolbar.vue`, `app/src/components/CalendarGrid.vue`, `app/src/components/DayCell.vue`, `app/src/components/MainLayout.vue`
- Test: `app/src/components/CalendarGrid.test.ts`, `app/src/components/DayCell.test.ts`

**Interfaces:**
- Consumes: ledger 스토어(`period`, `dayCells`, `summary`, `today`, `selectedDate`, `select`, `goPrev/Next/Today`)
- **`Toolbar`:**
  - `< 2026년 11월 > [오늘] … [설정]`
  - 요약 한 줄: `지출 {variableTotal} 고정 {fixedTotal} 합계 {grandTotal}`
- **`CalendarGrid`:**
  - 요일 머리글(일 빨강·토 파랑 = `--sunday`/`--saturday`), `calendarLayout`에 따른 빈칸과 행 수
  - 키보드: 포커스 시 방향키로 선택 이동(기간 안에서만)
- **`DayCell`** — props: `cell: DayCellData`, `categories`, `isToday`, `isSelected`
  - 칩은 카테고리 색 배경에 `textColorFor` 글자색
  - `ResizeObserver`로 높이를 재고 `fitChips`로 개수를 정해 `+N건`을 표시한다.
  - 합계는 0이면 숨긴다. 무지출이면 칩 대신 도장(SVG 컴포넌트, 디자인은 실행자 몫)을 보여준다.
- **`MainLayout`:** 왼쪽 Toolbar + CalendarGrid, 오른쪽 320px `RightPanel` 자리(Task 16에서 채움)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('시작일 25, 2026-11: 첫 칸 25가 일요일 열, 31칸, 5행', () => {});
it('날짜 클릭 → select(date)', async () => {});
it('방향키 → 기간 안에서만 이동', async () => {});
it('칩 4개, 높이 부족 → 3개와 "+1건"', () => { /* ResizeObserver mock으로 높이 주입 */ });
it('무지출이면 도장만, 합계 없음; 오늘·선택 클래스', () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/CalendarGrid.test.ts src/components/DayCell.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS. `tauri dev`에서 기본 카테고리로 시작하는지, 오늘이 강조되는지 확인한다.
- [ ] **Step 5:** `git commit -m "feat(ui): 상단 줄, 달력, 날짜 칸"`

---

### Task 16: 오른쪽 패널 — 날짜 탭

**Files:**
- Create: `app/src/components/RightPanel.vue`, `app/src/components/DayTab.vue`, `app/src/components/ExpenseForm.vue`, `app/src/components/ExpenseRow.vue`, `app/src/components/ConfirmDialog.vue`
- Test: `app/src/components/DayTab.test.ts`, `app/src/components/ExpenseForm.test.ts`

**Interfaces:**
- **`RightPanel`:** 탭 `[11월 15일] [11월 요약]`, `ledger.activeTab`에 연결. 요약 탭 자리는 Task 17에서 채운다.
- **`ExpenseForm`:**
  - 내용 → 금액 → 분류 순서로 입력하고 Enter로 다음 칸·제출
  - 금액은 `formatAmountInput`으로 실시간 표기하고 `parseAmount`로 검증한다. 오류는 입력칸 아래에 `MESSAGES` 문구로 보여준다.
  - 제출 중(`saving`)에는 재제출을 무시한다.
  - 성공하면 내용·금액을 비우고 분류는 유지하며 내용 칸에 포커스한다.
  - `expose focusDescription()`
- **`ExpenseRow`:** 클릭하면 편집 상태(같은 검증, Enter 저장, Esc 취소). 삭제 버튼과 `⌫`은 `ConfirmDialog(MESSAGES.confirmDeleteExpense)` 뒤 삭제한다.
- **`DayTab`:**
  - 날짜 제목 `formatDayTitle`, 무지출 토글(지출이 있으면 비활성화하고 `MESSAGES.noExpenseBlocked` 안내)
  - 무지출이면 목록 대신 상태 문구, 지출 목록(입력 순서), 폼

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('검증 문구: 내용 없음/금액 abc/음수/분류 없음', async () => {});
it('성공 후 분류 유지, 내용 포커스', async () => {});
it('저장 중 재제출 무시', async () => { /* addExpense를 resolve 안 된 promise로 → Enter 두 번 → 호출 1회 */ });
it('지출 있으면 무지출 토글 비활성 + 안내', () => {});
it('행 편집 Esc 취소, Enter 저장 / 삭제 확인 후 삭제', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/DayTab.test.ts src/components/ExpenseForm.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(ui): 날짜 탭 — 지출 입력·수정·삭제, 무지출"`

---

### Task 17: 오른쪽 패널 — 요약 탭과 메모

**Files:**
- Create: `app/src/components/SummaryTab.vue`, `app/src/components/CategoryTotalRow.vue`
- Test: `app/src/components/SummaryTab.test.ts`

**Interfaces:**
- Consumes: `ledger.summary`, `ledger.period`, `ledger.saveNote`
- **화면:** 기간 `formatDateLong(start) ~ formatDateLong(end)`, 카테고리 행(색 점·이름·금액), 총 지출, 고정 지출 카드(클릭 → `emit('open-fixed')`), 월간 총 지출, `무지출 데이 N회`. 행이 없으면 `MESSAGES.emptyMonth`
- **메모:** 행 클릭으로 펼침·접힘, 한 번에 하나만 펼친다. 입력이 멈추고 500ms 뒤 `saveNote`, 접거나 포커스를 잃으면 즉시 저장한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('행·합계·무지출 횟수 표기 (51,450 / 555,000 / 606,450 / 1회)', () => {});
it('메모는 하나만 펼쳐짐', async () => {});
it('메모 디바운스: 연속 입력 후 500ms에 1회 저장', async () => { /* vi.useFakeTimers */ });
it('고정 지출 카드 클릭 → open-fixed', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/SummaryTab.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(ui): 요약 탭과 카테고리 메모"`

---

### Task 18: 고정 지출 시트

**Files:**
- Create: `app/src/components/Sheet.vue`, `app/src/components/FixedExpenseSheet.vue`
- Test: `app/src/components/FixedExpenseSheet.test.ts`

**Interfaces:**
- **`Sheet`:** 메인 창 위 모달. props `open`, `title`, emit `close`. Esc로 닫는다. 포커스는 시트 안에 가둔다.
- **`FixedExpenseSheet`** — props `startMonth: MonthStr`
  - 열 때 `loadFixed()` 결과를 복사해 편집한다.
  - 시트 안에서 이전·다음 달로 이동한다. 금액 칸 값은 문자열 상태로 보관한다(`''` = 빈칸, `'0'` = 0).
  - 이름 입력 줄 + Enter로 추가한다. 이름이 비면 `MESSAGES.fixedNameRequired`, 중복이면 `MESSAGES.fixedDuplicate`를 그 자리에 보여준다.
  - 삭제는 `confirmDeleteFixed` 확인 뒤 한다.
  - `지난달 금액 불러오기`는 이번 달 칸이 `''`인 항목만 직전 회계월 값으로 채운다.
  - 합계 미리보기를 보여준다.
  - `저장` → 검증(`fixedAmountInvalid(name)`) → `saveFixed` → `emit('saved')`. `취소`·Esc는 모두 버린다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('지난달 불러오기는 빈칸만 채우고 0은 유지', async () => {});
it('중복 이름은 입력 줄 아래에 표시', async () => {});
it('취소하면 saveFixed 호출 없음', async () => {});
it('저장 시 빈칸은 금액 행 없음, 0은 0으로 전달', async () => {});
it('잘못된 금액이면 항목 이름이 들어간 문구, 저장 안 함', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/FixedExpenseSheet.test.ts` → FAIL
- [ ] **Step 3:** 구현하고 요약 탭의 `open-fixed`에 연결한다. 저장하면 `ledger.reload()`
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(ui): 고정 지출 시트"`

---

### Task 19: 설정 시트 — 일반·카테고리

**Files:**
- Create: `app/src/components/SettingsSheet.vue`, `app/src/components/settings/GeneralTab.vue`, `app/src/components/settings/CategoriesTab.vue`, `app/src/components/settings/ColorPicker.vue`, `app/src/components/settings/CategoryDeleteDialog.vue`
- Test: `app/src/components/settings/GeneralTab.test.ts`, `app/src/components/settings/CategoriesTab.test.ts`

**Interfaces:**
- **`SettingsSheet`:** 탭 `일반 | 카테고리 | 데이터`(데이터는 Task 20)
- **`GeneralTab`:**
  - 시작일 1~31: 고르는 즉시 `이번 회계월: M/D ~ M/D` 미리보기(오늘 기준 `accountPeriod(accountMonthOf(today))`)를 보여준다. 적용은 `setStartDay` 후 `ledger.onStartDayChanged`
  - 테마 카드 3개(즉시 적용), 화면 모드 3개(시스템 따라감 / 라이트 / 다크)
- **`ColorPicker`:** 프리셋 8개, 팔레트 48개, HEX 입력. `normalizeHex` 결과로 미리보기를 바로 갱신하고(ISSUE-21), 무효이면 `MESSAGES.colorInvalid`. `v-model`은 `'#RRGGBB'`
- **`CategoriesTab`:**
  - 정렬된 목록. 선택하면 같은 영역에서 이름과 `ColorPicker`를 함께 편집해 저장한다(ISSUE-13).
  - 새 카테고리 추가. 중복이면 `MESSAGES.categoryDuplicate`
  - 삭제는 `categoryUsage`로 분기한다.
    - 아무 데도 안 쓰임 → 확인 후 삭제
    - 메모만 있음 → `confirmDeleteCategoryWithNotes` 확인 후 삭제
    - 지출이 있음 → `CategoryDeleteDialog`에서 옮길 카테고리를 골라 `deleteCategory(id, target)`
    - `last_category` 오류 → `MESSAGES.lastCategory`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('시작일 선택 시 미리보기, 적용 시 onStartDayChanged(old,new)', async () => {});
it('화면 모드 다크 선택 → setAppearance("dark")', async () => {});
it('HEX "333333" 입력 → 미리보기 #333333 즉시 반영', async () => {});
it('선택한 카테고리의 이름과 색을 함께 저장 (updateCategory 1회)', async () => {});
it('지출 있는 카테고리 삭제 → 옮길 대상 선택 후 deleteCategory(id, target)', async () => {});
it('마지막 카테고리 삭제 → lastCategory 문구', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/settings` → FAIL
- [ ] **Step 3:** 구현하고 상단 설정 버튼과 `settings` 메뉴 이벤트에 연결한다.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(ui): 설정 — 일반·카테고리"`

---

### Task 20: 설정 시트 — 데이터 (가져오기·내보내기·백업)

**Files:**
- Create: `app/src/components/settings/DataTab.vue`, `app/src/components/settings/BackupList.vue`
- Test: `app/src/components/settings/DataTab.test.ts`

**Interfaces:**
- **Consumes:** `parseWindowsData`, `readTextFile`, `importReplaceAll`, `exportJson`, `listBackups`, `restoreBackup`, `openBackupFolder`, `@tauri-apps/plugin-dialog`의 `open`/`save`
- **Windows 데이터 가져오기:**
  1. 파일을 선택하고(`*.json`) 읽어 변환한다.
     - `invalid-json`이면 `파일을 읽을 수 없어요. data.json 파일인지 확인해 주세요.`
     - `unsupported-format`이면 `가계부 데이터 형식이 아니에요.`
  2. 미리보기 건수와 미분류 건수를 보여준다.
  3. 현재 데이터에 지출이나 고정 지출이 있으면 `기존 데이터를 모두 지우고 가져옵니다. 가져오기 전에 자동으로 백업합니다.` 확인을 받는다.
  4. `importReplaceAll` → 결과 건수 표시 → `ledger.init()`
  - 안내 문구: `Windows의 %LOCALAPPDATA%\Household_account_Book\data.json 파일을 선택하세요.`
- **JSON으로 내보내기:** 저장 위치를 고르고(`가계부-YYYYMMDD.json`) `exportJson(path)`
- **백업:**
  - 목록: 날짜, 지출 건수
  - 복원: `이 백업으로 되돌립니다. 지금 데이터는 먼저 백업됩니다.` 확인 → `restoreBackup` → `ledger.init()`
  - 백업 폴더 열기
- **메뉴 이벤트:** `import`, `export`, `open-backups`를 이 탭의 동작에 연결한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('형식이 다른 파일이면 오류 문구, importReplaceAll 호출 없음', async () => {});
it('데이터가 있으면 전체 교체 확인 후 가져오기, 이후 init', async () => {});
it('복원 확인 후 restoreBackup(fileName), 이후 init', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/components/settings/DataTab.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat(ui): 설정 — 가져오기·내보내기·백업 복원"`

---

### Task 21: 단축키·메뉴 연결, 전체 점검, Mac 체크리스트

**Files:**
- Create: `app/src/composables/useShortcuts.ts`, `docs/mac-checklist.md`
- Modify: `app/src/App.vue`, `README.md`(실제 명령 확인 반영)
- Test: `app/src/composables/useShortcuts.test.ts`

**Interfaces:**
- **`useShortcuts()`:** `⌘N` → 선택한 날짜(없으면 오늘)를 선택하고 날짜 탭으로 바꾼 뒤 `ExpenseForm.focusDescription()`
  - 나머지 단축키(이전·다음 달, 오늘, 탭 전환, 설정)는 네이티브 메뉴 가속키가 `onMenu` 이벤트로 처리한다.
  - 입력칸에 포커스가 있을 때는 `⌘←`/`⌘→`를 가로채지 않는다(텍스트 이동 유지).
- **`App.vue`:** `onMenu` id를 스토어·시트 동작에 연결한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('메뉴 id → 동작 (prev-month, next-month, today, tab-day, tab-summary, settings)', () => {});
it('⌘N → 날짜 탭 + 내용 칸 포커스', async () => {});
```

- [ ] **Step 2:** Run `npm test -- src/composables/useShortcuts.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4: 전체 검증**

Run: `npm test` → 전체 PASS
Run: `cd src-tauri && cargo test --lib` → 전체 PASS
Run: `npm run build` → vue-tsc 타입 오류 0

`npm run tauri dev`에서 명세 §10.1 표의 각 행을 새 화면으로 직접 점검하고 결과를 작업 보고에 적는다. 확인 항목:
- 기본 카테고리
- 지출 추가·수정·삭제
- 무지출
- 메모
- 고정 지출(이월 버튼)
- 카테고리 삭제 이동
- 시작일 16으로 바꿔 오늘이 보이는지(ISSUE-01)
- 백업 생성(앱 데이터 폴더 `backups/`)
- 테마 3종 × 화면 모드 3종

- [ ] **Step 5: Mac 체크리스트 작성** — `docs/mac-checklist.md`
  1. Mac 준비: Xcode Command Line Tools(`xcode-select --install`), rustup, Node LTS 설치
  2. 빌드: `npm ci && npm run tauri build -- --target aarch64-apple-darwin`
  3. 실행 위치: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/가계부.app`
  4. 확인: 위 Step 4 항목에 더해 Mac에서만 확인되는 것
     - 편집 메뉴 ⌘C·⌘V
     - ⌘, / ⌘← / ⌘→ / ⌘T / ⌘1 / ⌘2
     - macOS 다크 모드 전환
     - 창 크기 복원
     - 데이터 위치 `~/Library/Application Support/com.budgetbook.desktop/`
     - Safari 엔진 렌더링(칩 넘침, 시트)
- [ ] **Step 6:** `git commit -m "feat: 단축키·메뉴 연결과 Mac 확인 체크리스트"`
