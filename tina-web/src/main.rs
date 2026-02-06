use std::net::SocketAddr;

use tracing_subscriber;

use tina_web::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    // Load initial data
    state.reload().await;

    // Start file watcher (keep handle alive)
    let _watcher = tina_web::start_file_watcher(state.clone())?;

    // Check for built frontend in frontend/dist
    let static_dir = std::env::current_dir()?.join("frontend").join("dist");
    let app = if static_dir.exists() {
        tracing::info!("Serving static files from {}", static_dir.display());
        tina_web::build_router_with_static(state, static_dir.to_str().unwrap())
    } else {
        tracing::info!("No frontend build found, serving API only");
        tina_web::build_router(state)
    };

    let addr = SocketAddr::from(([127, 0, 0, 1], 3100));
    tracing::info!("tina-web listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
