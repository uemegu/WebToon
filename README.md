# WebToon

縦読み漫画を GitHub Pages で公開するための、簡易管理画面＋静的サイトジェネレーター（Node.js のみ・依存パッケージなし）。

## 使い方

```bash
npm run admin   # 管理画面 http://localhost:4321/
npm run build   # dist/ に静的サイトを出力（通常は GitHub Actions が実行）
```

1. `npm run admin` で管理画面を開く
2. 作品 → 話 → ページ（画像）を登録。画像はドロップするとファイル名順に追加、ドラッグで並べ替え
3. 話ごとに「OGP画像」をページから切り出して設定（未設定なら1ページ目を使用）
4. 「ビルドしてプレビュー」で確認
5. `git add . && git commit && git push` → GitHub Actions がビルドして Pages に公開

## 初回のみ: GitHub 側の設定

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定。

## 構成

```
data/db.json              作品・話・ページのデータ
data/images/<作品>/<話>/   ページ画像・OGP画像
admin/                    管理画面（ローカル専用）
scripts/build.mjs         静的サイト生成
scripts/assets/           公開サイトの CSS / JS
.github/workflows/        Pages デプロイ
```

公開URL: `https://uemegu.github.io/WebToon/<作品ID>/<話ID>/`
