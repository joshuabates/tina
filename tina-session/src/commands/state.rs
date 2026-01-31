use std::path::Path;

pub fn update(
    _feature: &str,
    _phase: u32,
    _status: &str,
    _plan_path: Option<&Path>,
) -> anyhow::Result<u8> {
    todo!("state update command")
}

pub fn phase_complete(_feature: &str, _phase: u32, _git_range: &str) -> anyhow::Result<u8> {
    todo!("state phase-complete command")
}

pub fn blocked(_feature: &str, _phase: u32, _reason: &str) -> anyhow::Result<u8> {
    todo!("state blocked command")
}

pub fn show(_feature: &str, _phase: Option<u32>, _json: bool) -> anyhow::Result<u8> {
    todo!("state show command")
}
