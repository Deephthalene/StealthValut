#!/bin/bash
# StealthVault 실행 스크립트 (Bash/Git Bash)
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."

echo "Starting StealthVault..."
npx tauri dev
