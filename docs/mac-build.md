# Mac 빌드·설치 가이드

Windows에서 개발한 가계부를 내 Mac(Apple Silicon, macOS 15 이상)에서 빌드해 설치하는 순서입니다. 서명·공증 없이 그 Mac에서 직접 빌드해서 씁니다.

설치한 뒤에는 [Mac 확인 체크리스트](mac-checklist.md)로 동작을 확인합니다.

## 1. 준비 (처음 한 번)

Mac의 터미널에서 실행합니다.

| 도구 | 설치 | 확인 |
|---|---|---|
| Xcode Command Line Tools | `xcode-select --install` | `xcode-select -p` |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` 실행 후 새 터미널 열기 | `cargo --version` |
| Node.js 22 이상 (LTS) | [nodejs.org](https://nodejs.org)의 LTS 설치 파일 또는 `brew install node` | `node --version` |

- Xcode 앱 전체는 필요 없습니다. Command Line Tools만 있으면 됩니다.
- Rust는 Apple Silicon용(`aarch64-apple-darwin`)이 기본으로 설치됩니다.

## 2. 코드 옮기기

Windows의 저장소 폴더에서 아래 명령으로 zip을 만듭니다(PowerShell, Git Bash 어디서나 같음).

```bash
git -c core.autocrlf=false archive --format=zip -o budgetbook.zip HEAD
```

- 이 zip에는 git이 관리하는 파일만 들어갑니다. `node_modules`나 빌드 결과물은 빠집니다.
- `-c core.autocrlf=false`를 붙여야 줄바꿈이 Mac 형식(LF)으로 나갑니다.
- 저장소 폴더를 통째로 복사하지 마세요. Windows용 `node_modules`는 Mac에서 동작하지 않습니다. 작업 폴더의 git 연결 파일도 Mac에서는 깨집니다.

`budgetbook.zip`을 AirDrop, USB, 클라우드 드라이브 등으로 Mac에 옮긴 뒤 압축을 풉니다.

```bash
mkdir -p ~/Projects/budgetbook
cd ~/Projects/budgetbook
unzip ~/Downloads/budgetbook.zip
```

## 3. 빌드

```bash
cd ~/Projects/budgetbook/app
npm ci
npm run tauri build -- --target aarch64-apple-darwin --bundles app
```

- 첫 빌드는 Rust를 처음부터 컴파일하므로 몇 분 걸립니다. 다음부터는 빨라집니다.
- `--bundles app`은 `.app`만 만듭니다. 개인용이라 설치 파일(`.dmg`)은 필요 없습니다. DMG를 만드는 단계는 Finder 제어 권한을 묻거나 실패하는 경우가 있습니다.

빌드가 끝나면 아래 위치에 앱이 생깁니다.

```
app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/가계부.app
```

## 4. 설치와 실행

```bash
cp -R src-tauri/target/aarch64-apple-darwin/release/bundle/macos/가계부.app /Applications/
open /Applications/가계부.app
```

Finder에서 `가계부.app`을 응용 프로그램 폴더로 끌어다 놓아도 됩니다.

- 같은 Mac에서 빌드한 앱이라 Gatekeeper가 막지 않습니다.
- 처음 실행하면 기본 카테고리 8개가 만들어집니다.

## 5. 데이터 위치

| 내용 | 위치 |
|---|---|
| DB | `~/Library/Application Support/com.budgetbook.desktop/budgetbook.db` |
| 자동 백업 | 같은 폴더의 `backups/` (하루 1회, 최근 14개 보관) |

- 앱 메뉴의 **파일 → 백업 폴더 열기**로 바로 열 수 있습니다.
- 앱을 지우거나 다시 설치해도 이 폴더의 데이터는 그대로 남습니다.
- DB 파일을 손으로 복사하거나 바꾸지 마세요. 백업 복원은 앱 안의 **설정 → 데이터 → 자동 백업**에서 합니다.

## 6. Windows 버전 데이터 가져오기 (선택)

Windows 버전의 `data.json`이 있으면 **파일 → Windows 데이터 가져오기…** 메뉴나 **설정 → 데이터 → 가져오기…**로 불러옵니다.

- 지금 데이터를 모두 지우고 가져온 데이터로 바꿉니다.
- 바꾸기 전에 자동으로 백업합니다.

## 7. 업데이트

Windows에서 고친 코드를 다시 반영하는 순서입니다.

1. Windows에서 2번과 같이 새 zip을 만듭니다.
2. Mac에서 기존 폴더를 지우고 새로 압축을 풉니다. 예전 폴더를 지우면 다음 빌드가 처음부터 컴파일되므로 몇 분 걸립니다.
3. 가계부 앱을 종료합니다(⌘Q).
4. 3번 빌드와 4번 설치를 다시 합니다. `cp -R`로 덮어쓸 때는 먼저 `rm -rf /Applications/가계부.app`으로 지운 뒤 복사합니다.

데이터는 5번 위치에 따로 있어서 업데이트해도 유지됩니다.

## 8. 문제 해결

| 증상 | 해결 |
|---|---|
| `xcrun: error: invalid active developer path` | `xcode-select --install`로 Command Line Tools를 설치합니다. |
| `cargo: command not found` | Rust 설치 뒤 터미널을 새로 엽니다. 또는 `source "$HOME/.cargo/env"`를 실행합니다. |
| `npm ci`에서 `EBADENGINE`이나 Node 버전 오류 | Node.js 22 이상 LTS로 올립니다. |
| macOS 업데이트 뒤 빌드가 링크 오류로 실패 | `xcode-select --install`을 다시 실행하거나 소프트웨어 업데이트에서 Command Line Tools를 갱신합니다. |
| "손상되었기 때문에 열 수 없습니다" 또는 "확인되지 않은 개발자" | 다른 Mac에서 만든 앱을 복사해 온 경우입니다. 시스템 설정 → 개인정보 보호 및 보안에서 "그래도 열기"를 누르거나 `xattr -dr com.apple.quarantine /Applications/가계부.app`을 실행합니다. 같은 Mac에서 빌드했다면 생기지 않습니다. |
| 앱이 "가계부 데이터를 열 수 없어요" 화면으로 시작 | DB 파일을 지우거나 덮어쓰지 마세요. 화면의 **백업에서 복원**을 쓰거나, 화면 내용 그대로 알려 주세요. |
| 그 밖의 빌드 오류 | 터미널 출력의 마지막 30줄 정도를 그대로 알려 주세요. |
