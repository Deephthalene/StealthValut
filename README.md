# StealthVault

로컬 암호화 파일 금고 앱

## 프로젝트 구조

```
stealthvault/
├── frontend/          # React + Vite UI
│   ├── src/
│   ├── package.json
│   └── ...
├── src-tauri/         # Rust 백엔드 (Tauri)
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json       # 루트 (통합 스크립트)
└── README.md
```

## 한 번에 설정

```bash
npm run install:all
```

## Cargo(PATH) 설정

Rust 설치 후 터미널에서 `cargo`를 찾지 못하면, 아래 중 하나를 실행하세요.

**PowerShell (권장):**

```powershell
npm run tauri:dev:ps1
```

**또는 PATH 수동 추가 후:**

```bash
# Git Bash - 현재 세션
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri:dev
```

**영구 설정:**
시스템 환경변수 `Path`에 `%USERPROFILE%\.cargo\bin` 추가

## 실행

### 데스크톱 앱 (Tauri + React 통합)

```bash
npm run tauri:dev
# 또는
npm run start
```

### 프론트엔드만 (웹)

```bash
npm run dev
# 또는
cd frontend && npm run dev
```

### 백엔드만 (Rust)

```bash
cd src-tauri && cargo build
```

## 스크립트

| 명령                  | 설명                                     |
| --------------------- | ---------------------------------------- |
| `npm run start`       | Tauri 데스크톱 앱 실행 (프론트 + 백엔드) |
| `npm run tauri:dev`   | 同上                                     |
| `npm run tauri:build` | 프로덕션 빌드                            |
| `npm run dev`         | 프론트엔드 개발 서버만                   |
| `npm run build`       | 프론트엔드 빌드만                        |
| `npm run install:all` | 루트 + frontend 의존성 설치              |
