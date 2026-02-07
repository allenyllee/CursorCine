# CursorCine (Electron)

可在 Windows / Linux 執行的桌面錄影工具，特色是錄影畫面會跟隨滑鼠自動 Zoom in / Zoom out，方便製作教學影片。

## 功能

- 錄製整個螢幕（可選多螢幕來源）
- 滑鼠點擊位置會暫時 Zoom in，約 1 秒後自動 Zoom out
- 若未安裝全域滑鼠 hook，會維持全螢幕，不會自動觸發放大
- 輸出格式可選 `WebM` 或 `MP4`
- 若當前瀏覽器不支援直接錄 `MP4`，會先錄成 `WebM`，停止後自動呼叫 `ffmpeg` 轉成 MP4
- 盡量錄製喇叭輸出（系統聲音，視作業系統與授權情況）
- 可選擇是否加入麥克風收音
- 喇叭輸出與麥克風會混成單一音軌錄製，避免只錄到其中一條
- 可調整最大縮放倍率與鏡頭平滑程度
- 停止後自動下載或另存影片檔

## 開發執行

```bash
npm install
npm start
```

## 專案結構

- `src/main.js`: Electron 主程序，提供游標位置 IPC、全域點擊 IPC 與 ffmpeg 轉檔 IPC
- `src/preload.js`: 安全橋接 API
- `src/renderer.js`: 錄影、自動縮放、音訊混音與輸出格式邏輯
- `src/index.html` / `src/styles.css`: 介面

## 注意事項

- 首次啟動請允許螢幕錄製與麥克風權限。
- 若要啟用「全域滑鼠點擊觸發放大」，請安裝 `uiohook-napi`（已設為 optional dependency）。
- 輸出使用瀏覽器 `MediaRecorder`，實際可用編碼會因系統不同而異。
- 若要使用「MP4 轉檔」功能，系統需安裝 `ffmpeg` 並可在命令列執行 `ffmpeg -version`。
