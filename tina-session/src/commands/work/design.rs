pub fn create(project_id: &str, title: &str, markdown: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design create not implemented: project_id={}, title={}", project_id, title);
    Ok(0)
}

pub fn get(id: Option<&str>, key: Option<&str>, _json: bool) -> Result<u8, anyhow::Error> {
    if id.is_none() && key.is_none() {
        anyhow::bail!("Must specify either --id or --key");
    }
    if id.is_some() && key.is_some() {
        anyhow::bail!("Cannot specify both --id and --key");
    }
    eprintln!("design get not implemented");
    Ok(0)
}

pub fn list(project_id: &str, status: Option<&str>, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design list not implemented: project_id={}", project_id);
    Ok(0)
}

pub fn update(
    id: &str,
    title: Option<&str>,
    markdown: Option<&str>,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!("design update not implemented for id: {}", id);
    Ok(0)
}

pub fn transition(id: &str, status: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design transition not implemented: id={}, status={}", id, status);
    Ok(0)
}

pub fn resolve(design_id: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design resolve not implemented: design_id={}", design_id);
    Ok(0)
}
