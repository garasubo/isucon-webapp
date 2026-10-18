mod db;
mod file;

use crate::file::get_task_file_path;
use anyhow::Context;
use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::Router;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use std::collections::HashMap;
use std::convert::Infallible;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;

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
    commit_hash: Option<String>,
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
    /// The server could not start deploying (bad .env, repository clone failed).
    #[error("{0}")]
    Startup(String),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
        // Startup errors are logged once at startup, not on every request.
        if !matches!(self, AppError::Startup(_)) {
            eprintln!("error: {:?}", self);
        }
        match self {
            AppError::InvalidQueryParameter(message) => axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .body(axum::body::Body::from(message))
                .unwrap(),
            AppError::NotFound => axum::http::Response::builder()
                .status(axum::http::StatusCode::NOT_FOUND)
                .body(axum::body::Body::from("Not Found"))
                .unwrap(),
            AppError::Startup(_) => axum::http::Response::builder()
                .status(axum::http::StatusCode::SERVICE_UNAVAILABLE)
                .body(axum::body::Body::from(self.to_string()))
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
    State(AppState {
        pool,
        notify,
        changed,
        ..
    }): State<AppState>,
) -> Result<String, AppError> {
    db::init_db(&pool).await?;
    notify.notify_one();
    changed.send_replace(());
    Ok("".to_string())
}

fn load_task_detail(task: Task) -> Result<TaskDetail, AppError> {
    let file_dir = get_task_file_path(task.id)?;
    let read = |name: &str| std::fs::read_to_string(file_dir.join(name)).ok();
    Ok(TaskDetail {
        stdout: read("stdout"),
        stderr: read("stderr"),
        alp_log: read("access.log"),
        slow_log: read("mysql-slow.log"),
        task,
    })
}

async fn load_task_detail_by_id(pool: &MySqlPool, id: u64) -> Result<TaskDetail, AppError> {
    let task: Option<Task> = sqlx::query_as("SELECT * FROM tasks WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    load_task_detail(task.ok_or(AppError::NotFound)?)
}

async fn load_tasks(pool: &MySqlPool) -> Result<Vec<Task>, AppError> {
    Ok(sqlx::query_as("SELECT * FROM tasks")
        .fetch_all(pool)
        .await?)
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
    Ok(axum::Json(load_task_detail(
        task.ok_or(AppError::NotFound)?,
    )?))
}

#[axum::debug_handler]
async fn get_task_handler(
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    State(AppState { pool, .. }): State<AppState>,
) -> Result<axum::Json<TaskDetail>, AppError> {
    Ok(axum::Json(load_task_detail_by_id(&pool, id).await?))
}

#[axum::debug_handler]
async fn get_tasks_handler(
    State(AppState { pool, .. }): State<AppState>,
) -> Result<axum::Json<Vec<Task>>, AppError> {
    Ok(axum::Json(load_tasks(&pool).await?))
}

/// What a stream sends: JSON data, or an error message for a `server-error` event.
type StreamPayload = Result<String, String>;

fn stream_payload<T: serde::Serialize>(result: Result<T, AppError>) -> StreamPayload {
    result
        .and_then(|value| {
            serde_json::to_string(&value).map_err(|e| AppError::InternalServerError(e.into()))
        })
        .map_err(|e| {
            eprintln!("error: {:?}", e);
            e.to_string()
        })
}

fn stream_event(payload: &StreamPayload) -> Result<Event, Infallible> {
    Ok(match payload {
        Ok(json) => Event::default().data(json),
        // SSE cannot carry carriage returns.
        Err(message) => Event::default()
            .event("server-error")
            .data(message.replace('\r', "")),
    })
}

fn sse_response(
    stream: impl futures_core::Stream<Item = Result<Event, Infallible>> + Send + 'static,
) -> impl IntoResponse {
    (
        // Keep nginx from buffering the stream.
        [("X-Accel-Buffering", "no")],
        Sse::new(stream).keep_alive(KeepAlive::default()),
    )
}

/// Sends the task list on connect and again whenever a task changes.
#[axum::debug_handler]
async fn tasks_stream_handler(
    State(AppState { pool, changed, .. }): State<AppState>,
) -> impl IntoResponse {
    let mut rx = changed.subscribe();
    sse_response(async_stream::stream! {
        loop {
            yield stream_event(&stream_payload(load_tasks(&pool).await));
            if rx.changed().await.is_err() {
                break;
            }
        }
    })
}

/// Sends the task detail on connect and again whenever a task changes.
/// While deploying, the deploy command writes stdout/stderr without a DB change,
/// so the files are also re-read every second.
#[axum::debug_handler]
async fn task_stream_handler(
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    State(AppState { pool, changed, .. }): State<AppState>,
) -> impl IntoResponse {
    let mut rx = changed.subscribe();
    sse_response(async_stream::stream! {
        let mut last_sent: Option<StreamPayload> = None;
        loop {
            let detail = load_task_detail_by_id(&pool, id).await;
            let deploying = matches!(&detail, Ok(d) if d.task.status == "deploying");
            let payload = stream_payload(detail);
            if last_sent.as_ref() != Some(&payload) {
                yield stream_event(&payload);
                last_sent = Some(payload);
            }
            let closed = if deploying {
                tokio::select! {
                    result = rx.changed() => result.is_err(),
                    _ = tokio::time::sleep(Duration::from_secs(1)) => false,
                }
            } else {
                rx.changed().await.is_err()
            };
            if closed {
                break;
            }
        }
    })
}

#[derive(Debug, serde::Serialize)]
struct ClientConfig {
    deploy_enabled: bool,
}

#[axum::debug_handler]
async fn get_config_handler(
    State(AppState { repo, .. }): State<AppState>,
) -> axum::Json<ClientConfig> {
    axum::Json(ClientConfig {
        deploy_enabled: repo.is_none(),
    })
}

/// Queues a deploy of the branch. While deploying is disabled, records the score
/// for the branch's latest commit as a finished task instead.
#[axum::debug_handler]
async fn post_task_handler(
    State(AppState {
        pool,
        notify,
        changed,
        repo,
        ..
    }): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> Result<axum::Json<u64>, AppError> {
    let branch = params
        .get("branch")
        .ok_or(AppError::InvalidQueryParameter("branch".to_string()))?;
    if let Some(repo) = repo {
        let score = params
            .get("score")
            .and_then(|score| score.parse::<i64>().ok())
            .ok_or(AppError::InvalidQueryParameter("score".to_string()))?;
        let commit_hash = fetch_branch_commit(&repo, branch)
            .await
            .map_err(AppError::InvalidQueryParameter)?;
        let result = sqlx::query(
            "INSERT INTO tasks (branch, commit_hash, status, score) VALUES (?, ?, 'done', ?)",
        )
        .bind(branch)
        .bind(commit_hash)
        .bind(score)
        .execute(&pool)
        .await?;
        changed.send_replace(());
        return Ok(axum::Json(result.last_insert_id()));
    }
    let result = sqlx::query("INSERT INTO tasks (branch, status) VALUES (?, ?)")
        .bind(branch)
        .bind("pending")
        .execute(&pool)
        .await?;
    notify.notify_one();
    changed.send_replace(());
    Ok(axum::Json(result.last_insert_id()))
}

#[derive(serde::Deserialize, Debug)]
struct UpdateTaskRequest {
    status: Option<String>,
    score: Option<i64>,
}

#[axum::debug_handler]
async fn update_task_handler(
    State(AppState {
        pool,
        notify,
        changed,
        ..
    }): State<AppState>,
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
    changed.send_replace(());
    Ok(axum::Json(id))
}

#[axum::debug_handler]
async fn upload_file_handler(
    axum::extract::Path((id,)): axum::extract::Path<(u64,)>,
    State(AppState { changed, .. }): State<AppState>,
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
    changed.send_replace(());
    Ok(axum::Json(id))
}

#[derive(Debug, serde::Serialize)]
struct SshKey {
    name: String,
    key: String,
}

/// Returns the server's SSH public keys (~/.ssh/*.pub), which the contest
/// servers must accept for the deploy command to log in.
#[axum::debug_handler]
async fn get_ssh_keys_handler() -> Result<axum::Json<Vec<SshKey>>, AppError> {
    let home = std::env::var("HOME").context("HOME is not set")?;
    let mut entries = match tokio::fs::read_dir(Path::new(&home).join(".ssh")).await {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(axum::Json(vec![])),
        Err(e) => return Err(e.into()),
    };
    let mut keys = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().map_or(true, |ext| ext != "pub") {
            continue;
        }
        keys.push(SshKey {
            name: entry.file_name().to_string_lossy().into_owned(),
            key: tokio::fs::read_to_string(&path).await?.trim().to_string(),
        });
    }
    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(axum::Json(keys))
}

/// The cloned app repository, used to resolve branches while deploying is disabled.
struct Repo {
    directory: PathBuf,
    /// Keeps concurrent requests from running `git fetch` at the same time.
    lock: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
    notify: Arc<tokio::sync::Notify>,
    /// Bumped whenever a task changes; wakes the SSE streams.
    changed: Arc<watch::Sender<()>>,
    /// Set when the config (.env) could not be loaded or the repository could not be
    /// cloned; every API then fails with it.
    startup_error: Option<Arc<str>>,
    /// Set when deploying is disabled (DISABLE_DEPLOY=true).
    repo: Option<Arc<Repo>>,
}

async fn require_config(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, AppError> {
    if let Some(message) = state.startup_error {
        return Err(AppError::Startup(message.to_string()));
    }
    Ok(next.run(request).await)
}

#[derive(Debug, serde::Deserialize)]
struct Config {
    app_repository: String,
    /// Required unless deploying is disabled.
    deploy_command: Option<String>,
    #[serde(default)]
    disable_deploy: bool,
}

/// Runs pending tasks one at a time. A failing task is marked deploy_failed and
/// a failing DB access is retried, so the runner never stops.
async fn task_runner(
    pool: MySqlPool,
    notify: Arc<tokio::sync::Notify>,
    changed: Arc<watch::Sender<()>>,
    deploy_command: String,
    repo_directory: PathBuf,
) {
    println!("repo_directory: {:?}", repo_directory);
    loop {
        if let Err(e) =
            run_next_task(&pool, &notify, &changed, &deploy_command, &repo_directory).await
        {
            eprintln!("task_runner error: {:?}", e);
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
}

async fn run_next_task(
    pool: &MySqlPool,
    notify: &tokio::sync::Notify,
    changed: &watch::Sender<()>,
    deploy_command: &str,
    repo_directory: &Path,
) -> Result<(), anyhow::Error> {
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
        return Ok(());
    }
    let task = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(task) = task else {
        tx.commit().await?;
        println!("No new task found. Sleeping...");
        notify.notified().await;
        return Ok(());
    };

    println!("task: {:?}", task);
    sqlx::query("UPDATE tasks SET status = 'deploying' WHERE id = ?")
        .bind(task.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    changed.send_replace(());

    let succeeded = match deploy_task(pool, changed, &task, deploy_command, repo_directory).await {
        Ok(succeeded) => succeeded,
        Err(e) => {
            eprintln!("deploy error: {:?}", e);
            // Show the error in the task's stderr log as well.
            if let Err(log_error) = append_stderr(task.id, &format!("{:#}", e)) {
                eprintln!("failed to write stderr: {:?}", log_error);
            }
            false
        }
    };
    // A task canceled meanwhile stays canceled.
    let status = if succeeded {
        "deployed"
    } else {
        "deploy_failed"
    };
    sqlx::query("UPDATE tasks SET status = ? WHERE id = ? AND status = 'deploying'")
        .bind(status)
        .bind(task.id)
        .execute(pool)
        .await?;
    changed.send_replace(());
    Ok(())
}

/// Checks out the task's branch, records its commit hash and runs the deploy command,
/// writing their output to the task's stdout/stderr files. Returns whether every step
/// succeeded.
async fn deploy_task(
    pool: &MySqlPool,
    changed: &watch::Sender<()>,
    task: &Task,
    deploy_command: &str,
    repo_directory: &Path,
) -> Result<bool, anyhow::Error> {
    let file_dir = get_task_file_path(task.id)?;
    tokio::fs::create_dir_all(&file_dir).await?;
    println!("file_dir: {:?}", file_dir);
    let stdout = std::fs::File::create(file_dir.join("stdout"))?;
    let mut stderr = std::fs::File::create(file_dir.join("stderr"))?;

    let mut fetch = tokio::process::Command::new("git");
    fetch.arg("fetch");
    let mut checkout = tokio::process::Command::new("git");
    checkout.args(["checkout", &format!("origin/{}", task.branch)]);
    for command in [fetch, checkout] {
        if !run_logged(command, repo_directory, &stdout, &stderr).await? {
            return Ok(false);
        }
    }

    match resolve_commit(repo_directory, "HEAD").await {
        Ok(commit_hash) => {
            sqlx::query("UPDATE tasks SET commit_hash = ? WHERE id = ?")
                .bind(commit_hash)
                .bind(task.id)
                .execute(pool)
                .await?;
            changed.send_replace(());
        }
        // The deploy itself can go on without the hash.
        Err(e) => writeln!(stderr, "{}", e)?,
    }

    let mut deploy = tokio::process::Command::new("bash");
    deploy.args(["-c", deploy_command]);
    run_logged(deploy, repo_directory, &stdout, &stderr).await
}

/// Runs the command in the repository with its output going to the given files.
/// Returns whether it succeeded.
async fn run_logged(
    mut command: tokio::process::Command,
    repo_directory: &Path,
    stdout: &std::fs::File,
    stderr: &std::fs::File,
) -> Result<bool, anyhow::Error> {
    let status = command
        .current_dir(repo_directory)
        .stdout(stdout.try_clone()?)
        .stderr(stderr.try_clone()?)
        .status()
        .await
        .with_context(|| {
            format!(
                "failed to run {:?} in {:?}",
                command.as_std(),
                repo_directory
            )
        })?;
    if !status.success() {
        eprintln!("{:?} failed: {}", command.as_std(), status);
    }
    Ok(status.success())
}

/// Runs git in the repository and returns its trimmed stdout.
async fn git_output(repo_directory: &Path, args: &[&str]) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(args)
        .current_dir(repo_directory)
        .output()
        .await
        .map_err(|e| format!("failed to run git: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "git {} failed ({}): {}",
            args.join(" "),
            output.status,
            String::from_utf8_lossy(&output.stderr).trim_end()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Returns the full hash of the commit that `rev` points to.
async fn resolve_commit(repo_directory: &Path, rev: &str) -> Result<String, String> {
    git_output(
        repo_directory,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{}^{{commit}}", rev),
        ],
    )
    .await
    // --quiet leaves git's stderr empty, so its error says nothing more.
    .map_err(|_| format!("commit not found for {}", rev))
}

/// Fetches the repository and returns the hash of the branch's latest commit.
async fn fetch_branch_commit(repo: &Repo, branch: &str) -> Result<String, String> {
    let _guard = repo.lock.lock().await;
    git_output(&repo.directory, &["fetch"]).await?;
    resolve_commit(&repo.directory, &format!("origin/{}", branch)).await
}

fn append_stderr(id: u64, message: &str) -> Result<(), std::io::Error> {
    let file_dir = get_task_file_path(id)?;
    std::fs::create_dir_all(&file_dir)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_dir.join("stderr"))?;
    writeln!(file, "{}", message)
}

/// Clones the app repository into ./repo and returns its path.
async fn clone_repository(config: &Config) -> Result<PathBuf, String> {
    tokio::fs::remove_dir_all("repo").await.ok();
    let output = tokio::process::Command::new("gh")
        .args(["repo", "clone", &config.app_repository, "repo"])
        .output()
        .await
        .map_err(|e| format!("failed to run gh: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "failed to clone {} ({}): {}\nCheck APP_REPOSITORY in backend .env and `gh auth status` on the server",
            config.app_repository,
            output.status,
            String::from_utf8_lossy(&output.stderr).trim_end()
        ));
    }
    Path::new("repo")
        .canonicalize()
        .map_err(|e| format!("cloned repository not found: {}", e))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    let config = envy::from_env::<Config>()
        .map_err(|e| format!("configuration error: {}. Check backend .env", e))
        .and_then(|config| {
            if !config.disable_deploy && config.deploy_command.is_none() {
                return Err("configuration error: missing value for field deploy_command. Check backend .env".to_string());
            }
            Ok(config)
        });
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
    db::init_db(&pool).await?;
    // Without a config and a repository there is nothing to deploy or record, so only
    // serve the error.
    let startup = match config {
        Ok(config) => clone_repository(&config)
            .await
            .map(|repo_directory| (config, repo_directory)),
        Err(message) => Err(message),
    };
    if let Err(message) = &startup {
        eprintln!("{}", message);
    }
    let notify = Arc::new(tokio::sync::Notify::new());
    let changed = Arc::new(watch::Sender::new(()));
    let startup_error = startup.as_ref().err().map(|e| e.as_str().into());
    let (deploy, repo) = match startup {
        Ok((config, directory)) if config.disable_deploy => {
            println!("deploy is disabled");
            let repo = Repo {
                directory,
                lock: tokio::sync::Mutex::new(()),
            };
            (None, Some(Arc::new(repo)))
        }
        Ok((config, directory)) => (config.deploy_command.map(|c| (c, directory)), None),
        Err(_) => (None, None),
    };
    let state = AppState {
        pool: pool.clone(),
        notify: notify.clone(),
        changed: changed.clone(),
        startup_error,
        repo,
    };
    let app = Router::new()
        .route("/api", axum::routing::get(|| async { "Hello, World!" }))
        .route("/api/init", axum::routing::post(init_handler))
        .route("/api/config", axum::routing::get(get_config_handler))
        .route(
            "/api/tasks/:id/files",
            axum::routing::post(upload_file_handler),
        )
        .route("/api/tasks/:id", axum::routing::patch(update_task_handler))
        .route(
            "/api/tasks/running",
            axum::routing::get(get_running_task_handler),
        )
        .route(
            "/api/tasks/stream",
            axum::routing::get(tasks_stream_handler),
        )
        .route(
            "/api/tasks/:id/stream",
            axum::routing::get(task_stream_handler),
        )
        .route("/api/tasks/:id", axum::routing::get(get_task_handler))
        .route("/api/tasks", axum::routing::get(get_tasks_handler))
        .route("/api/tasks", axum::routing::post(post_task_handler))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            require_config,
        ))
        // Outside require_config: the key is needed to set up deploying in the first place.
        .route("/api/ssh-keys", axum::routing::get(get_ssh_keys_handler))
        .with_state(state);
    if let Some((deploy_command, repo_directory)) = deploy {
        tokio::task::spawn(task_runner(
            pool,
            notify,
            changed,
            deploy_command,
            repo_directory,
        ));
    }
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
