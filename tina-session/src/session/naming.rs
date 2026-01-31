/// Generate canonical session name for a feature and phase.
///
/// Format: tina-{feature}-phase-{phase}
pub fn session_name(feature: &str, phase: u32) -> String {
    format!("tina-{}-phase-{}", feature, phase)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_name() {
        assert_eq!(session_name("auth", 1), "tina-auth-phase-1");
        assert_eq!(session_name("api-refactor", 3), "tina-api-refactor-phase-3");
    }
}
