<p align="center">
  <img src="assets/logo.svg" alt="CursorCine Logo" width="320" />
</p>

# CursorCine (Electron)

可在 Windows / Linux 執行的桌面錄影工具，特色是錄影畫面會跟隨游標自動縮放，並內建錄後剪輯時間軸，方便快速產出教學影片。

## Demo

[cursorcine-2026-02-09T08-28-13-836Z.webm](https://github.com/user-attachments/assets/02377999-0465-4cc0-adaf-bcf4a4d1b66f)

## 功能

- 錄製整個螢幕（可選多螢幕來源）
- 鏡頭自動跟隨游標移動，支援可調整的最大縮放倍率與平滑係數
- 單擊時暫時放大、雙擊時鎖定放大（可顯示雙擊標記）
- 輸出格式可選 `WebM` 或 `MP4`（`MP4` 會視環境自動 fallback）
- 錄製畫質與輸出畫質可分開設定（流暢 / 平衡 / 高畫質）
- 錄影中顯示即時錄製時間，輸出時顯示輸出執行時間
- 提供 HDR 補償（實驗）：強度、色相、高亮壓縮、清晰度
- 支援系統聲音 + 麥克風混音（含增益與動態壓縮）
- 錄影時可用畫筆即時標註（顏色、粗細、復原一筆、清空）
- 畫筆模式支援 Ctrl 切換與滾輪暫停後自動恢復（需全域 hook 可用）
- 停止錄影後自動進入剪輯時間軸，可回放區段、調整起訖點、儲存定稿
- 剪輯輸出引擎可選：`auto`（ffmpeg 優先）、`ffmpeg`、`builtin`
- 內建輸出 Debug 面板，顯示路徑、錯誤碼與 trace
- 錄製資料採用暫存檔串流寫入，長時間錄製可降低記憶體暴增風險
- Windows 實驗性 Native HDR->SDR 路由（Auto / Off / Force Native），含 Probe、Smoke 與自動回退
- HDR 診斷資訊可一鍵複製（包含 runtime route、probe、session/frame counters、fallback 原因）
- `auto` 匯出模式在 `ffmpeg` 失敗時，會改用內建輸出，並沿用第一次選擇的儲存路徑（不重複跳出存檔視窗）

## 錄製與輸出流程

1. 選擇錄製來源、格式、剪輯輸出引擎、錄製畫質、輸出畫質與音訊選項。
2. 按「開始錄影」，程式會建立即時預覽、游標跟隨縮放與畫筆疊層。
3. 錄影中會即時顯示錄製時間；按「停止錄製」後進入剪輯時間軸（播放位置、起點、終點）。
4. 按「儲存定稿」輸出剪輯片段：
   - 輸出期間會顯示輸出執行時間
   - `auto`: 先嘗試 `ffmpeg`，失敗自動改內建輸出
   - `ffmpeg`: 僅使用 `ffmpeg`
   - `builtin`: 僅使用內建輸出

## 開發執行

```bash
npm install
npm start
```

在 Windows PowerShell 若遇到 `npm` 指令被 execution policy 阻擋，請改用：

```powershell
npm.cmd install
npm.cmd start
```

## Windows Native HDR（實驗）

目前 Windows 版提供實驗性 Native HDR 路由（使用本機 Node-API addon + Electron IPC）：

- `Auto`：可用時走 Native；不可用時自動回退既有錄影
- `Off`：固定走既有錄影（fallback）
- `Force Native`：要求走 Native；若不可用則阻止開始

UI 提供：

- `Probe` 狀態（是否可用、是否疑似 HDR 螢幕）
- `Run Native Smoke`（快速驗證 start/read/stop）
- `Copy HDR Diagnostics JSON`（輸出目前判斷與統計）

注意：

- Linux 仍固定走 fallback 路由；Native HDR 路由目前僅支援 Windows。
- `hdr:shared-start` 會使用分級回退：`wgc-v1 -> native-legacy -> builtin-desktop`。
- 打包後執行檔預設啟用 Native 路由旗標；要停用可設：
  - `CURSORCINE_ENABLE_HDR_NATIVE_IPC=0`
  - `CURSORCINE_ENABLE_HDR_NATIVE_LIVE=0`
  - `CURSORCINE_ENABLE_HDR_WGC=0`
- 可指定預設路由偏好：
  - `CURSORCINE_HDR_ROUTE_PREFERENCE=auto|wgc|legacy`

## Windows 編譯 Native 模組需求

若要編譯 `native/windows-hdr-capture` 與 `native/windows-wgc-hdr-capture`，請先安裝：

1. Node.js（建議 LTS 或目前專案可用版本）
2. Python 3.11（建議 3.11.x；`node-gyp@9` 在 3.12 可能遇到 `distutils` 問題）
3. Visual Studio 2022 Build Tools，並勾選：
   - `Desktop development with C++`
   - `MSVC v143 x64/x86 build tools`
   - `Windows 10/11 SDK`
4. `ffmpeg`（非編譯必要，但匯出 `ffmpeg` 路徑需要）

編譯步驟（PowerShell）：

```powershell
npm.cmd install
npm.cmd run build:native-hdr-win
```

若看到 `MSB8020: 找不到 ClangCL 的建置工具 (平台工具集='ClangCL')`：

- `build:native-hdr-win` 會在 `node-gyp configure` 後自動把產生的 vcxproj toolset 固定為 `v143`，通常不需要安裝 ClangCL。
- 若仍出現 ClangCL 相關錯誤，先刪除 `native/windows-hdr-capture/build` 與 `native/windows-wgc-hdr-capture/build` 後重跑 `npm.cmd run build:native-hdr-win`。

啟動：

```powershell
npm.cmd start
```

## Dev Container 開發

本專案已提供 `.devcontainer/`，可在 VS Code / Cursor 的容器環境中直接執行 Electron（含音訊與螢幕相關依賴）。

使用方式：

1. 安裝 Docker。
2. 用 VS Code / Cursor 開啟專案後，執行「Reopen in Container」。
3. 首次建立容器會自動執行 `npm install`（由 `postCreateCommand` 設定）。
4. 在容器終端執行 `npm start` 啟動開發。

目前 devcontainer 內容重點：

- 以 `mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm` 為基底
- 預裝 Electron 常用系統套件與 `ffmpeg`
- 掛載音訊與顯示相關 socket（X11 / Wayland / PulseAudio）
- 設定 `ELECTRON_DISABLE_SANDBOX=1` 以降低容器中執行限制

若你修改了 `.devcontainer/Dockerfile` 或 `.devcontainer/devcontainer.json`，請執行「Rebuild Container」讓變更生效。

## 打包成執行檔

先安裝依賴：

```bash
npm install
```

通用打包（依當前系統產物）：

```bash
npm run dist
```

只打包 Windows 安裝檔（NSIS）：

```bash
npm run dist:win
```

`dist:win` 會自動先執行 `build:native-hdr-win`（透過 `predist:win`），不需手動先跑一次 native 編譯。
若在 Linux/WSL 執行 `dist:win` 且未安裝 `wine`，前置檢查會直接提示並中止。

只打包 Linux 安裝檔（AppImage + deb）：

```bash
npm run dist:linux
```

產物會輸出到 `dist/` 目錄。

## CI 與供應鏈檢查

GitHub Actions workflow（`.github/workflows/build.yml`）目前包含供應鏈檢查：

- `pull_request` 會執行 `actions/dependency-review-action`，阻擋高風險依賴與禁止授權（AGPL/GPL）。
- `push` / `workflow_dispatch` 會執行 `npm audit --omit=dev --audit-level=high`。
- 只有供應鏈檢查通過後，才會繼續版本變更判斷與 build/release 流程。
- Windows runner 會先設定 `Python 3.11` 與 `GYP_MSVS_VERSION=2022`，並使用 `scripts/build-native-hdr-win.js` 以確保 native addon 使用 `v143` toolset 編譯。

這代表如果依賴存在 `high` 以上漏洞，或稽核流程失敗，CI 會直接中止，不會產生釋出產物。

## 專案結構

- `src/main.js`: Electron 主程序，提供游標/點擊 IPC、overlay 視窗控制、儲存與 ffmpeg 輸出
- `src/preload.js`: 安全橋接 API
- `src/renderer.js`: 錄影主流程、自動縮放、音訊混音、剪輯時間軸與輸出策略
- `src/overlay.js` / `src/overlay.html`: 畫筆與指示器的全螢幕 overlay
- `src/index.html` / `src/styles.css`: 控制介面與預覽畫面
- `scripts/start-electron.js`: 開發啟動入口（預設注入 HDR native route 旗標）
- `scripts/check-dist-win-env.js`: Windows 打包前置檢查（非 Windows 時檢查 `wine`）
- `native/windows-hdr-capture/`: Windows 原生 HDR 擷取 Node-API 模組
- `native/windows-hdr-capture/src/addon.cc`: 原生擷取與 tone mapping MVP 實作
- `native/windows-wgc-hdr-capture/`: Windows WGC 路由 Native 模組骨架（目前與既有 bridge 相容，逐步替換）
- `.github/workflows/build.yml`: CI 供應鏈檢查與 Windows/Linux 打包發佈流程

## 注意事項

- 首次啟動請允許螢幕錄製與麥克風權限。
- `uiohook-napi` 若無法載入，仍可錄影，但全域點擊偵測與 Ctrl 切換能力會受限。
- 輸出使用瀏覽器 `MediaRecorder`，實際可用編碼會因系統不同而異。
- 若要使用 `ffmpeg` 剪輯或 `MP4` 轉檔，系統需安裝 `ffmpeg` 並可在命令列執行 `ffmpeg -version`。
- `auto` 輸出模式下若 `ffmpeg` 失敗，會自動退回內建輸出器。
- 錄製暫存檔會建立在系統暫存目錄（如 Linux 的 `/tmp/cursorcine-upload-*`），在關閉編輯器或退出程式時會自動清理。

## 授權條款

本專案採用 MIT License。完整法律條文請見 `LICENSE`。

以下為繁體中文翻譯（僅供參考）：

> MIT 授權條款
>
> 版權所有 (c) 2026 allenyl
>
> 茲免費授予任何取得本軟體及其相關文件檔案（以下簡稱「本軟體」）副本之人，不受限制地處理本軟體之權利，包括但不限於使用、複製、修改、合併、出版、散布、再授權及／或販售本軟體副本，並允許獲提供本軟體之人為上述行為，但須符合下列條件：
>
> 上述版權聲明及本許可聲明，應包含於本軟體之所有副本或重要部分中。
>
> 本軟體係「按現狀」提供，不提供任何明示或默示之擔保，包括但不限於可售性、特定目的適用性及未侵權之擔保。在任何情況下，作者或版權所有人均不對任何索賠、損害或其他責任負責，無論該等責任係因契約行為、侵權行為或其他行為所生，亦無論是否因本軟體或其使用或其他交易而起。

正式授權內容與解釋以英文版 `LICENSE` 為準。
