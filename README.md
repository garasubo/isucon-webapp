# isucon-webapp
ISUCONでのベンチマーク結果を管理するためのウェブアプリです。

## ディレクトリ構成
- ansible: インフラ構築用のAnsible Playbook
- backend: Rust製のAPIサーバー
- cloud-init: ローカル環境にcloud-initを使ってインスタンスを作成するためのスクリプト
- frontend: React製のフロントエンド

## Docker開発環境

ローカル環境での開発を容易にするためのDocker Compose設定を用意しています。

### 前提条件

- Docker
- Docker Compose

### サービス構成

Docker Compose設定には以下のサービスが含まれています：

1. **MySQL**: データベースサーバー
   - ポート: 3306
   - ユーザー名: isucon
   - パスワード: isucon
   - データベース: webapp

2. **Backend**: Rust製バックエンドサービス
   - ポート: 8080
   - ホットリロード用にcargo-watchを使用

3. **Frontend**: React製フロントエンドサービス
   - ポート: 3000
   - ルーティングにReact Routerを使用

### 使い方

1. コンテナをビルドして起動：

```bash
docker-compose up -d
```

2. データベースを初期化：

```bash
curl -X POST http://localhost:8080/api/init
```

3. フロントエンドにアクセス： http://localhost:3000

### 開発ワークフロー

- ソースコードディレクトリはボリュームとしてマウントされているため、コードの変更はコンテナに自動的に反映されます。
- バックエンドはcargo-watchを使用して、コードの変更が検出されると自動的に再ビルドと再起動を行います。
- フロントエンドはReact Routerの開発サーバーを使用しており、ホットモジュールリプレースメントをサポートしています。

### サービスの停止

```bash
docker-compose down
```

ボリューム（データベースデータを含む）を削除する場合：

```bash
docker-compose down -v
```

### トラブルシューティング

#### バックエンドの問題

- ログの確認: `docker-compose logs backend`
- コンテナシェルへのアクセス: `docker-compose exec backend bash`

#### フロントエンドの問題

- ログの確認: `docker-compose logs frontend`
- コンテナシェルへのアクセス: `docker-compose exec frontend sh`

#### データベースの問題

- ログの確認: `docker-compose logs mysql`
- MySQLクライアントへのアクセス: `docker-compose exec mysql mysql -uisucon -pisucon webapp`
