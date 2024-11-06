use axum::extract::State;
use axum::Router;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use sqlx::{ConnectOptions, Executor};
use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, sqlx::Type)]
#[sqlx(type_name = "enum", rename_all = "lowercase")]
enum TaskStatus {
    Pending,
    Running,
    Done,
}

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
struct Task {
    id: u64,
    branch: String,
    status: TaskStatus,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error(transparent)]
    SqlxError(#[from] sqlx::Error),
    #[error(transparent)]
    InternalServerError(#[from] anyhow::Error),
    #[error("invalid query parameter: {0}")]
    InvalidQueryParameter(String),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
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
            status ENUM('pending', 'running', 'done') NOT NULL DEFAULT 'pending',
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
) -> Result<axum::Json<Task>, AppError> {
    let branch = params
        .get("branch")
        .ok_or(AppError::InvalidQueryParameter("branch".to_string()))?;
    let mut tx = pool.begin().await?;
    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (branch, status, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    )
    .bind(branch)
    .bind(TaskStatus::Pending)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(axum::Json(task))
}

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
}

async fn task_runner(pool: MySqlPool) -> Result<(), AppError> {
    loop {
        let mut tx = pool.begin().await?;
        let task = sqlx::query_as::<_, Task>("SELECT id, branch, status FROM tasks WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE")
            .fetch_optional(&mut *tx)
            .await?;
        let task = match task {
            Some(task) => task,
            None => {
                tx.commit().await?;
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                print!("No new task found. Sleeping...");
                continue;
            }
        };

        println!("task: {:?}", task);
        sqlx::query("UPDATE tasks SET status = 'running' WHERE id = ?")
            .bind(task.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        sqlx::query("UPDATE tasks SET status = 'done' WHERE id = ? AND status = 'running'")
            .bind(task.id)
            .execute(&pool)
            .await?;
    }
}

async fn init_database(pool: &MySqlPool) -> Result<(), AppError> {
    pool.execute(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            branch VARCHAR(255) NOT NULL,
            status ENUM('pending', 'running', 'done') NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    ",
    )
    .await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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
    init_database(&pool).await?;
    tokio::task::spawn(async {
        task_runner(pool).await.unwrap();
    });
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
