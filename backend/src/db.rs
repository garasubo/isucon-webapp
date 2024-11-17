use sqlx::{Executor, MySqlPool};

pub async fn init_db(pool: &MySqlPool) -> Result<(), sqlx::Error> {
    pool.execute(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            branch VARCHAR(255) NOT NULL,
            status CHAR(16) NOT NULL DEFAULT 'pending',
            score BIGINT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ",
    )
        .await?;
    Ok(())
}