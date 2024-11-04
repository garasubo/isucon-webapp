use axum::extract::State;
use axum::response;
use axum::Router;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use sqlx::{ConnectOptions, Executor};

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
struct Task {
    id: u64,
    branch: String,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error(transparent)]
    SqlxError(#[from] sqlx::Error),
    #[error(transparent)]
    InternalServerError(#[from] anyhow::Error),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
        axum::http::Response::builder()
            .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
            .body(axum::body::Body::from(format!("{:?}", self)))
            .unwrap()
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
    let tasks: Vec<Task> = sqlx::query_as("SELECT id, branch FROM tasks")
        .fetch_all(&pool)
        .await?;
    Ok(axum::Json(tasks))
}

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = MySqlConnectOptions::new()
        .host("localhost")
        .port(3306)
        .username("isucon")
        .password("isucon")
        .database("isucon-webapp");
    let pool = MySqlPoolOptions::new().connect_with(options).await?;
    let app = Router::new()
        .route("/", axum::routing::get(|| async { "Hello, World!" }))
        .route("/init", axum::routing::post(init_handler))
        .route("/tasks", axum::routing::get(get_tasks_handler))
        .with_state(AppState { pool });
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
    Ok(())
}
