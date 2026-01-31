/// Validate phase format.
///
/// Valid formats:
/// - Integer: "1", "2", "3"
/// - Decimal (remediation): "1.5", "2.5"
/// - Nested remediation: "1.5.5"
///
/// Invalid formats:
/// - With suffix: "1-retry", "2.5-retry"
/// - With prefix: "phase-1"
/// - With spaces: "1 retry"
pub fn validate_phase(phase: &str) -> Result<(), String> {
    // Must be non-empty
    if phase.is_empty() {
        return Err("Phase cannot be empty".to_string());
    }

    // Must only contain digits and dots
    if !phase.chars().all(|c| c.is_ascii_digit() || c == '.') {
        // Check for common mistakes and provide helpful guidance
        if phase.contains("retry") || phase.contains("Retry") {
            return Err(format!(
                "Invalid phase '{}': do not add '-retry' suffix.\n\
                 \n\
                 The system handles retries automatically. Use the same phase number:\n\
                 - Original phase: use '{}'\n\
                 - Remediation: use '{}.5' (created by orchestrator after review failure)",
                phase,
                phase.split('-').next().unwrap_or(phase),
                phase.split('-').next().unwrap_or(phase)
            ));
        }
        return Err(format!(
            "Invalid phase '{}': must contain only digits and dots.\n\
             \n\
             Valid examples: '1', '2', '1.5', '2.5'\n\
             - Use integers for main phases: '1', '2', '3'\n\
             - Use decimals for remediation: '1.5', '2.5' (created after review failure)",
            phase
        ));
    }

    // Must not start or end with a dot
    if phase.starts_with('.') || phase.ends_with('.') {
        return Err(format!(
            "Invalid phase '{}': cannot start or end with a dot.\n\
             \n\
             Valid examples: '1', '2', '1.5', '2.5'",
            phase
        ));
    }

    // Must not have consecutive dots
    if phase.contains("..") {
        return Err(format!(
            "Invalid phase '{}': cannot have consecutive dots.\n\
             \n\
             Valid examples: '1', '2', '1.5', '2.5'",
            phase
        ));
    }

    Ok(())
}

/// Generate canonical session name for a feature and phase.
///
/// Format: tina-{feature}-phase-{phase}
/// Phase can be an integer ("1", "2") or decimal for remediation ("1.5", "2.5").
pub fn session_name(feature: &str, phase: &str) -> String {
    format!("tina-{}-phase-{}", feature, phase)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_name() {
        assert_eq!(session_name("auth", "1"), "tina-auth-phase-1");
        assert_eq!(session_name("api-refactor", "3"), "tina-api-refactor-phase-3");
    }

    #[test]
    fn test_session_name_decimal() {
        assert_eq!(session_name("auth", "1.5"), "tina-auth-phase-1.5");
        assert_eq!(session_name("api-refactor", "2.5"), "tina-api-refactor-phase-2.5");
    }

    #[test]
    fn test_validate_phase_valid() {
        assert!(validate_phase("1").is_ok());
        assert!(validate_phase("2").is_ok());
        assert!(validate_phase("10").is_ok());
        assert!(validate_phase("1.5").is_ok());
        assert!(validate_phase("2.5").is_ok());
        assert!(validate_phase("1.5.5").is_ok()); // nested remediation
    }

    #[test]
    fn test_validate_phase_retry_rejected() {
        let result = validate_phase("1-retry");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("do not add '-retry' suffix"));
    }

    #[test]
    fn test_validate_phase_invalid_chars() {
        assert!(validate_phase("1a").is_err());
        assert!(validate_phase("phase-1").is_err());
        assert!(validate_phase("1 ").is_err());
    }

    #[test]
    fn test_validate_phase_invalid_dots() {
        assert!(validate_phase(".1").is_err());
        assert!(validate_phase("1.").is_err());
        assert!(validate_phase("1..5").is_err());
    }
}
