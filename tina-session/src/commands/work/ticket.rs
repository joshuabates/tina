use serde_json::json;
use tina_session::convex;

pub fn create(
    project_id: &str,
    title: &str,
    description: &str,
    priority: &str,
    spec_id: Option<&str>,
    assignee: Option<&str>,
    estimate: Option<&str>,
    json: bool,
) -> Result<u8, anyhow::Error> {
    let ticket_id = convex::run_convex(|mut writer| async move {
        writer
            .create_ticket(
                project_id,
                spec_id,
                title,
                description,
                priority,
                assignee,
                estimate,
            )
            .await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "ticketId": ticket_id,
            })
        );
    } else {
        println!("Created ticket: {}", ticket_id);
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

    let ticket = convex::run_convex(|mut writer| async move {
        if let Some(ticket_id) = id {
            writer.get_ticket(ticket_id).await
        } else {
            writer.get_ticket_by_key(key.unwrap()).await
        }
    })?;

    match ticket {
        Some(t) => {
            if json {
                println!(
                    "{}",
                    json!({
                        "ok": true,
                        "id": t.id,
                        "ticketKey": t.ticket_key,
                        "title": t.title,
                        "description": t.description,
                        "status": t.status,
                        "priority": t.priority,
                        "specId": t.spec_id,
                        "assignee": t.assignee,
                        "estimate": t.estimate,
                        "createdAt": t.created_at,
                        "updatedAt": t.updated_at,
                        "closedAt": t.closed_at,
                    })
                );
            } else {
                println!("{} ({}): {} [{}]", t.ticket_key, t.id, t.title, t.status);
            }
            Ok(0)
        }
        None => {
            if json {
                eprintln!(
                    "{}",
                    json!({
                        "ok": false,
                        "error": "Ticket not found"
                    })
                );
            } else {
                eprintln!("Ticket not found");
            }
            Ok(1)
        }
    }
}

pub fn list(
    project_id: &str,
    status: Option<&str>,
    spec_id: Option<&str>,
    assignee: Option<&str>,
    json: bool,
) -> Result<u8, anyhow::Error> {
    let tickets = convex::run_convex(|mut writer| async move {
        writer
            .list_tickets(project_id, status, spec_id, assignee)
            .await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "tickets": tickets.iter().map(|t| json!({
                    "id": t.id,
                    "ticketKey": t.ticket_key,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "createdAt": t.created_at,
                    "updatedAt": t.updated_at,
                })).collect::<Vec<_>>(),
            })
        );
    } else {
        for t in tickets {
            println!("{} ({}): {} [{}]", t.ticket_key, t.id, t.title, t.status);
        }
    }
    Ok(0)
}

pub fn update(
    id: &str,
    title: Option<&str>,
    description: Option<&str>,
    priority: Option<&str>,
    spec_id: Option<&str>,
    clear_spec_id: bool,
    assignee: Option<&str>,
    estimate: Option<&str>,
    json: bool,
) -> Result<u8, anyhow::Error> {
    if spec_id.is_some() && clear_spec_id {
        anyhow::bail!("Cannot specify both --spec-id and --clear-spec-id");
    }

    let ticket_id = convex::run_convex(|mut writer| async move {
        writer
            .update_ticket(
                id,
                title,
                description,
                priority,
                spec_id,
                clear_spec_id,
                assignee,
                estimate,
            )
            .await
    })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "ticketId": ticket_id,
            })
        );
    } else {
        println!("Updated ticket: {}", ticket_id);
    }
    Ok(0)
}

pub fn transition(id: &str, status: &str, json: bool) -> Result<u8, anyhow::Error> {
    let ticket_id =
        convex::run_convex(|mut writer| async move { writer.transition_ticket(id, status).await })?;

    if json {
        println!(
            "{}",
            json!({
                "ok": true,
                "ticketId": ticket_id,
            })
        );
    } else {
        println!("Transitioned ticket {} to status: {}", ticket_id, status);
    }
    Ok(0)
}
