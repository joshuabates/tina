pub fn design_create(project_id: &str, title: &str, markdown: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design_create not implemented: project_id={}, title={}", project_id, title);
    Ok(0)
}

pub fn design_get(id: Option<&str>, key: Option<&str>, _json: bool) -> Result<u8, anyhow::Error> {
    if id.is_none() && key.is_none() {
        anyhow::bail!("Must specify either --id or --key");
    }
    if id.is_some() && key.is_some() {
        anyhow::bail!("Cannot specify both --id and --key");
    }
    eprintln!("design_get not implemented");
    Ok(0)
}

pub fn design_list(project_id: &str, status: Option<&str>, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design_list not implemented: project_id={}", project_id);
    Ok(0)
}

pub fn design_update(
    id: &str,
    title: Option<&str>,
    markdown: Option<&str>,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!("design_update not implemented for id: {}", id);
    Ok(0)
}

pub fn design_transition(id: &str, status: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design_transition not implemented: id={}, status={}", id, status);
    Ok(0)
}

pub fn design_resolve(design_id: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("design_resolve not implemented: design_id={}", design_id);
    Ok(0)
}
