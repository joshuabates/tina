//! Data modules for tina-monitor
//!
//! Re-exports from the tina-data crate, which provides the shared data layer.

pub use tina_data::discovery;
pub use tina_data::tasks;
pub use tina_data::teams;
pub use tina_data::tina_state;
pub use tina_data::watcher;

pub use tina_data::DataSource;
pub use tina_data::LoadedOrchestration as Orchestration;
pub use tina_data::OrchestrationSummary;
