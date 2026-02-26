# StealthVault – 놓친 부분 / 미구현 / 보완 필요 항목 총정리

> 대화·피드백·STEALTHVAULT_DEV_TASKS.md 종합 정리
> 2026-02-26 기준 (코드 검증 반영)

---

## 1. 보안·Stealth 설계 (원래 계획 vs 현재)

### 1.1 header_encrypted (헤더 변조) — ✅ 구현 완료

| 항목             | 설계                        | 현재                                          | 상태   |
| ---------------- | --------------------------- | --------------------------------------------- | ------ |
| 원본 헤더 분리   | 1~8KB 잘라서 암호화         | 1~8KB 분리                                    | 구현됨 |
| DB 저장          | `header_encrypted` BLOB     | 저장                                          | 구현됨 |
| 물리 파일 앞부분 | 더미/랜덤 데이터로 덮어쓰기 | 랜덤 더미+청크 본문                           | 구현됨 |
| 복호화 시        | DB 헤더 + 본문 합쳐서 전달  | decrypt_file_full, decrypt_range 등 전반 사용 | 구현됨 |

- **현재**: 업로드 시 헤더 분리 → DB 암호화 저장, 물리 파일은 더미+청크 암호화. 스트리밍·전체 복호화 모두 header_encrypted 연동됨.

### 1.2 메타데이터 암호화 — ✅ 구현 완료

| 필드            | 설계 (STEALTHVAULT_DEV_TASKS) | 현재                       | 상태   |
| --------------- | ----------------------------- | -------------------------- | ------ |
| `original_name` | 암호화 저장                   | ENC:+base64 저장           | 구현됨 |
| `original_path` | 암호화 저장                   | ENC:+base64 저장           | 구현됨 |
| `created_at`    | 암호화 또는 난독화            | created_at_enc (암호화)    | 구현됨 |
| `mime_type`     | 암호화                        | 암호화 저장 (files 테이블) | 구현됨 |

- **구현 위치**: `vault_files.rs` 업로드 시 `encrypt_field`로 저장, list_files_page 등에서 `decrypt_created_at` 등으로 복호화.

### 1.3 확장자 위장 (Gemini 피드백)

| 설계/피드백                                 | 현재          | 상태   |
| ------------------------------------------- | ------------- | ------ |
| `.enc` 대신 `.dat`, `.bin` 또는 확장자 없음 | `{uuid}.dat`  | 적용됨 |
| "금고 느낌" 제거                            | `.dat`로 위장 | 적용됨 |

---

## 2. 파일 입고(Deposit) 관련

### 2.1 파일 이동 방식 (Gemini 피드백)

| 권장                                      | 현재                              | 상태   |
| ----------------------------------------- | --------------------------------- | ------ |
| 같은 드라이브: `fs::rename`으로 즉시 이동 | rename 실패 시 copy+secure_delete | 구현됨 |

- **효과**: 같은 드라이브에서는 rename이 더 빠르고 원자적

### 2.2 원본 삭제 방식 (STEALTHVAULT_DEV_TASKS 3.5)

| 설계                                  | 현재            | 상태   |
| ------------------------------------- | --------------- | ------ |
| 제로 필(Zero-fill) 삭제로 포렌식 방지 | `secure_delete` | 구현됨 |

- **의도**: 삭제 후에도 디스크에 원본 데이터 잔여 가능성 → 제로 필로 덮어쓰기

### 2.3 청크 단위 암호화 (STEALTHVAULT_DEV_TASKS 10.2) — ✅ 구현 완료

| 설계                                | 현재                                                 | 상태   |
| ----------------------------------- | ---------------------------------------------------- | ------ |
| AES-256-GCM 청크 단위 (메모리 효율) | encrypt_file_chunked, decrypt_range, stream 프로토콜 | 구현됨 |

- **구현**: `crypto.rs`에 `encrypt_file_chunked`, `decrypt_chunk_at`, `byte_to_chunk`. 업로드 시 청크 저장, `lib.rs` stream 프로토콜에서 Range 요청 시 해당 구간만 복호화.

---

## 3. 금고 저장소 형태 (STEALTHVAULT_DEV_TASKS 3.4)

| 설계                             | 현재                                  | 상태                     |
| -------------------------------- | ------------------------------------- | ------------------------ |
| `vault.data` 형태 단일 파일      | `vault.db` + `data/` 폴더에 개별 파일 | 폴더+파일 구조           |
| Sparse file로 실제 사용량만 점유 | 일반 파일                             | 미구현                   |
| 시스템 파일처럼 위장 저장        | AppData/Local/StealthVault 경로       | 경로는 위장, 형태는 아님 |

---

## 4. UI·성능 (5TB 시나리오 대비)

### 4.1 Virtual List / Lazy Loading (STEALTHVAULT_DEV_TASKS 3.7, 10.1) — ✅ 완료

| 설계                                | 현재                                   | 상태 |
| ----------------------------------- | -------------------------------------- | ---- |
| 페이징 API (Offset/Limit)           | list_files_page, list_files_paged      | 완료 |
| 수만 개 파일 렉 없이 목록 표시      | list_files_paged + 무한 스크롤         | 완료 |
| Virtual List (화면에 보이는 부분만) | @tanstack/react-virtual 행 단위 그리드 | 완료 |

- **구현**: VaultPage에서 `list_files_paged` 호출, VaultContentGrid에서 `useVirtualizer`로 행 단위 가상화.

### 4.2 전용 뷰어·플레이어 (STEALTHVAULT_DEV_TASKS 4.1) — ✅ 구현 완료

| 항목             | 설계                                | 현재                                                    | 상태   |
| ---------------- | ----------------------------------- | ------------------------------------------------------- | ------ |
| 사진/동영상/문서 | 앱 내장 뷰어                        | ImageViewer, VideoPlayer, DocumentViewer                | 구현됨 |
| 스트리밍         | Range 청크 복호화 + custom_protocol | stream 프로토콜 (lib.rs), convertFileSrc(..., 'stream') | 구현됨 |
| 오디오           | 미니 플레이어 + 스트리밍            | AudioPlayer (하단 미니 플레이어)                        | 구현됨 |
| EXE/게임         | 폴더 단위 가상 드라이브 마운트      | 없음                                                    | 미구현 |
| 윈도우 흔적      | 최근 항목·Jump Lists 등 미기록      | -                                                       | 미구현 |

---

## 5. 스텔스·UX (Gemini / STEALTHVAULT_DEV_TASKS 4.2) — Phase 8 미구현

| 항목          | 설계/피드백                                      | 현재 | 상태   |
| ------------- | ------------------------------------------------ | ---- | ------ |
| 트레이 최소화 | 앱 닫아도 트레이에 숨기고 단축키로만 표시        | -    | 미구현 |
| Panic 버튼    | Alt+~ 글로벌 단축키 → 앱 즉시 숨김 + 포커스 이동 | -    | 미구현 |
| 페이크 모드   | 두 번째 비밀번호 → 빈 금고 or 메모장 화면        | -    | 미구현 |
| 가상 드라이브 | 실행 중에만 마운트, 종료 시 사라짐               | 없음 | 미구현 |

---

## 6. 추가 보안 (STEALTHVAULT_DEV_TASKS 4.4) — ✅ 대부분 완료

| 항목                         | 설계                  | 현재                                                               | 상태     |
| ---------------------------- | --------------------- | ------------------------------------------------------------------ | -------- |
| 앱 종료 시 키 제로아웃       | 메모리에서 키 Zeroing | `key_cache.rs`의 `zeroize_key` + `clear_dek` (잠금 시 byte 제거)  | ✅ 완료  |
| SQLite WAL 비활성화          | .wal/.shm 흔적 방지   | `db.rs`, `folders.rs`, `vault_files.rs` 모두 PRAGMA journal_mode=DELETE | ✅ 완료 |
| 썸네일 임시 파일 보호        | zero-fill + 삭제      | `thumbnails.rs` secure_remove, Windows FILE_ATTRIBUTE_TEMPORARY    | ✅ 완료  |
| 릴리즈 빌드 난독화           | 바이너리 스트립       | Cargo.toml strip/lto/opt-z, vite sourcemap:false                   | ✅ 완료  |
| 최근 사용·Jump Lists 방지    | 윈도우 기록 방지      | Tauri 미지원 (Win32 API 직접 호출 필요)                            | 미구현   |

---

## 7. 이미 구현된 것 (참고)

- Tauri + Rust + React 프로젝트 구조
- check_quota, 5GB 제한
- AES-256-GCM 파일 암호화/복호화
- SQLite 메타데이터 (평문)
- 파일 입고/출고 (이동 의미)
- 드래그앤드롭 (안쪽·바깥쪽)
- 썸네일 (암호화 전 생성, DB 저장, on-demand 보완)
- 비밀번호·복구키 기반 DEK/KEK
- AppData 경로 위장 (StealthVault 폴더)
- 구글 드라이브 스타일 UI, 폴더 트리

---

## 8. 구현 이력 & 우선순위 (현재 기준)

### 완료된 항목 (Phase 1~7)
1. **header_encrypted** (헤더 분리, 물리 파일 더미 대체) ✅
2. **메타데이터 암호화** (original_name, original_path, created_at_enc, mime_type) ✅
3. **확장자 위장** (`.dat` 위장) ✅
4. **원본 제로 필 삭제** (secure_delete) ✅
5. **같은 드라이브 fs::rename** (업로드 속도) ✅
6. **Virtual List / 페이징** (@tanstack/react-virtual 행 단위 가상화) ✅
7. **Phase 7 안티 포렌식** (DEK 제로아웃, WAL 비활성화, 빌드 난독화, 썸네일 캐시 방어) ✅

### 미구현 — 다음 단계 (Phase 8 우선)
- 트레이 숨기기 (`tauri-plugin-tray`)
- Panic 버튼 (`tauri-plugin-global-shortcut` + `window.hide()`)
- 페이크 모드 (두 번째 DEK 키 분기)
- 라이선스 키 시스템 (Ed25519, Phase 9)
- PC 간 암호화 아카이브 이관 (Phase 12)
