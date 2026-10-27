# 追劇讀漫｜Firebase + GitHub Pages 版

個人影劇與漫畫進度管理 PWA，可部署在 GitHub Pages，使用 Firebase Authentication 的 Google 登入與 Cloud Firestore 跨裝置同步。

## 功能
- 影劇／漫畫清單與平台分類
- 記錄總集數／話數／卷數、目前進度、開始日期、狀態與備註
- 進度加減、百分比、搜尋／篩選／排序
- 作品資料全部手動輸入，不需要申請任何搜尋 API
- Google 登入、Firebase Firestore 即時同步
- JSON 匯出／匯入
- PWA 安裝與基本離線快取
- 可搜尋／篩選自己已新增的清單；不會連線搜尋外部作品資料

## 1. 建立 Firebase 專案
1. 開啟 [Firebase Console](https://console.firebase.google.com/) 並建立專案。
2. 在專案總覽新增一個 **Web App**，將 Firebase 提供的 Web 設定複製到 `firebase-config.js` 的 `FIREBASE_CONFIG`。
   - `apiKey`、`authDomain`、`projectId`、`storageBucket`、`messagingSenderId`、`appId`
   - Firebase Web config 是前端識別設定，不是服務帳戶金鑰。**不要把 service account JSON 或私鑰放進前端。**
3. 到 **Authentication → Sign-in method** 啟用 **Google** 登入，選擇支援電子郵件的專案。
4. 到 **Authentication → Settings → Authorized domains**，確認已加入：
   - `localhost`（本機測試時）
   - `YOUR_GITHUB_USERNAME.github.io`（部署後替換成你的 GitHub 使用者名稱）
5. 到 **Firestore Database** 建立資料庫。選擇適合的地區。
6. 開啟 Firestore **Rules**，將 `firestore.rules` 的內容貼上並發布。規則限制每位登入者只能讀寫自己 `users/{uid}/works` 底下的文件。

## 3. 部署到 GitHub Pages
1. 在 GitHub 建立一個新的 **Public repository**（例如 `watch-read-tracker`）。
2. 將本資料夾中的所有檔案上傳到 repository 根目錄；確認 `index.html` 位於根目錄，不要只上傳 ZIP。
3. 編輯 `firebase-config.js` 填入 Firebase Web App config。
4. 到 repository 的 **Settings → Pages**。
5. 在 **Build and deployment** 選 `Deploy from a branch`，Branch 選 `main`、資料夾選 `/(root)`，按 Save。
6. 等 GitHub Pages 部署完成，網站網址通常會是：
   `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`
7. 回到 Firebase Authentication，確認 Authorized domains 包含 `YOUR_GITHUB_USERNAME.github.io`。
8. 在 Firebase Authentication 設定中，Google provider 應已啟用；之後開啟網站，按「Google 登入／同步」。

> GitHub Pages 是靜態網站託管，不需要把 Firebase 設定放進 GitHub Actions secrets。Firebase Web config 本身會送到瀏覽器；資料安全依靠 Authentication 與 Firestore Security Rules。

## 4. 本機測試
在專案資料夾執行：
```bash
python -m http.server 8000
```
然後開啟 `http://localhost:8000`。若使用 Google 登入，請將 `localhost` 加入 Firebase Authentication 的 Authorized domains。

## 資料同步行為與限制
- 未登入時，資料存在該瀏覽器的 `localStorage`。
- 登入後，程式會把本機資料與雲端資料合併，並將作品同步到目前登入的 Google 帳號；其他已登入同帳號的裝置會透過 Firestore 即時更新。
- 此原型目前沒有雲端刪除按鈕、共享清單或完整衝突解決機制。不要在多裝置同時編輯同一作品；重要資料請定期匯出 JSON 備份。
- 登出不會刪除 Firebase 雲端資料。
- 影音平台選項是個人手動標記，不代表與 Netflix、Prime Video 等平台官方串接，也不會讀取其觀看紀錄。
