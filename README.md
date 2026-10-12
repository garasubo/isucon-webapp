# isucon-webapp

ISUCON練習用のデプロイ・ベンチマーク管理サーバーです。ブランチを指定してタスクを登録すると、対象のリポジトリをそのブランチでcheckoutし、デプロイコマンドを実行します。実行時の出力はWeb画面で確認できます。

## 構成

| パス | 内容 |
|---|---|
| [backend/](backend/) | APIサーバー（Rust、axum、MySQL）。詳細は[backend/README.md](backend/README.md)を参照 |
| [frontend/](frontend/) | Web UI（React、Vite、Tailwind CSS） |
| [ansible/](ansible/) | サーバーのセットアップ（nginx、MySQL、gh、systemdのunitファイル） |
| [cloud-init/](cloud-init/) | multipassでローカルにVMを立てるスクリプト |
| [deploy.sh](deploy.sh) | backendとfrontendをビルドしてサーバーへ送るスクリプト |

## セットアップの流れ

1. サーバーを用意します。ローカルでは`cloud-init/launch.sh`でmultipassのVMを立てられます。
2. サーバーに対して`ansible/main.yml`を実行します。
3. サーバーで`.env`を書き、GitHubの認証を設定し、サービスをenableします。手順は[backend/README.md](backend/README.md)にあります。
4. `./deploy.sh [HOST]`でbackendとfrontendをデプロイします。
