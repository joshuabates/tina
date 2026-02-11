pub fn comment_add(
    project_id: &str,
    target_type: &str,
    target_id: &str,
    author_type: &str,
    author_name: &str,
    body: &str,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!(
        "comment_add not implemented: project_id={}, target_type={}, target_id={}",
        project_id, target_type, target_id
    );
    Ok(0)
}

pub fn comment_list(
    target_type: &str,
    target_id: &str,
    _json: bool,
) -> Result<u8, anyhow::Error> {
    eprintln!(
        "comment_list not implemented: target_type={}, target_id={}",
        target_type, target_id
    );
    Ok(0)
}
