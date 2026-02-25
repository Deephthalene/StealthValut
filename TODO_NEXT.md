# StealthVault - 현재 상태 & 로드맵

> Gemini 기획 대화 + 현재 코드 분석 기반 정리
> 2025-02-25 기준 (코드 검증 반영)

---

## 핵심 철학 (잊지 말 것)

```
"목록은 DB로 빠르게, 파일은 청크로 안전하게"
"리스트 5억 개여도 텍스트만 읽어서 즉시. 복호화는 뷰어에서만."
"개발자도 모른다. 서버도 없다. 니 하드디스크는 니 것이다."
```

---

## 현재 구현 완료된 것 (1단계 MVP + Phase 2~3, 6)

| #   | 기능                                                    | 상태                    |
| --- | ------------------------------------------------------- | ----------------------- |
| 1   | Tauri + Rust + React 프로젝트 구조                      | 완료                    |
| 2   | 비밀번호 → Argon2 KDF → DEK 생성 (평문 저장 안 함)      | 완료                    |
| 3   | 복구 키(Mnemonic) 1회 발급 + 비밀번호 재설정            | 완료                    |
| 4   | 5GB 무료 Quota 제한 (check_quota)                       | 완료                    |
| 5   | AES-256-GCM 파일 암호화/복호화                          | 완료 (청크+레거시 공존) |
| 6   | 파일명 UUID 해시화 + `.dat` 확장자 위장                 | 완료                    |
| 7   | 원본 zero-fill 삭제 (secure_delete)                     | 완료                    |
| 8   | SQLite 메타데이터 (original_name, original_path 암호화) | 완료                    |
| 9   | files_index 평문 인덱스 테이블 (리스트용)               | 완료                    |
| 10  | 구글 드라이브 스타일 UI + 폴더 트리                     | 완료                    |
| 11  | 드래그앤드롭 입고/출고                                  | 완료                    |
| 12  | 썸네일 생성 (이미지/오디오/비디오) + DB 저장            | 완료 (RGBA 버그 수정됨) |
| 13  | header_encrypted (헤더 분리·DB 저장·물리 더미 대체)     | 완료                    |
| 14  | 이용약관 동의 화면                                      | 완료                    |
| 15  | 금고 저장 위치 선택 (C: 외 다른 드라이브 가능)          | 완료                    |
| 16  | VaultGate DEK 검증 + ErrorBoundary                      | 완료                    |
| 17  | list_files 즉시 반환 (backfill 분리)                    | 완료                    |
| 18  | 파일 카드 UI 개선 (정사각형 썸네일, 오버레이 호버)      | 완료                    |
| 19  | 청크 단위 암호화 (encrypt_file_chunked, decrypt_range)  | 완료                    |
| 20  | stream 프로토콜 (Range 지원, 시크 재생)                 | 완료                    |
| 21  | 전용 뷰어 (이미지/오디오/비디오/문서) + stream 연동     | 완료                    |
| 22  | list_files_page / list_files_paged (백엔드 페이징 API)  | 완료                    |
| 23  | created_at_enc, mime_type 암호화 (Phase 6)              | 완료                    |

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

### Phase 4: Virtual List + 페이징 — 백엔드·페이징 완료, DOM Virtual List 미구현

- 백엔드: `list_files_page`, `list_files_count`, `list_files_paged`로 정렬·페이징 구현.
- 프론트: VaultPage에서 `list_files_paged` 기반 **무한 스크롤 페이징**까지 적용 (DOM Virtual List는 레이아웃 문제로 롤백, 추후 재설계 필요).

### Phase 5: 파일 인터랙션 강화 — ✅ 완료

- 더블클릭/클릭 → 전용 뷰어 열기, 우클릭 컨텍스트 메뉴, 다중 선택(Ctrl/Shift), 드래그 폴더 이동, 정렬(이름/날짜/크기/종류), 검색 — 모두 구현됨.

### Phase 6: 추가 메타데이터 암호화 — ✅ 완료

| 필드               | 상태                          |
| ------------------ | ----------------------------- |
| `original_name`    | 완료                          |
| `original_path`    | 완료                          |
| `created_at`       | 완료 (created_at_enc)         |
| `mime_type`        | 완료 (암호화 저장)            |
| `files_index` 전체 | 평문 (SQLCipher 등 추후 고려) |

### Phase 7: 안티 포렌식 강화

- [ ] 앱 종료 시 메모리에서 DEK 제로아웃(Zeroing)
- [ ] 윈도우 최근 사용 항목 / Jump Lists 기록 방지
- [ ] 썸네일 캐시 폴더(AppData\Local\Microsoft\Windows\Explorer) 방어
- [ ] SQLite WAL 모드 관리 (.wal 파일에 흔적 남지 않도록)
- [ ] 임시 복호화 파일은 RAM에서만 (하드에 안 남기기)
- [ ] 데스크톱/모바일 **릴리즈 빌드 난독화** (JS 번들 소스맵 제거, Rust 심볼 strip·최적화, 필요 시 추가 Obfuscation)

### Phase 8: 스텔스 UX

- [ ] 시스템 트레이 숨기기 (앱 닫아도 트레이에, 단축키로 복원)
- [ ] Panic 버튼 (Alt+~ → 앱 즉시 숨김, 엑셀/브라우저로 전환)
- [ ] 페이크 모드 (가짜 비밀번호 → 빈 폴더 or 메모장 화면)
- [ ] 앱 아이콘/이름 위장 ("시스템 클리너" 등)

### Phase 9: 유료화 (Pro)

- [ ] Ed25519 비대칭 라이선스 키 시스템
  - 개발자 개인키로 서명 → 앱에 공개키로 검증
  - 서버 불필요
- [ ] 5GB 제한 해제 → 하드 전체 사용 가능
- [ ] 멀티 금고 (업무용, 취미용 분리)
- [ ] DLsite, BOOTH 등 일본 시장 배포

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

## 당장 할 것 (우선순위)

1. **프론트 Virtual List 연동**
   - VaultPage에서 `list_files_paged` + `list_files_count` 호출로 전환
   - `@tanstack/virtual` 또는 `react-window`로 화면에 보이는 항목만 렌더링, 스크롤 시 다음 페이지 로딩

2. **Phase 7 안티 포렌식** (선택)
   - 앱 종료 시 DEK 메모리 제로아웃
   - 윈도우 Jump List / 최근 문서 기록 방지

3. **Phase 8 스텔스 UX** (선택)
   - 트레이 숨기기, Panic 버튼, 페이크 모드 등

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
