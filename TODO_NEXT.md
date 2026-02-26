# StealthVault - 현재 상태 & 로드맵

> Gemini 기획 대화 + 현재 코드 분석 기반 정리
> 2026-02-26 기준 (최신 반영)

---

## 핵심 철학 (잊지 말 것)

```
"목록은 DB로 빠르게, 파일은 청크로 안전하게"
"리스트 5억 개여도 텍스트만 읽어서 즉시. 복호화는 뷰어에서만."
"개발자도 모른다. 서버도 없다. 니 하드디스크는 니 것이다."
```

---

## 현재 구현 완료된 것 (1단계 MVP + Phase 2~3, 6)

| #   | 기능                                                            | 상태                    |
| --- | --------------------------------------------------------------- | ----------------------- |
| 1   | Tauri + Rust + React 프로젝트 구조                              | 완료                    |
| 2   | 비밀번호 → Argon2 KDF → DEK 생성 (평문 저장 안 함)              | 완료                    |
| 3   | 복구 키(Mnemonic) 1회 발급 + 비밀번호 재설정                    | 완료                    |
| 4   | 5GB 무료 Quota 제한 (check_quota)                               | 완료                    |
| 5   | AES-256-GCM 파일 암호화/복호화                                  | 완료 (청크+레거시 공존) |
| 6   | 파일명 UUID 해시화 + `.dat` 확장자 위장                         | 완료                    |
| 7   | 원본 zero-fill 삭제 (secure_delete)                             | 완료                    |
| 8   | SQLite 메타데이터 (original_name, original_path 암호화)         | 완료                    |
| 9   | files_index 평문 인덱스 테이블 (리스트용)                       | 완료                    |
| 10  | 구글 드라이브 스타일 UI + 폴더 트리                             | 완료                    |
| 11  | 드래그앤드롭 입고/출고                                          | 완료                    |
| 12  | 썸네일 생성 (이미지/오디오/비디오) + DB 저장                    | 완료 (RGBA 버그 수정됨) |
| 13  | header_encrypted (헤더 분리·DB 저장·물리 더미 대체)             | 완료                    |
| 14  | 이용약관 동의 화면                                              | 완료                    |
| 15  | 금고 저장 위치 선택 (C: 외 다른 드라이브 가능)                  | 완료                    |
| 16  | VaultGate DEK 검증 + ErrorBoundary                              | 완료                    |
| 17  | list_files 즉시 반환 (backfill 분리)                            | 완료                    |
| 18  | 파일 카드 UI 개선 (정사각형 썸네일, 오버레이 호버)              | 완료                    |
| 19  | 청크 단위 암호화 (encrypt_file_chunked, decrypt_range)          | 완료                    |
| 20  | stream 프로토콜 (Range 지원, 시크 재생)                         | 완료                    |
| 21  | 전용 뷰어 (이미지/오디오/비디오/문서) + stream 연동             | 완료                    |
| 22  | list_files_page / list_files_paged (백엔드 페이징 API)          | 완료                    |
| 23  | created_at_enc, mime_type 암호화 (Phase 6)                      | 완료                    |
| 24  | 다중 선택 이동 (이동 버튼 + bulk move modal)                    | 완료                    |
| 25  | change_folder_parent API (폴더 부모 변경)                       | 완료                    |
| 26  | 포인터 기반 커스텀 드래그 (탐색기→앱 + 앱 내 이동 공존)         | 완료                    |
| 27  | 사이드바 폴더 드롭 존 (메인→사이드바 이동)                      | 완료                    |
| 28  | @tanstack/react-virtual 행 단위 그리드 가상화                   | 완료                    |
| 29  | 마우스 뒤로/앞으로 버튼 네비게이션 (히스토리 통합·연타 방지)    | 완료                    |
| 30  | 구매 요청 이메일 발송 (Naver SMTP, purchase_email.rs 고정 계정) | 완료                    |

---

## 미구현 & 나아가야 할 방향

### Phase 2: 전용 뷰어 + 청크 암호화 — ✅ 완료

- **2-1 청크 암호화**: `crypto.rs`에 `encrypt_file_chunked`, `decrypt_chunk_at`, `byte_to_chunk` 구현. 업로드 시 청크 저장, 레거시 전체 암호화와 포맷 구분.
- **2-2 stream 프로토콜**: `lib.rs`에 `stream` URI 스킴 등록, Range 헤더 파싱 → `decrypt_range` / `decrypt_range_legacy`로 해당 구간만 복호화 후 반환.
- **2-3~2-5 뷰어**: ImageViewer, AudioPlayer, VideoPlayer, DocumentViewer 구현. 오디오/비디오는 `convertFileSrc(id, 'stream')`로 스트리밍. 이미지/문서도 뷰어에서 복호화 후 표시.
- **추후**: MKV/HEVC 등은 FFmpeg 트랜스코딩 검토.

### Phase 3: header_encrypted — ✅ 완료

- 업로드 시 원본 앞 1~8KB 분리 → AES-GCM 암호화 후 DB `header_encrypted` 저장.
- 물리 파일 앞부분은 랜덤 더미로 대체 후 청크 암호화.
- 복호화/스트림 시 DB 헤더 복호화 + 물리 본문 합쳐서 원본 복원. (`vault_files.rs` 전반 사용)

### Phase 4: Virtual List + 페이징 — ✅ 완료

- 백엔드: `list_files_page`, `list_files_count`, `list_files_paged`로 정렬·페이징 구현.
- 프론트: VaultPage에서 `list_files_paged` + 무한 스크롤, VaultContentGrid에서 `@tanstack/react-virtual` 행 단위 그리드 가상화 적용.

### Phase 5: 파일 인터랙션 강화 — ✅ 완료

- 더블클릭/클릭 → 전용 뷰어 열기, 우클릭 컨텍스트 메뉴, 다중 선택(Ctrl/Shift), 드래그 폴더 이동, 정렬(이름/날짜/크기/종류), 검색 — 모두 구현됨.
- **추가**: 다중 선택 시 "이동" 버튼 → 모달에서 대상 폴더 선택 후 일괄 이동.
- **추가**: 포인터 기반 커스텀 드래그 (Tauri 기본 드래그와 공존) — 탐색기→앱 업로드 + 앱 내 파일/폴더 이동 둘 다 지원. 드래그 중 "N개 항목 이동 중..." 배지 표시.
- **추가**: 메인 그리드 → 사이드바 폴더/내 드라이브로 드롭하여 이동.
- **추가**: 마우스 뒤로/앞으로 버튼 네비게이션 — 히스토리 ref 기반, 사이드바·브레드크럼·그리드 통합, 300ms 연타 방지.

### Phase 6: 추가 메타데이터 암호화 — ✅ 완료

| 필드               | 상태                          |
| ------------------ | ----------------------------- |
| `original_name`    | 완료                          |
| `original_path`    | 완료                          |
| `created_at`       | 완료 (created_at_enc)         |
| `mime_type`        | 완료 (암호화 저장)            |
| `files_index` 전체 | 평문 (SQLCipher 등 추후 고려) |

### Phase 7: 안티 포렌식 강화 — ✅ 완료 (Jump Lists만 Tauri 미지원)

- [x] 앱 종료 시 메모리에서 DEK 제로아웃(Zeroing) — `key_cache.rs`의 `zeroize_key` + `clear_dek`로 잠금 시 완전 삭제
- [x] SQLite WAL 비활성화 — `db.rs`, `folders.rs`, `vault_files.rs` 모두 `PRAGMA journal_mode=DELETE` 적용 (`.wal`/`.shm` 흔적 없음)
- [x] 릴리즈 빌드 난독화 — `Cargo.toml`: `strip=true`, `opt-level=z`, `lto=true`, `codegen-units=1` / `vite.config.ts`: `sourcemap: false`
- [x] 썸네일 캐시 방어 — `thumbnails.rs`의 `secure_remove`로 zero-fill 후 삭제, Windows `FILE_FLAG_DELETE_ON_CLOSE | FILE_ATTRIBUTE_TEMPORARY | FILE_ATTRIBUTE_HIDDEN` 플래그
- [x] 임시 복호화 파일 RAM 전용 — stream 프로토콜 + ZIP 해제 메모리 처리 (`vault_move_file_from_bytes`)
- [ ] 윈도우 최근 사용 항목 / Jump Lists — Tauri 자체 미지원, 추후 Win32 API 직접 호출 검토

### Phase 8: 스텔스 UX

- [ ] 시스템 트레이 숨기기 (앱 닫아도 트레이에, 단축키로 복원)
- [ ] Panic 버튼 (Alt+~ → 앱 즉시 숨김, 엑셀/브라우저로 전환)
- [ ] 페이크 모드 (가짜 비밀번호 → 빈 폴더 or 메모장 화면)
- [ ] 앱 아이콘/이름 위장 ("시스템 클리너" 등)

### Phase 9: 유료화 (Pro) — [docs/LICENSE_AND_PATH_CHANGE.md](docs/LICENSE_AND_PATH_CHANGE.md)

- [ ] **저장 위치 변경** (설정 화면) — 우선 구현
  - 기존 금고 폴더 전체(.vault_config, vault.db, data/, license.dat)를 새 경로로 잘라내기
  - 같은 드라이브: rename / 다른 드라이브: 복사 → 검증 → 삭제
  - .vault_location 갱신, 앱 재시작 안내
- [ ] Ed25519 비대칭 라이선스 키 시스템
  - 개발자 개인키로 서명 → 앱에 공개키로 검증, 서버 불필요
  - license.dat는 금고 경로 내 저장 (경로 변경 시 함께 이동)
- [ ] 5GB 제한 해제 (프리미엄) → load_license 결과로 용량 제한 분기
- [ ] 멀티 금고 (업무용, 취미용 분리) — 추후
- [ ] DLsite, BOOTH 등 일본 시장 배포 — 추후

### Phase 10: 고급 기능 (미래)

- [ ] 가상 드라이브 마운트 (게임/EXE 실행용 V: 드라이브)
- [ ] APK 에뮬레이터 연동
- [ ] 자막(SRT/SMI) 지원 비디오 플레이어
- [ ] 코드 사이닝 (Code Signing) → 백신 오진 방지
- [ ] Rust 코드 난독화 (Obfuscation) → 크랙 방지

### Phase 11: 모바일 빌드 & 최적화

- [ ] Tauri Mobile(Android/iOS) 빌드 파이프라인 정리 (`tauri build --target` 등)
- [ ] 모바일 전용 레이아웃 (터치 최적화 네비게이션, 사이드바 축소/슬라이드 인)
- [ ] 작은 화면에서의 Vault 그리드/뷰어 UX 튜닝 (핀치 줌, 제스처 기반 닫기·넘기기)
- [ ] 배터리·발열 고려한 썸네일/스트리밍 품질 옵션
- [ ] 모바일 스토리지 권한 / 백업(클라우드 드라이브 연동 등) 전략 설계

### Phase 12: 파일 내보내기 & PC 간 이관

- [ ] 금고 전체/폴더/선택 파일을 **암호화된 아카이브**로 Export → 다른 PC에서 Import
- [ ] A 컴퓨터에서 B 컴퓨터로 옮길 때, DEK/복구키 호환성 및 버전 업그레이드 경로 정의
- [ ] 내보내기 시 **로그/윈도우 흔적 최소화** (임시 파일 위치·수명 관리)
- [ ] 대용량 전송을 위한 분할 아카이브(예: 4GB 단위) 및 무결성 체크섬

---

## 남은 작업 (우선순위)

> Phase 1~7은 모두 완료. Phase 8~9부터 미구현.

### 0순위 — Phase 9 일부: 저장 위치 변경 & 라이센스 — ✅ 코드 완료, 🔑 키 설정 필요

**저장 위치 변경 (`change_vault_location`)** — ✅ 완료

- `vault_location.rs`: 빈 경로 확인 → 용량 검사 → 복사 → 검증 → 기존 삭제 → `.vault_location` 갱신
- `lib.rs`: `change_vault_location` Tauri 커맨드 등록
- `SettingsPage.tsx`: 현재 경로 표시, [변경] → 폴더 선택 → 확인 모달 → 로딩 → 완료

**라이센스 시스템** — ✅ 코드 완료, 🔑 공개키 설정 필요

- `license.rs`: `verify_license` / `save_license` / `load_license` 구현
- `lib.rs`: `verify_and_activate_license`, `get_license_status`, `send_purchase_request` 커맨드
- `check_quota`: `load_license() = Ok(Some)` → 5GB 제한 해제
- `SettingsPage.tsx`: 구매 요청 모달 + 라이센스 활성화 모달
- `purchase_email.rs`: Naver SMTP로 구매 요청 메일 발송 (발신/수신 주소 코드 고정)
- `Cargo.toml`: `ed25519-dalek`, `sha2`, `data-encoding`, `lettre`, `chrono` 등 의존성 추가

⚠️ **배포 전 필수: 키페어 생성 & 하드코딩**

1. `tools/keygen/` — Cargo.toml + main.rs 작성 (실제 바이너리 미구현)
2. `cargo run` → 개인키는 별도 보관, 공개키 32바이트 복사
3. `license.rs` `PUBLIC_KEY_BYTES` 에 실제 공개키 삽입
4. 현재는 `[0u8; 32]` 상태 → 모든 라이센스 검증 실패

### 1순위 — Phase 9: keygen 바이너리 구현 (남은 작업)

| 작업                             | 비고                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `tools/keygen/Cargo.toml` 작성   | `ed25519-dalek`, `sha2`, `data-encoding`, `clap` 의존성 |
| `tools/keygen/src/main.rs` 작성  | `--email`, `--tier` 인자 → 서명 → Base32 키 출력        |
| 공개키를 `license.rs`에 하드코딩 | `PUBLIC_KEY_BYTES = [실제 32바이트]`                    |
| 개인키 안전 보관                 | 앱 repo에 절대 커밋 금지                                |

### 2순위 — Phase 8: 스텔스 UX

| 기능                 | 방법                                                       | 상태   |
| -------------------- | ---------------------------------------------------------- | ------ |
| 시스템 트레이 숨기기 | `tauri-plugin-tray` + `window.hide()`, 단축키로만 복원     | 미구현 |
| Panic 버튼           | `tauri-plugin-global-shortcut` → Alt+~ 누르면 앱 즉시 숨김 | 미구현 |
| 페이크 모드          | 두 번째 비밀번호 → 빈 폴더 or 메모장 화면 표시             | 미구현 |
| 앱 아이콘/이름 위장  | `tauri.conf.json` productName / icon 변경                  | 미구현 |

### 3순위 — Phase 12: PC 간 이관

| 기능                                           | 상태   |
| ---------------------------------------------- | ------ |
| 금고 전체/폴더/파일 → 암호화 아카이브 Export   | 미구현 |
| 다른 PC에서 Import (DEK 호환, 버전 업그레이드) | 미구현 |
| 분할 아카이브 (4GB 단위) + 체크섬              | 미구현 |

### 이후 — Phase 11 모바일 / Phase 10 고급 기능 — 추후

---

## 배포 전 체크리스트

- [ ] **keygen 바이너리 구현** → 공개키 `license.rs`에 하드코딩 (최우선)
- [ ] 이용약관 신고 연락처 `[추후 기재]` → 실제 이메일 기입
- [x] 구매 안내 모달 계좌번호/은행명 기입 (신한은행 110-444-226804 반영됨)
- [ ] `tauri.conf.json` productName, identifier 확정
- [ ] 코드 사이닝 인증서 구매 (백신 오진 방지)
- [ ] 릴리즈 빌드 로컬 테스트 (Windows 10/11 클린 환경)

---

## 참고: 아키텍처 원칙

```
files_index (평문 DB)     →  리스트 표시용. SELECT만. 즉시 반환.
files (암호화 DB)         →  암호화된 메타데이터 + 썸네일.
data/*.dat (암호화 파일)  →  실제 암호화된 파일. 뷰어에서만 접근.

리스트 로딩 = files_index SELECT (0.01초)
파일 보기   = 전용 뷰어에서 청크 복호화 (넷플릭스 방식)
썸네일      = 업로드 시점에만 생성, files_index에 평문 저장
```
