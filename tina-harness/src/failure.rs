//! Failure categorization for test harness
//!
//! Categorizes failures to help identify root causes:
//! - Setup: Test infrastructure problems
//! - Orchestration: Convex state issues
//! - Monitor: tina-monitor misreads valid state
//! - Outcome: Feature not implemented correctly

use std::fmt;

/// Category of failure for diagnostics
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureCategory {
    /// Test infrastructure problem (compilation, patch, setup)
    Setup,
    /// Convex orchestration state issues
    Orchestration,
    /// Valid state but tina-monitor shows wrong values
    Monitor,
    /// Everything ran but assertions failed (file changes, tests, etc.)
    Outcome,
}

impl fmt::Display for FailureCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FailureCategory::Setup => write!(f, "Setup"),
            FailureCategory::Orchestration => write!(f, "Orchestration"),
            FailureCategory::Monitor => write!(f, "Monitor"),
            FailureCategory::Outcome => write!(f, "Outcome"),
        }
    }
}

/// A failure with category and details
#[derive(Debug, Clone)]
pub struct CategorizedFailure {
    /// Category of the failure
    pub category: FailureCategory,
    /// Short description of what failed
    pub message: String,
    /// Optional additional details
    pub details: Option<String>,
}

impl CategorizedFailure {
    /// Create a new categorized failure
    pub fn new(category: FailureCategory, message: impl Into<String>) -> Self {
        Self {
            category,
            message: message.into(),
            details: None,
        }
    }

    /// Add details to the failure
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    // Convenience constructors for common failures

    /// Compilation failed during setup
    pub fn compilation_failed(details: impl Into<String>) -> Self {
        Self::new(FailureCategory::Setup, "Compilation failed").with_details(details)
    }

    /// Patch application failed
    pub fn patch_failed(details: impl Into<String>) -> Self {
        Self::new(FailureCategory::Setup, "Patch application failed").with_details(details)
    }

    /// Orchestration state is missing
    pub fn missing_state_file() -> Self {
        Self::new(
            FailureCategory::Orchestration,
            "Orchestration state not found in Convex",
        )
    }

    /// Orchestration state has invalid format
    pub fn invalid_state_format(details: impl Into<String>) -> Self {
        Self::new(FailureCategory::Orchestration, "Invalid orchestration state format")
            .with_details(details)
    }

    /// State is valid but monitor shows wrong data
    pub fn monitor_mismatch(expected: impl Into<String>, actual: impl Into<String>) -> Self {
        Self::new(FailureCategory::Monitor, "Monitor data mismatch").with_details(format!(
            "Expected: {}, Actual: {}",
            expected.into(),
            actual.into()
        ))
    }

    /// Expected file doesn't exist
    pub fn file_not_found(path: impl Into<String>) -> Self {
        Self::new(
            FailureCategory::Outcome,
            format!("Expected file not found: {}", path.into()),
        )
    }

    /// File doesn't contain expected content
    pub fn content_not_found(path: impl Into<String>, expected: impl Into<String>) -> Self {
        Self::new(
            FailureCategory::Outcome,
            format!("File missing expected content: {}", path.into()),
        )
        .with_details(format!("Expected to contain: {}", expected.into()))
    }

    /// Wrong number of phases completed
    pub fn phase_count_mismatch(expected: u32, actual: u32) -> Self {
        Self::new(
            FailureCategory::Outcome,
            format!(
                "Wrong phase count: expected {}, got {}",
                expected, actual
            ),
        )
    }

    /// Final status doesn't match expected
    pub fn status_mismatch(expected: impl Into<String>, actual: impl Into<String>) -> Self {
        Self::new(FailureCategory::Outcome, "Final status mismatch").with_details(format!(
            "Expected: {}, Actual: {}",
            expected.into(),
            actual.into()
        ))
    }

    /// Tests didn't pass when expected to
    pub fn tests_failed(details: impl Into<String>) -> Self {
        Self::new(FailureCategory::Outcome, "Tests did not pass").with_details(details)
    }
}

impl fmt::Display for CategorizedFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.category, self.message)?;
        if let Some(ref details) = self.details {
            write!(f, " - {}", details)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_failure_display() {
        let failure = CategorizedFailure::new(FailureCategory::Setup, "Test failed")
            .with_details("More info");
        assert_eq!(format!("{}", failure), "[Setup] Test failed - More info");
    }

    #[test]
    fn test_convenience_constructors() {
        let comp = CategorizedFailure::compilation_failed("error output");
        assert_eq!(comp.category, FailureCategory::Setup);
        assert!(comp.details.is_some());

        let missing = CategorizedFailure::missing_state_file();
        assert_eq!(missing.category, FailureCategory::Orchestration);

        let mismatch = CategorizedFailure::monitor_mismatch("3 phases", "2 phases");
        assert_eq!(mismatch.category, FailureCategory::Monitor);

        let phase = CategorizedFailure::phase_count_mismatch(3, 2);
        assert_eq!(phase.category, FailureCategory::Outcome);
    }

    #[test]
    fn test_category_display() {
        assert_eq!(format!("{}", FailureCategory::Setup), "Setup");
        assert_eq!(format!("{}", FailureCategory::Orchestration), "Orchestration");
        assert_eq!(format!("{}", FailureCategory::Monitor), "Monitor");
        assert_eq!(format!("{}", FailureCategory::Outcome), "Outcome");
    }
}
