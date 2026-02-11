use crate::convex;

pub fn list() -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "ticket list requires additional CLI parameters (--project-id) not yet implemented in main.rs"
    ))
}

pub fn create(title: &str) -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "ticket create requires additional CLI parameters (--project-id, --description, --priority) not yet implemented in main.rs"
    ))
}

pub fn update(id: &str, _title: Option<&str>) -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "ticket update requires additional CLI parameters not yet implemented in main.rs"
    ))
}
