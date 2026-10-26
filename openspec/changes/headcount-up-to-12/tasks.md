## 1. 實作

- [x] 1.1 Code.gs：`MAX = 12`；create／signup 上限；parseChain 回傳 `over`；#新活動超限另回文字（卡片不變、重複分支不附）
- [x] 1.2 index.html：`counts()` 1–6＋「7 位以上」展開／收起、已選 >6 自動展開且鎖住收起；新增頁同步；接龍超限警告
- [x] 1.3 test.js：12 可報、13 擋；parse 的 over（以最後一行為準）；#新活動超限回 [flex, text]、未超限只有卡片；改壞後端三處測試都會失敗

## 2. 驗證

- [x] 2.1 `node test.js`；Flex 三函式與 eventCard 未修改
- [x] 2.2 前後截圖交使用者確認
- [x] 2.4 Codex 審查 diff：補上舊版後端沒回 over 的防護（Gemini 同意）
- [ ] 2.3 Apps Script 重新部署後 LINE 實機確認
