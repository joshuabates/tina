use serde_json::json;
use tina_session::convex;

pub fn add(
    project_id: &str,
    target_type: &str,
    target_id: &str,
    author_type: &str,
    author_name: &str,
    body: &str,
    json: bool,
) -> Result<u8, anyhow::Error> {
    let comment_id = convex::run_convex(|mut writer| async move {
        writer
            .add_comment(
                project_id,
                target_type,
                target_id,
                author_type,
                author_name,
                body,
            )
            .await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "commentId": comment_id,
            })
        );
    } else {
        println!("Added comment: {}", comment_id);
    }
    Ok(0)
}

pub fn list(target_type: &str, target_id: &str, json: bool) -> Result<u8, anyhow::Error> {
    let comments = convex::run_convex(|mut writer| async move {
        writer.list_comments(target_type, target_id).await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "comments": comments.iter().map(|c| json!({
                    "id": c.id,
                    "targetType": c.target_type,
                    "targetId": c.target_id,
                    "authorType": c.author_type,
                    "authorName": c.author_name,
                    "body": c.body,
                    "createdAt": c.created_at,
                    "editedAt": c.edited_at,
                })).collect::<Vec<_>>(),
            })
        );
    } else {
        for c in comments {
            println!("[{}] {}: {}", c.created_at, c.author_name, c.body);
        }
    }
    Ok(0)
}
