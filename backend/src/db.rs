use sqlx::{Executor, MySqlPool};

pub async fn init_db(pool: &MySqlPool) -> Result<(), sqlx::Error> {
    pool.execute(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            branch VARCHAR(255) NOT NULL,
            commit_hash CHAR(40),
            status CHAR(16) NOT NULL DEFAULT 'pending',
            score BIGINT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ",
    )
    .await?;
    // Tables created before commit_hash existed. MySQL has no ADD COLUMN IF NOT EXISTS.
    let (has_commit_hash,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'commit_hash'",
    )
    .fetch_one(pool)
    .await?;
    if has_commit_hash == 0 {
        pool.execute("ALTER TABLE tasks ADD COLUMN commit_hash CHAR(40) AFTER branch")
            .await?;
    }
    Ok(())
}
