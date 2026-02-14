use serde_json::json;
use std::path::Path;
use tina_session::convex;

fn map_spec_id_error(err: anyhow::Error, spec_id: &str) -> anyhow::Error {
    let msg = format!("{:#}", err);
    if msg.contains("ArgumentValidationError")
        && (msg.contains("Path: .specId") || msg.contains("Validator: v.id(\"specs\")"))
    {
        return anyhow::anyhow!(
            "Invalid spec id '{}': expected a Convex specs document id",
            spec_id
        );
    }
    anyhow::anyhow!(msg)
}

pub fn create(
    project_id: &str,
    title: &str,
    markdown: &str,
    json: bool,
) -> Result<u8, anyhow::Error> {
    let spec_id = convex::run_convex(|mut writer| async move {
        writer.create_spec(project_id, title, markdown).await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "specId": spec_id,
            })
        );
    } else {
        println!("Created spec: {}", spec_id);
    }
    Ok(0)
}

pub fn get(id: Option<&str>, key: Option<&str>, json: bool) -> Result<u8, anyhow::Error> {
    if id.is_none() && key.is_none() {
        anyhow::bail!("Must specify either --id or --key");
    }
    if id.is_some() && key.is_some() {
        anyhow::bail!("Cannot specify both --id and --key");
    }

    let spec = convex::run_convex(|mut writer| async move {
        if let Some(spec_id) = id {
            writer.get_spec(spec_id).await
        } else {
            writer.get_spec_by_key(key.unwrap()).await
        }
    })?;

    match spec {
        Some(d) => {
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "id": d.id,
                        "specKey": d.spec_key,
                        "title": d.title,
                        "markdown": d.markdown,
                        "status": d.status,
                        "createdAt": d.created_at,
                        "updatedAt": d.updated_at,
                        "archivedAt": d.archived_at,
                    })
                );
            } else {
                println!("{} ({}): {} [{}]", d.spec_key, d.id, d.title, d.status);
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Spec not found"
                    })
                );
            } else {
                eprintln!("Spec not found");
            }
            Ok(1)
        }
    }
}

pub fn list(project_id: &str, status: Option<&str>, json: bool) -> Result<u8, anyhow::Error> {
    let specs =
        convex::run_convex(
            |mut writer| async move { writer.list_specs(project_id, status).await },
        )?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "specs": specs.iter().map(|d| json!({
                    "id": d.id,
                    "specKey": d.spec_key,
                    "title": d.title,
                    "status": d.status,
                    "createdAt": d.created_at,
                    "updatedAt": d.updated_at,
                })).collect::<Vec<_>>(),
            })
        );
    } else {
        for d in specs {
            println!("{} ({}): {} [{}]", d.spec_key, d.id, d.title, d.status);
        }
    }
    Ok(0)
}

pub fn update(
    id: &str,
    title: Option<&str>,
    markdown: Option<&str>,
    json: bool,
) -> Result<u8, anyhow::Error> {
    let spec_id =
        convex::run_convex(
            |mut writer| async move { writer.update_spec(id, title, markdown).await },
        )?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "specId": spec_id,
            })
        );
    } else {
        println!("Updated spec: {}", spec_id);
    }
    Ok(0)
}

pub fn transition(id: &str, status: &str, json: bool) -> Result<u8, anyhow::Error> {
    let spec_id =
        convex::run_convex(|mut writer| async move { writer.transition_spec(id, status).await })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "specId": spec_id,
            })
        );
    } else {
        println!("Transitioned spec {} to status: {}", spec_id, status);
    }
    Ok(0)
}

pub fn resolve(spec_id: &str, json: bool) -> Result<u8, anyhow::Error> {
    let spec = convex::run_convex(|mut writer| async move { writer.get_spec(spec_id).await })
        .map_err(|e| map_spec_id_error(e, spec_id))?;

    match spec {
        Some(d) => {
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "specId": d.id,
                        "specKey": d.spec_key,
                        "title": d.title,
                        "markdown": d.markdown,
                        "status": d.status,
                    })
                );
            } else {
                println!("{}", d.markdown);
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Spec not found"
                    })
                );
            } else {
                eprintln!("Spec not found");
            }
            Ok(1)
        }
    }
}

pub fn resolve_to_file(spec_id: &str, output: &Path, json: bool) -> Result<u8, anyhow::Error> {
    let spec = convex::run_convex(|mut writer| async move { writer.get_spec(spec_id).await })
        .map_err(|e| map_spec_id_error(e, spec_id))?;

    match spec {
        Some(d) => {
            std::fs::write(output, &d.markdown)?;
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "specId": d.id,
                        "outputPath": output.display().to_string(),
                    })
                );
            } else {
                println!("Wrote spec {} to {}", d.spec_key, output.display());
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Spec not found"
                    })
                );
            } else {
                eprintln!("Spec not found");
            }
            Ok(1)
        }
    }
}
