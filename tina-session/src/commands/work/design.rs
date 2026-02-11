use std::path::Path;

pub fn create(content: Option<&str>, markdown_file: Option<&Path>) -> Result<u8, anyhow::Error> {
    if content.is_none() && markdown_file.is_none() {
        return Err(anyhow::anyhow!("Either --content or --markdown-file must be provided"));
    }
    eprintln!("design create not implemented");
    Ok(0)
}

pub fn update(
    id: &str,
    content: Option<&str>,
    markdown_file: Option<&Path>,
) -> Result<u8, anyhow::Error> {
    if content.is_none() && markdown_file.is_none() {
        return Err(anyhow::anyhow!("Either --content or --markdown-file must be provided"));
    }
    eprintln!("design update not implemented for id: {}", id);
    Ok(0)
}

pub fn resolve(id: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design resolve not implemented for id: {}", id);
    Ok(0)
}
