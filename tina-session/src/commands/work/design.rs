use serde_json::json;
use std::path::Path;
use tina_session::convex;

fn map_design_id_error(err: anyhow::Error, design_id: &str) -> anyhow::Error {
    let msg = format!("{:#}", err);
    if msg.contains("ArgumentValidationError")
        && (msg.contains("Path: .designId") || msg.contains("Validator: v.id(\"designs\")"))
    {
        return anyhow::anyhow!(
            "Invalid design id '{}': expected a Convex designs document id",
            design_id
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
    let design_id = convex::run_convex(|mut writer| async move {
        writer.create_design(project_id, title, markdown).await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "designId": design_id,
            })
        );
    } else {
        println!("Created design: {}", design_id);
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

    let design = convex::run_convex(|mut writer| async move {
        if let Some(design_id) = id {
            writer.get_design(design_id).await
        } else {
            writer.get_design_by_key(key.unwrap()).await
        }
    })?;

    match design {
        Some(d) => {
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "id": d.id,
                        "designKey": d.design_key,
                        "title": d.title,
                        "markdown": d.markdown,
                        "status": d.status,
                        "createdAt": d.created_at,
                        "updatedAt": d.updated_at,
                        "archivedAt": d.archived_at,
                    })
                );
            } else {
                println!("{} ({}): {} [{}]", d.design_key, d.id, d.title, d.status);
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Design not found"
                    })
                );
            } else {
                eprintln!("Design not found");
            }
            Ok(1)
        }
    }
}

pub fn list(project_id: &str, status: Option<&str>, json: bool) -> Result<u8, anyhow::Error> {
    let designs =
        convex::run_convex(
            |mut writer| async move { writer.list_designs(project_id, status).await },
        )?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "designs": designs.iter().map(|d| json!({
                    "id": d.id,
                    "designKey": d.design_key,
                    "title": d.title,
                    "status": d.status,
                    "createdAt": d.created_at,
                    "updatedAt": d.updated_at,
                })).collect::<Vec<_>>(),
            })
        );
    } else {
        for d in designs {
            println!("{} ({}): {} [{}]", d.design_key, d.id, d.title, d.status);
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
    let design_id =
        convex::run_convex(
            |mut writer| async move { writer.update_design(id, title, markdown).await },
        )?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "designId": design_id,
            })
        );
    } else {
        println!("Updated design: {}", design_id);
    }
    Ok(0)
}

pub fn transition(id: &str, status: &str, json: bool) -> Result<u8, anyhow::Error> {
    let design_id =
        convex::run_convex(|mut writer| async move { writer.transition_design(id, status).await })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "designId": design_id,
            })
        );
    } else {
        println!("Transitioned design {} to status: {}", design_id, status);
    }
    Ok(0)
}

pub fn resolve(design_id: &str, json: bool) -> Result<u8, anyhow::Error> {
    let design = convex::run_convex(|mut writer| async move { writer.get_design(design_id).await })
        .map_err(|e| map_design_id_error(e, design_id))?;

    match design {
        Some(d) => {
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "designId": d.id,
                        "designKey": d.design_key,
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
                        "error": "Design not found"
                    })
                );
            } else {
                eprintln!("Design not found");
            }
            Ok(1)
        }
    }
}

pub fn resolve_to_file(design_id: &str, output: &Path, json: bool) -> Result<u8, anyhow::Error> {
    let design = convex::run_convex(|mut writer| async move { writer.get_design(design_id).await })
        .map_err(|e| map_design_id_error(e, design_id))?;

    match design {
        Some(d) => {
            std::fs::write(output, &d.markdown)?;
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "designId": d.id,
                        "outputPath": output.display().to_string(),
                    })
                );
            } else {
                println!("Wrote design {} to {}", d.design_key, output.display());
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Design not found"
                    })
                );
            } else {
                eprintln!("Design not found");
            }
            Ok(1)
        }
    }
}
