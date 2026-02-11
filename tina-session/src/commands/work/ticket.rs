pub fn create(
    project_id: &str,
    title: &str,
    description: &str,
    priority: &str,
    design_id: Option<&str>,
    assignee: Option<&str>,
    estimate: Option<&str>,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!(
        "ticket create not implemented: project_id={}, title={}",
        project_id, title
    );
    Ok(0)
}

pub fn get(id: Option<&str>, key: Option<&str>, _json: bool) -> Result<u8, anyhow::Error> {
    if id.is_none() && key.is_none() {
        anyhow::bail!("Must specify either --id or --key");
    }
    if id.is_some() && key.is_some() {
        anyhow::bail!("Cannot specify both --id and --key");
    }
    eprintln!("ticket get not implemented");
    Ok(0)
}

pub fn list(
    project_id: &str,
    status: Option<&str>,
    design_id: Option<&str>,
    assignee: Option<&str>,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!("ticket list not implemented: project_id={}", project_id);
    Ok(0)
}

pub fn update(
    id: &str,
    title: Option<&str>,
    description: Option<&str>,
    priority: Option<&str>,
    design_id: Option<&str>,
    assignee: Option<&str>,
    estimate: Option<&str>,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!("ticket update not implemented for id: {}", id);
    Ok(0)
}

pub fn transition(id: &str, status: &str, _json: bool) -> Result<u8, anyhow::Error> {
    eprintln!("ticket transition not implemented: id={}, status={}", id, status);
    Ok(0)
}
