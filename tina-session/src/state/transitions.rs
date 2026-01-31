use crate::error::{Result, SessionError};
use crate::state::schema::PhaseStatus;

/// Validate a status transition is allowed.
pub fn validate_transition(from: PhaseStatus, to: PhaseStatus) -> Result<()> {
    let valid = match from {
        PhaseStatus::Planning => matches!(to, PhaseStatus::Planned | PhaseStatus::Blocked),
        PhaseStatus::Planned => matches!(to, PhaseStatus::Executing | PhaseStatus::Blocked),
        PhaseStatus::Executing => matches!(to, PhaseStatus::Reviewing | PhaseStatus::Blocked),
        PhaseStatus::Reviewing => matches!(to, PhaseStatus::Complete | PhaseStatus::Blocked),
        PhaseStatus::Complete => false, // Terminal state
        PhaseStatus::Blocked => {
            // Can transition back to previous state or stay blocked
            matches!(
                to,
                PhaseStatus::Planning
                    | PhaseStatus::Planned
                    | PhaseStatus::Executing
                    | PhaseStatus::Reviewing
            )
        }
    };

    if valid {
        Ok(())
    } else {
        Err(SessionError::InvalidTransition {
            from: from.to_string(),
            to: to.to_string(),
        })
    }
}

/// Get valid transitions from a status.
pub fn valid_transitions(from: PhaseStatus) -> Vec<PhaseStatus> {
    match from {
        PhaseStatus::Planning => vec![PhaseStatus::Planned, PhaseStatus::Blocked],
        PhaseStatus::Planned => vec![PhaseStatus::Executing, PhaseStatus::Blocked],
        PhaseStatus::Executing => vec![PhaseStatus::Reviewing, PhaseStatus::Blocked],
        PhaseStatus::Reviewing => vec![PhaseStatus::Complete, PhaseStatus::Blocked],
        PhaseStatus::Complete => vec![],
        PhaseStatus::Blocked => vec![
            PhaseStatus::Planning,
            PhaseStatus::Planned,
            PhaseStatus::Executing,
            PhaseStatus::Reviewing,
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        // Planning can go to Planned or Blocked
        assert!(validate_transition(PhaseStatus::Planning, PhaseStatus::Planned).is_ok());
        assert!(validate_transition(PhaseStatus::Planning, PhaseStatus::Blocked).is_ok());
        assert!(validate_transition(PhaseStatus::Planning, PhaseStatus::Executing).is_err());
        assert!(validate_transition(PhaseStatus::Planning, PhaseStatus::Complete).is_err());

        // Planned can go to Executing or Blocked
        assert!(validate_transition(PhaseStatus::Planned, PhaseStatus::Executing).is_ok());
        assert!(validate_transition(PhaseStatus::Planned, PhaseStatus::Blocked).is_ok());
        assert!(validate_transition(PhaseStatus::Planned, PhaseStatus::Complete).is_err());

        // Executing can go to Reviewing or Blocked
        assert!(validate_transition(PhaseStatus::Executing, PhaseStatus::Reviewing).is_ok());
        assert!(validate_transition(PhaseStatus::Executing, PhaseStatus::Blocked).is_ok());
        assert!(validate_transition(PhaseStatus::Executing, PhaseStatus::Complete).is_err());

        // Reviewing can go to Complete or Blocked
        assert!(validate_transition(PhaseStatus::Reviewing, PhaseStatus::Complete).is_ok());
        assert!(validate_transition(PhaseStatus::Reviewing, PhaseStatus::Blocked).is_ok());
        assert!(validate_transition(PhaseStatus::Reviewing, PhaseStatus::Planning).is_err());

        // Complete is terminal
        assert!(validate_transition(PhaseStatus::Complete, PhaseStatus::Planning).is_err());
        assert!(validate_transition(PhaseStatus::Complete, PhaseStatus::Blocked).is_err());

        // Blocked can return to previous states
        assert!(validate_transition(PhaseStatus::Blocked, PhaseStatus::Planning).is_ok());
        assert!(validate_transition(PhaseStatus::Blocked, PhaseStatus::Executing).is_ok());
    }
}
