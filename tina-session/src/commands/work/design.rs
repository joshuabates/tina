use std::path::Path;
use crate::convex;

pub fn create(content: Option<&str>, markdown_file: Option<&Path>) -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "design create requires additional CLI parameters (--project-id, --title) not yet implemented in main.rs"
    ))
}

pub fn update(
    id: &str,
    content: Option<&str>,
    markdown_file: Option<&Path>,
) -> Result<u8, anyhow::Error> {
    Err(anyhow::anyhow!(
        "design update requires additional CLI parameters (--project-id, --title) not yet implemented in main.rs"
    ))
}

pub fn resolve(id: &str, json: bool) -> Result<u8, anyhow::Error> {
    let design = convex::run_convex(|mut writer| async move {
        writer.get_design(&id).await
    })?;

    match design {
        Some(d) => {
            if json {
                println!(
                    "{}",
                    serde_json::json!({
                        "ok": true,
                        "designId": id,
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
            let msg = format!("Design not found: {}", id);
            if json {
                eprintln!(
                    "{}",
                    serde_json::json!({
                        "ok": false,
                        "error": msg,
                    })
                );
            } else {
                eprintln!("{}", msg);
            }
            Ok(1)
        }
    }
}
