use std::path::{Path, PathBuf};

pub fn get_task_file_path(id: u64) -> Result<PathBuf, std::io::Error> {
    Ok(Path::canonicalize(Path::new("."))?
        .join("file")
        .join(id.to_string()))
}
