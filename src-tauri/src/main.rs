// ============================================
// main.rs - 앱 진입점 (프로그램이 실행되면 여기서 시작)
// ============================================

// Release 빌드 시 Windows에서 콘솔 창 안 뜨게 함
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 실제 로직은 lib.rs의 run()에 있음
    stealthvault_lib::run()
}
