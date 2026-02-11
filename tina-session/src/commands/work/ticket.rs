pub fn list() -> Result<u8, anyhow::Error> {
    eprintln!("ticket list not implemented");
    Ok(0)
}

pub fn create(title: &str) -> Result<u8, anyhow::Error> {
    eprintln!("ticket create not implemented: {}", title);
    Ok(0)
}

pub fn update(id: &str, _title: Option<&str>) -> Result<u8, anyhow::Error> {
    eprintln!("ticket update not implemented for id: {}", id);
    Ok(0)
}
