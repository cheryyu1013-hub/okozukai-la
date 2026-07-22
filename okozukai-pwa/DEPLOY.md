# 公開（デプロイ）ガイド ― パソコンにソフトを入れずに公開する

いちばんカンタンなのは「GitHub にコードを置く → Vercel が自動で公開」する方法です。
ビルド（組み立て）はクラウドがやってくれるので、あなたのパソコンに Node.js は不要です。

## A. GitHub にコードを置く（無料）
1. https://github.com で無料アカウントを作成
2. 右上「＋」→「New repository」→ 名前（例：okozukai-lab）→「Create repository」
3. リポジトリ画面の「uploading an existing file」をクリック
4. この zip を**解凍した中身をすべて**ドラッグ＆ドロップ →「Commit changes」
   （`package.json` や `src` フォルダなどが見える状態でアップしてください）

## B. Vercel で公開（無料・おすすめ）
1. https://vercel.com で「Continue with GitHub」でログイン
2. 「Add New… → Project」→ さっきのリポジトリを「Import」
3. 設定はそのまま（Vite を自動認識）→「Deploy」
4. 1〜2分で `https://〇〇.vercel.app` の URL が発行されます → 公開完了！

以降、GitHub のファイルを変更するたびに自動で再公開されます。

## （代わりに）Netlify や Cloudflare Pages でも同じ
- Netlify：New site → Import from GitHub →（`netlify.toml` を同梱済みなので設定不要）→ Deploy
- Cloudflare Pages：Create → Connect to Git → Framework は「Vite」→ Deploy

## （上級）GitHub Pages で公開したい場合
`.github/workflows/deploy.yml` を同梱しています。
リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にすると、
push するたび自動でビルド＆公開されます。

## 独自ドメイン（任意）
Vercel/Netlify/Cloudflare の管理画面「Domains」から、購入したドメインを追加できます。
（ドメインの購入・DNS 設定は各社の案内に沿ってご自身で行います）

## 困ったら
公開時に赤いエラーが出たら、その画面の文字をそのまま貼ってください。原因を特定して直します。
