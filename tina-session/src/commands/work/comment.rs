use crate::convex;

pub fn list() -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "comment list requires additional CLI parameters (--target-type, --target-id) not yet implemented in main.rs"
    ))
}

pub fn create(content: &str) -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "comment create requires additional CLI parameters (--project-id, --target-type, --target-id, --author-type, --author-name) not yet implemented in main.rs"
    ))
}
