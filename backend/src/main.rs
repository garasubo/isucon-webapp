use axum::extract::State;
use axum::Router;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use sqlx::{ConnectOptions, Executor};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, sqlx::Type)]
#[sqlx(type_name = "enum", rename_all = "lowercase")]
enum TaskStatus {
    Pending,
    Deploying,
    DeployFailed,
    Deployed,
    Done,
}

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
struct Task {
    #[sqlx(try_from = "i64")]
    id: u64,
    branch: String,
    status: String,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error(transparent)]
    SqlxError(#[from] sqlx::Error),
    #[error(transparent)]
    InternalServerError(#[from] anyhow::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("invalid query parameter: {0}")]
    InvalidQueryParameter(String),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
        eprintln!("error: {:?}", self);
        match self {
            AppError::InvalidQueryParameter(message) => axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .body(axum::body::Body::from(message))
                .unwrap(),
            _ => axum::http::Response::builder()
                .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .body(axum::body::Body::from(format!("{:?}", self)))
                .unwrap(),
        }
    }
}

#[axum::debug_handler]
async fn init_handler(State(AppState { pool }): State<AppState>) -> Result<String, AppError> {
    // init database
    pool.execute(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            branch VARCHAR(255) NOT NULL,
            status CHAR(16) NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    ",
    )
    .await?;
    Ok("".to_string())
}

#[axum::debug_handler]
async fn get_tasks_handler(
    State(AppState { pool }): State<AppState>,
) -> Result<axum::Json<Vec<Task>>, AppError> {
    let tasks: Vec<Task> = sqlx::query_as("SELECT id, branch, status FROM tasks")
        .fetch_all(&pool)
        .await?;
    Ok(axum::Json(tasks))
}

#[axum::debug_handler]
async fn post_task_handler(
    State(AppState { pool }): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> Result<axum::Json<u64>, AppError> {
    let branch = params
        .get("branch")
        .ok_or(AppError::InvalidQueryParameter("branch".to_string()))?;
    let result = sqlx::query(
        "INSERT INTO tasks (branch, status, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    )
    .bind(branch)
    .bind("pending")
    .execute(&pool)
    .await?;
    Ok(axum::Json(result.last_insert_id()))
}

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
}

#[derive(Debug, serde::Deserialize)]
struct Config {
    app_repository: String,
    deploy_command: String,
}

async fn task_runner(pool: MySqlPool, config: Config) -> Result<(), anyhow::Error> {

    let repo_directory = Path::canonicalize(Path::new("."))?.join(config.app_repository.split("/").last().unwrap());
    println!("repo_directory: {:?}", repo_directory);
    loop {
        let mut tx = pool.begin().await?;
        let going_tasks = sqlx::query_as::<_, Task>("SELECT id, branch, status FROM tasks WHERE status = 'deploying' OR status = 'deployed' LIMIT 1")
            .fetch_optional(&mut *tx)
            .await?;
        if let Some(task) = going_tasks {
            println!("task is going: {:?}", task);
            tx.commit().await?;
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            continue;
        }
        let task = sqlx::query_as::<_, Task>("SELECT id, branch, status FROM tasks WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE")
            .fetch_optional(&mut *tx)
            .await?;
        let task = match task {
            Some(task) => task,
            None => {
                tx.commit().await?;
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                println!("No new task found. Sleeping...");
                continue;
            }
        };

        println!("task: {:?}", task);
        sqlx::query("UPDATE tasks SET status = 'deploying' WHERE id = ?")
            .bind(task.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        // checkout branch and deploy
        //tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        let _ = tokio::process::Command::new("git")
            .arg("fetch")
            .current_dir(&repo_directory)
            .output()
            .await?;
        let output = tokio::process::Command::new("git")
            .args(["checkout", &format!("origin/{}", &task.branch)])
            .current_dir(&repo_directory)
            .output()
            .await?;
        if output.status.code() != Some(0) {
            eprintln!("git checkout failed: {:?}", String::from_utf8_lossy(&output.stderr));
            sqlx::query("UPDATE tasks SET status = 'deploy_failed' WHERE id = ?")
                .bind(task.id)
                .execute(&pool)
                .await?;
            continue;
        }
        println!("checkout done");
        let output = tokio::process::Command::new("bash")
            .args(["-c", &config.deploy_command])
            .current_dir(&repo_directory)
            .output()
            .await?;
        if output.status.code() != Some(0) {
            eprintln!("deploy failed: {:?}", String::from_utf8_lossy(&output.stderr));
            sqlx::query("UPDATE tasks SET status = 'deploy_failed' WHERE id = ?")
                .bind(task.id)
                .execute(&pool)
                .await?;
            continue;
        }

        // update status
        sqlx::query("UPDATE tasks SET status = 'deployed' WHERE id = ? AND status = 'running'")
            .bind(task.id)
            .execute(&pool)
            .await?;
    }
}

async fn init(pool: &MySqlPool, config: &Config) -> Result<(), AppError> {
    pool.execute(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            branch VARCHAR(255) NOT NULL,
            status CHAR(16) NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    ",
    )
    .await?;

    let _output = tokio::process::Command::new("gh")
        .args(["repo", "clone", &config.app_repository])
        .output()
        .await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    let config = envy::from_env::<Config>()?;
    let options = MySqlConnectOptions::new()
        .host("localhost")
        .port(3306)
        .username("isucon")
        .password("isucon")
        .database("webapp");
    let pool = MySqlPoolOptions::new().connect_with(options).await?;
    let app = Router::new()
        .route("/api", axum::routing::get(|| async { "Hello, World!" }))
        .route("/api/init", axum::routing::post(init_handler))
        .route("/api/tasks", axum::routing::get(get_tasks_handler))
        .route("/api/tasks", axum::routing::post(post_task_handler))
        .with_state(AppState { pool: pool.clone() });
    init(&pool, &config).await?;
    tokio::task::spawn(async {
        if let Err(e) = task_runner(pool, config).await {
            eprintln!("task_runner error: {:?}", e);
        }
    });
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
