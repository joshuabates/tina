use anyhow::bail;

pub fn convex_url(env: Option<&str>) -> anyhow::Result<u8> {
    let cfg = tina_session::config::load_config_for_env(env)?;
    let url = cfg
        .convex_url
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("convex_url is not set for '{}' environment", cfg.env))?;

    println!("{}", url);
    Ok(0)
}

pub fn show(env: Option<&str>) -> anyhow::Result<u8> {
    let cfg = tina_session::config::load_config_for_env(env)?;

    let convex_url = cfg.convex_url.filter(|s| !s.trim().is_empty());

    if convex_url.is_none() {
        bail!("convex_url is not set for '{}' environment", cfg.env);
    }

    let output = serde_json::json!({
        "env": cfg.env,
        "convex_url": convex_url,
        "auth_token_set": cfg
            .auth_token
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false),
        "node_name": cfg.node_name,
    });

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(0)
}
