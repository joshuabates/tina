use std::net::SocketAddr;

use tokio::net::TcpListener;

use tina_web::state::AppState;

/// Start the server on a random port and return the address
async fn start_test_server() -> SocketAddr {
    let state = AppState::new();
    let app = tina_web::build_router(state);

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    addr
}

#[tokio::test]
async fn test_health_endpoint() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://{}/api/health", addr))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.unwrap();
    assert_eq!(body["status"], "ok");
}

#[tokio::test]
async fn test_orchestrations_returns_empty_array() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://{}/api/orchestrations", addr))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.unwrap();
    assert!(body.is_array());
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn test_nonexistent_orchestration_returns_404() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://{}/api/orchestrations/nonexistent", addr))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_nonexistent_tasks_returns_404() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "http://{}/api/orchestrations/nonexistent/tasks",
            addr
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_nonexistent_team_returns_404() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "http://{}/api/orchestrations/nonexistent/team",
            addr
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_nonexistent_phases_returns_404() {
    let addr = start_test_server().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "http://{}/api/orchestrations/nonexistent/phases",
            addr
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 404);
}
