# おこづかい ラボ（Web / PWA）

こどもが あそびながら「お金・複利・目標・動物の飼育」を学べる、おこづかいアプリの Web(PWA) 版です。
インストール不要のブラウザアプリとして動き、スマホの「ホーム画面に追加」でアプリのように使えます（オフライン対応）。

## 動かし方（ローカル開発）

Node.js 18 以上が必要です。

```bash
npm install
npm run dev
```

表示された `http://localhost:5173` を開きます。

### 動作確認のコツ（時間の早送り）
本番では「1週間 = 実際の1週間」で自動的に進みます。開発中に動きを見たいときは、
URL の後ろに `?weekms=4000` を付けると「1週間 = 4秒」で進みます。

```
http://localhost:5173/?weekms=3000
```

## 本番ビルド & 公開

```bash
npm run build      # dist/ に静的ファイルが出力されます
npm run preview    # 本番ビルドをローカル確認
```

`dist/` の中身をそのまま静的ホスティングに置くだけで公開できます。おすすめ:

- **Vercel** / **Netlify** / **Cloudflare Pages**（GitHub 連携で自動デプロイ）
- **GitHub Pages**（`base` は `./` なのでサブディレクトリでも動作）

HTTPS 環境なら Service Worker が有効になり、オフライン＆インストール（PWA）ができます。

## データ保存について
プレイ状況は端末の `localStorage` に保存されます（サーバー不要・個人情報も送信しません）。
複数端末での同期が必要になったら、ログイン＋サーバー保存に差し替えられます。

## 収益化（アフィリエイト）
親モード内の「おうちのかたへ（おすすめ）」が親向けのおすすめリンク枠です。
`src/App.jsx` の `AFFILIATE` 配列の各項目に、実際のアフィリエイト URL を設定し、
リンクの `href="#"` を差し替えてください（`target="_blank" rel="noopener sponsored"` の付与を推奨）。

> 子ども向けアプリでは、子どもに広告を出さないこと（COPPA / GDPR-K 等）に注意。
> 広告・アフィリエイトは親モード内など「親向け」にとどめてください。

## 主な設定（`src/App.jsx` 冒頭）
- `WEEK_MS` … 1週間の長さ（本番は 7 日）
- `ANIMALS` … 動物の値段・稼ぎ・ごはん代
- `MAX_ANIMALS` … 飼える上限（10）
- `MAX_HEARTS` … ハートの数（4）
- `AFFILIATE` … 親向けおすすめリンク

## 構成
```
okozukai-pwa/
├─ index.html
├─ package.json
├─ vite.config.js
├─ public/
│  ├─ manifest.webmanifest
│  ├─ sw.js               # オフライン用 Service Worker
│  ├─ icon-192.png / icon-512.png / icon-512-maskable.png
│  ├─ apple-touch-icon.png / favicon.png
└─ src/
   ├─ main.jsx            # 起動 & SW 登録
   ├─ App.jsx             # アプリ本体
   └─ index.css
```
