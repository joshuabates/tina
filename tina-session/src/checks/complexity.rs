use std::path::Path;

use crate::error::Result;

/// Check complexity against budget.
pub fn check_complexity(
    _cwd: &Path,
    _max_file_lines: u32,
    _max_total_lines: u32,
    _max_complexity: u32,
) -> Result<Vec<String>> {
    todo!("complexity check")
}
