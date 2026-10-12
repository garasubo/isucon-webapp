# backend

ISUCON練習用のデプロイ・ベンチマーク管理サーバーのバックエンドです。

## 動作の概要

バックエンドは起動すると、まず`.env`から設定を読み込みます。次に`gh repo clone`で`APP_REPOSITORY`を`./repo`にcloneします。`./repo`は起動のたびに削除され、cloneし直されます。

タスクが登録されると、タスクランナーが`./repo`で次の3つを順に実行します。

1. `git fetch`
2. `git checkout origin/<branch>`
3. `bash -c "$DEPLOY_COMMAND"`

実行時の出力は`./file/<タスクID>/stdout`と`./file/<タスクID>/stderr`に保存されます。

設定の読み込みやcloneに失敗しても、プロセスは終了せずに起動し、すべてのAPIがそのエラーを返します。フロントエンドはこのエラーを画面に表示します。

APIは`0.0.0.0:8080`で待ち受けます。サーバーではnginxが`/api`を8080番へ転送します。nginxの設定は[ansible/files/nginx-default.conf](../ansible/files/nginx-default.conf)にあります。

## 前提

[ansible/main.yml](../ansible/main.yml)を実行すると、サーバーに次のものが用意されます。

- MySQLのユーザー`isucon`（パスワード`isucon`）とデータベース`webapp`
- `gh` CLI
- `~/.ssh/id_ed25519`
- systemdのunitファイル`/etc/systemd/system/isucon-webapp-backend.service`

MySQLの接続先は`localhost`で固定です。ユーザー名、パスワード、DB名もコードに直接書かれています。テーブルは起動時に自動で作られます。

## .envの設定

サーバーでは`~/api-server/.env`に書きます。この`.env`は、systemdの`EnvironmentFile`とバックエンドのdotenvの両方から読まれます。

```
APP_REPOSITORY=<owner>/<repo>
DEPLOY_COMMAND=<リポジトリ内で実行するデプロイコマンド>
```

| 変数 | 必須 | 内容 |
|---|---|---|
| `APP_REPOSITORY` | 必須 | `gh repo clone`に渡すリポジトリ |
| `DEPLOY_COMMAND` | 必須 | cloneしたリポジトリのルートで`bash -c`により実行するコマンド |
| `MYSQL_PORT` | 任意 | MySQLのポート。デフォルトは3306 |

変数名は大文字で書く必要があります。systemdの`EnvironmentFile`は`export`を解釈できないため、`export`は付けないでください。

`deploy.sh`は空の`.env`を作るだけなので、中身は手で書いてください。

## GitHubの認証

バックエンドがGitHubに対して行うのは`gh repo clone`と`git fetch`だけで、どちらも読み取りです。そのため、権限を最小にしたfine-grained personal access tokenを使うことをおすすめします。

### トークンの作成

GitHubのSettings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new tokenから、次の設定で作ります。

| 項目 | 設定値 |
|---|---|
| Resource owner | `APP_REPOSITORY`のowner |
| Expiration | 練習期間が終わるまで |
| Repository access | Only select repositoriesを選び、対象リポジトリだけを指定 |
| Repository permissions | Contents: Read-only（Metadata: Read-onlyは自動で付く） |

リポジトリが組織のものだと、組織の設定によっては管理者の承認が必要になります。

### サーバーでの設定

ubuntuユーザーで次のコマンドを実行します。

```
gh auth login --with-token   # トークンを貼り付けて Enter → Ctrl-D
gh auth setup-git
gh auth status
git ls-remote https://github.com/<owner>/<repo> | head -1
```

`gh auth setup-git`を忘れると、`gh repo clone`は成功しても、タスク実行時の`git fetch`が認証で失敗します。

## サービスの起動

```
sudo systemctl daemon-reload
sudo systemctl enable --now isucon-webapp-backend
```

Ansibleはunitファイルを置くだけで、enableはしません。enableしないと、VMを再起動したあとにバックエンドが起動しません。

起動に何度も失敗して`Start request repeated too quickly`と出たときは、systemdが再起動を止めています。原因を直したら、次のコマンドで再開してください。

```
sudo systemctl reset-failed isucon-webapp-backend
sudo systemctl restart isucon-webapp-backend
```

## デプロイ

リポジトリのルートで`./deploy.sh [HOST]`を実行します。`HOST`のデフォルトは`isucon-webapp`です。`deploy.sh`は`cross`でビルドしたバイナリを`~/api-server/backend`に送り、サービスを再起動します。

## トラブルシューティング

ログは次のコマンドで確認できます。

```
journalctl -u isucon-webapp-backend -n 50
```

| ログ | 原因 |
|---|---|
| `configuration error: missing value for field app_repository`など | `.env`の変数が足りない |
| `failed to clone ...` | `APP_REPOSITORY`の誤り、またはGitHubの認証が通っていない |
| `Error: MissingValue("app_repository")`ですぐ終了する | サーバーのバイナリが古い。`./deploy.sh`で入れ直す |
| MySQLへの接続エラー | MySQLが起動していない、またはユーザーやDBがない |

## 注意点

unitファイルには`After=mysql.service`がありません。そのため、ブート時にMySQLより先に起動して失敗することがあります。

`/api/tasks/:id/files`へのアップロードは、nginxの`client_max_body_size`（デフォルト1MB）か、axumのbodyの上限（デフォルト2MB）を超えると失敗します。
