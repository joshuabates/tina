pub fn list() -> Result<u8, anyhow::Error> {
    eprintln!("comment list not implemented");
    Ok(0)
}

pub fn create(content: &str) -> Result<u8, anyhow::Error> {
    eprintln!("comment create not implemented: {}", content);
    Ok(0)
}
