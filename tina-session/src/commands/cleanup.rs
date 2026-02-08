use tina_session::convex;

pub fn run(feature: &str) -> anyhow::Result<u8> {
    // Check if orchestration exists in Convex
    let orch = convex::run_convex(|mut writer| async move {
        writer.get_by_feature(feature).await
    })?;

    match orch {
        Some(_) => {
            println!("Orchestration '{}' exists in Convex. No local state to clean up.", feature);
            Ok(0)
        }
        None => {
            println!("No orchestration found for '{}'.", feature);
            Ok(1)
        }
    }
}
