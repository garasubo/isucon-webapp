mod db;
mod file;

use crate::file::get_task_file_path;
use axum::extract::State;
use axum::Router;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, serde::Serialize, sqlx::Type)]
#[sqlx(type_name = "enum", rename_all = "lowercase")]
enum TaskStatus {
    Pending,
    Deploying,
    DeployFailed,
    Deployed,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
struct Task {
    #[sqlx(try_from = "i64")]
    id: u64,
    branch: String,
    status: String,
    score: Option<i64>,
    created_at: chrono::DateTime<chrono::Local>,
    updated_at: chrono::DateTime<chrono::Local>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct TaskDetail {
    #[serde(flatten)]
    task: Task,
    stdout: Option<String>,
    stderr: Option<String>,
    alp_log: Option<String>,
    slow_log: Option<String>,
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
    #[error("multipart error")]
    Multipart(#[from] axum::extract::multipart::MultipartError),
    #[error("not found")]
    NotFound,
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
        eprintln!("error: {:?}", self);
        match self {
            AppError::InvalidQueryParameter(message) => axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .body(axum::body::Body::from(message))
                .unwrap(),
            AppError::NotFound => axum::http::Response::builder()
                .status(axum::http::StatusCode::NOT_FOUND)
                .body(axum::body::Body::from("Not Found"))
                .unwrap(),
            _ => axum::http::Response::builder()
                .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .body(axum::body::Body::from(format!("{:?}", self)))
                .unwrap(),
        }
    }
}

#[axum::debug_handler]
async fn init_handler(
    State(AppState { pool, notify }): State<AppState>,
) -> Result<String, AppError> {
    db::init_db(&pool).await?;
    notify.notify_one();
    Ok("".to_string())
}

#[axum::debug_handler]
async fn get_running_task_handler(
    State(AppState { pool, .. }): State<AppState>,
) -> Result<axum::Json<TaskDetail>, AppError> {
    let task: Option<Task> = sqlx::query_as(
        "SELECT * FROM tasks WHERE status = 'deploying' OR status = 'deployed' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(task) = task {
        let file_dir = get_task_file_path(task.id)?;
        let stdout = std::fs::read_to_string(file_dir.join("stdout")).ok();
        let stderr = std::fs::read_to_string(file_dir.join("stderr")).ok();
        let alp_log = std::fs::read_to_string(file_dir.join("access.log")).ok();
        let slow_log = std::fs::read_to_string(file_dir.join("mysql-slow.log")).ok();
        Ok(axum::Json(TaskDetail {
            task,
            stdout,
            stderr,
            alp_log,
            slow_log,
        }))
    } else {
        Err(AppError::NotFound)
    }
}

#[axum::debug_handler]
async fn get_task_handler(
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    State(AppState { pool, .. }): State<AppState>,
) -> Result<axum::Json<TaskDetail>, AppError> {
    let task: Option<Task> = sqlx::query_as("SELECT * FROM tasks WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_optional(&pool)
        .await?;
    if let Some(task) = task {
        let file_dir = get_task_file_path(task.id)?;
        let stdout = std::fs::read_to_string(file_dir.join("stdout")).ok();
        let stderr = std::fs::read_to_string(file_dir.join("stderr")).ok();
        let alp_log = std::fs::read_to_string(file_dir.join("access.log")).ok();
        let slow_log = std::fs::read_to_string(file_dir.join("mysql-slow.log")).ok();
        Ok(axum::Json(TaskDetail {
            task,
            stdout,
            stderr,
            alp_log,
            slow_log,
        }))
    } else {
        Err(AppError::NotFound)
    }
}

#[axum::debug_handler]
async fn get_tasks_handler(
    State(AppState { pool, .. }): State<AppState>,
) -> Result<axum::Json<Vec<Task>>, AppError> {
    let tasks: Vec<Task> = sqlx::query_as("SELECT * FROM tasks")
        .fetch_all(&pool)
        .await?;
    Ok(axum::Json(tasks))
}

#[axum::debug_handler]
async fn post_task_handler(
    State(AppState { pool, notify }): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> Result<axum::Json<u64>, AppError> {
    let branch = params
        .get("branch")
        .ok_or(AppError::InvalidQueryParameter("branch".to_string()))?;
    let result = sqlx::query("INSERT INTO tasks (branch, status) VALUES (?, ?)")
        .bind(branch)
        .bind("pending")
        .execute(&pool)
        .await?;
    notify.notify_one();
    Ok(axum::Json(result.last_insert_id()))
}

#[derive(serde::Deserialize, Debug)]
struct UpdateTaskRequest {
    status: Option<String>,
    score: Option<i64>,
}

#[axum::debug_handler]
async fn update_task_handler(
    State(AppState { pool, notify }): State<AppState>,
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    axum::extract::Json(request): axum::extract::Json<UpdateTaskRequest>,
) -> Result<axum::Json<u64>, AppError> {
    let status = request.status;
    let score = request.score;
    if status.is_none() && score.is_none() {
        return Err(AppError::InvalidQueryParameter(
            "status or score".to_string(),
        ));
    }
    if let Some(score) = score {
        let _result = sqlx::query("UPDATE tasks SET score = ? WHERE id = ? LIMIT 1")
            .bind(score)
            .bind(id)
            .execute(&pool)
            .await?;
    }
    if let Some(status) = status {
        let _result = sqlx::query("UPDATE tasks SET status = ? WHERE id = ? LIMIT 1")
            .bind(status)
            .bind(id)
            .execute(&pool)
            .await?;
    }
    notify.notify_one();
    Ok(axum::Json(id))
}

#[axum::debug_handler]
async fn upload_file_handler(
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    mut multipart: axum::extract::Multipart,
) -> Result<axum::Json<u64>, AppError> {
    let file_dir = get_task_file_path(id)?;
    let _ = tokio::fs::create_dir_all(&file_dir).await;
    while let Some(field) = multipart.next_field().await? {
        let mut file =
            tokio::fs::File::create(file_dir.join(field.name().as_ref().unwrap())).await?;
        let data = field.bytes().await?;
        file.write_all(&data).await?;
    }
    Ok(axum::Json(id))
}

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
    notify: Arc<tokio::sync::Notify>,
}

#[derive(Debug, serde::Deserialize)]
struct Config {
    app_repository: String,
    deploy_command: String,
}

async fn task_runner(
    pool: MySqlPool,
    notify: Arc<tokio::sync::Notify>,
    config: Config,
) -> Result<(), anyhow::Error> {
    let repo_directory = Path::canonicalize(Path::new("."))?.join("repo");
    println!("repo_directory: {:?}", repo_directory);
    loop {
        let mut tx = pool.begin().await?;
        let going_tasks = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM tasks WHERE status = 'deploying' OR status = 'deployed' LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(task) = going_tasks {
            println!("task is going: {:?}", task);
            tx.commit().await?;
            notify.notified().await;
            continue;
        }
        let task = sqlx::query_as::<_, Task>(
            "SELECT * FROM tasks WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await?;
        let task = match task {
            Some(task) => task,
            None => {
                tx.commit().await?;
                println!("No new task found. Sleeping...");
                notify.notified().await;
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
            eprintln!(
                "git checkout failed: {:?}",
                String::from_utf8_lossy(&output.stderr)
            );
            sqlx::query("UPDATE tasks SET status = 'deploy_failed' WHERE id = ?")
                .bind(task.id)
                .execute(&pool)
                .await?;
            continue;
        }
        println!("checkout done");
        let file_dir = Path::canonicalize(Path::new("."))?
            .join("file")
            .join(task.id.to_string());
        let _ = tokio::fs::create_dir_all(&file_dir).await;
        println!("file_dir: {:?}", file_dir);
        let stdout = std::fs::File::create(file_dir.join("stdout"))?;
        let stderr = std::fs::File::create(file_dir.join("stderr"))?;
        let status = tokio::process::Command::new("bash")
            .args(["-c", &config.deploy_command])
            .current_dir(&repo_directory)
            .stdout(stdout)
            .stderr(stderr)
            .status()
            .await?;
        if status.code() != Some(0) {
            eprintln!("deploy failed: {:?}", status);
            sqlx::query("UPDATE tasks SET status = 'deploy_failed' WHERE id = ?")
                .bind(task.id)
                .execute(&pool)
                .await?;
            continue;
        }

        // update status
        sqlx::query("UPDATE tasks SET status = 'deployed' WHERE id = ? AND status = 'deploying'")
            .bind(task.id)
            .execute(&pool)
            .await?;
    }
}

async fn init(pool: &MySqlPool, config: &Config) -> Result<(), AppError> {
    db::init_db(pool).await?;

    tokio::fs::remove_dir_all("repo").await.ok();

    let _output = tokio::process::Command::new("gh")
        .args(["repo", "clone", &config.app_repository, "repo"])
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
        .port(
            std::env::var("MYSQL_PORT")
                .unwrap_or("3306".to_string())
                .parse::<u16>()
                .unwrap(),
        )
        .username("isucon")
        .password("isucon")
        .database("webapp");
    let pool = MySqlPoolOptions::new().connect_with(options).await?;
    let notify = Arc::new(tokio::sync::Notify::new());
    let app = Router::new()
        .route("/api", axum::routing::get(|| async { "Hello, World!" }))
        .route("/api/init", axum::routing::post(init_handler))
        .route(
            "/api/tasks/:id/files",
            axum::routing::post(upload_file_handler),
        )
        .route("/api/tasks/:id", axum::routing::patch(update_task_handler))
        .route(
            "/api/tasks/running",
            axum::routing::get(get_running_task_handler),
        )
        .route("/api/tasks/:id", axum::routing::get(get_task_handler))
        .route("/api/tasks", axum::routing::get(get_tasks_handler))
        .route("/api/tasks", axum::routing::post(post_task_handler))
        .with_state(AppState {
            pool: pool.clone(),
            notify: notify.clone(),
        });
    init(&pool, &config).await?;
    tokio::task::spawn(async {
        if let Err(e) = task_runner(pool, notify, config).await {
            eprintln!("task_runner error: {:?}", e);
        }
    });
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
