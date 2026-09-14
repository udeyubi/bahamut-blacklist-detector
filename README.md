# 巴哈黑名單偵測

用於巴哈姆特哈啦區文章頁面的 Tampermonkey userscript，可偵測哪些使用者已將你加入黑名單。

![你媽的，為甚麼](assets/preview.png)

## 功能

- 偵測文章樓層與留言中的使用者是否將你加入黑名單
- 在帳號旁顯示「已偵測到將你黑單」標籤
- 可選擇隱藏對方的文章與留言
- 可在偵測後自動將對方加入自己的黑名單
- 從巴哈頁面右上角的「更多」選單開啟設定，不必修改程式碼
- 使用瀏覽器 `localStorage` 保存設定與偵測快取
- 提供固定且安全的請求間隔，避免短時間發送過多請求
- 未登入時自動停用偵測，不發送無效請求或寫入錯誤快取
- 支援 AJAX 動態載入的新留言

## 使用方式

### 開啟黑名單處理

在巴哈文章頁面右上角打開「更多」選單，點選「黑名單處理」。

![從更多選單開啟黑名單處理](assets/menu-entry.png)

### 調整偵測設定

可在設定面板啟用偵測、隱藏文章與留言、自動反向黑單，並選擇快取時間及安全的請求間隔。

![黑名單處理設定面板](assets/settings-dialog.png)

## 安裝

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. [點此安裝 userscript](https://raw.githubusercontent.com/udeyubi/bahamut-blacklist-detector/main/baha-blacklist-detector.user.js)。
3. 開啟巴哈姆特哈啦區文章頁面。
4. 從頁面右上角的「更多」選單選擇「黑名單處理」。

## 使用提醒

- 必須先登入巴哈姆特才能進行偵測。
- 偵測結果預設會快取一天，可在設定中調整或手動清除。
- 網站改版可能導致頁面元素或偵測方式失效。

## 作者

[@udeyubi](https://github.com/udeyubi)
