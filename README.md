# CursorCine (Electron)

可在 Windows / Linux 執行的桌面錄影工具，特色是錄影畫面會跟隨滑鼠自動 Zoom in / Zoom out，方便製作教學影片。

## 功能

- 錄製整個螢幕（可選多螢幕來源）
- 滑鼠點擊位置會暫時 Zoom in，約 1 秒後自動 Zoom out
- 若未安裝全域滑鼠 hook，會維持全螢幕，不會自動觸發放大
- 輸出格式可選 `WebM` 或 `MP4`
- 可切換畫質檔位（流暢 / 平衡 / 高畫質），在畫質與流暢度間取捨
- 提供 HDR 補償（實驗）開關、強度、色相校正、高亮壓縮與清晰度，改善 Windows HDR 下錄影色偏
- 若當前瀏覽器不支援直接錄 `MP4`，會先錄成 `WebM`，停止後自動呼叫 `ffmpeg` 轉成 MP4
- 盡量錄製喇叭輸出（系統聲音，視作業系統與授權情況）
- 可選擇是否加入麥克風收音
- 喇叭輸出與麥克風會混成單一音軌錄製，避免只錄到其中一條
- 錄影時可開啟畫筆模式，直接在畫面上手繪標註（即時錄進影片）
- 可調整最大縮放倍率與鏡頭平滑程度
- 停止後自動下載或另存影片檔

## 開發執行

```bash
npm install
npm start
```

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

只打包 Linux 安裝檔（AppImage + deb）：

```bash
npm run dist:linux
```

產物會輸出到 `dist/` 目錄。

## 專案結構

- `src/main.js`: Electron 主程序，提供游標位置 IPC、全域點擊 IPC 與 ffmpeg 轉檔 IPC
- `src/preload.js`: 安全橋接 API
- `src/renderer.js`: 錄影、自動縮放、音訊混音與輸出格式邏輯
- `src/index.html` / `src/styles.css`: 介面

## 注意事項

- 首次啟動請允許螢幕錄製與麥克風權限。
- 若要啟用「全域滑鼠點擊觸發放大」，請安裝 `uiohook-napi`。
- 輸出使用瀏覽器 `MediaRecorder`，實際可用編碼會因系統不同而異。
- 若要使用「MP4 轉檔」功能，系統需安裝 `ffmpeg` 並可在命令列執行 `ffmpeg -version`。
