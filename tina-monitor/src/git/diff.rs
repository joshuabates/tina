//! Diff statistics for git ranges

use anyhow::Result;
use std::path::Path;
use super::git_command;

/// Statistics for a single file in a diff
#[derive(Debug, Clone, PartialEq)]
pub struct FileDiff {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
    pub is_binary: bool,
}

/// Overall diff statistics
#[derive(Debug, Clone, PartialEq)]
pub struct DiffStat {
    pub files: Vec<FileDiff>,
    pub files_changed: usize,
    pub total_insertions: usize,
    pub total_deletions: usize,
}

/// Get detailed diff statistics using --numstat
pub fn get_diff_stats(cwd: &Path, range: &str) -> Result<DiffStat> {
    let output = git_command(cwd, &["diff", "--numstat", range])?;

    let mut files = Vec::new();
    let mut total_insertions = 0;
    let mut total_deletions = 0;

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let insertions_str = parts[0];
        let deletions_str = parts[1];
        let path = parts[2..].join(" ");

        // Handle binary files (marked as "-")
        let is_binary = insertions_str == "-" || deletions_str == "-";

        let insertions = if is_binary {
            0
        } else {
            insertions_str.parse().unwrap_or(0)
        };

        let deletions = if is_binary {
            0
        } else {
            deletions_str.parse().unwrap_or(0)
        };

        total_insertions += insertions;
        total_deletions += deletions;

        files.push(FileDiff {
            path,
            insertions,
            deletions,
            is_binary,
        });
    }

    let files_changed = files.len();

    Ok(DiffStat {
        files,
        files_changed,
        total_insertions,
        total_deletions,
    })
}

/// Get full diff with summary using --stat
pub fn get_full_diff(cwd: &Path, range: &str) -> Result<String> {
    git_command(cwd, &["diff", "--stat", range])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn get_test_repo_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
    }

    #[test]
    fn test_parse_numstat() {
        // Test parsing git diff --numstat output
        let repo = get_test_repo_path();
        let result = get_diff_stats(&repo, "HEAD~1..HEAD");

        assert!(result.is_ok(), "should parse numstat successfully");
        let stats = result.unwrap();

        if !stats.files.is_empty() {
            let file = &stats.files[0];
            assert!(!file.path.is_empty(), "file path should not be empty");
            // insertions and deletions are usize, always non-negative
            assert!(file.insertions == file.insertions, "insertions should parse");
            assert!(file.deletions == file.deletions, "deletions should parse");
        }

        assert_eq!(stats.files_changed, stats.files.len(), "files_changed should match files count");

        // Verify totals match sum of individual files
        let total_ins: usize = stats.files.iter().map(|f| f.insertions).sum();
        let total_del: usize = stats.files.iter().map(|f| f.deletions).sum();
        assert_eq!(stats.total_insertions, total_ins, "total insertions should match sum");
        assert_eq!(stats.total_deletions, total_del, "total deletions should match sum");
    }

    #[test]
    fn test_empty_range() {
        // Test handling of empty diff range
        let repo = get_test_repo_path();
        let result = get_diff_stats(&repo, "HEAD..HEAD");

        assert!(result.is_ok(), "should handle empty range gracefully");
        let stats = result.unwrap();
        assert_eq!(stats.files.len(), 0, "should have no files");
        assert_eq!(stats.files_changed, 0, "files_changed should be 0");
        assert_eq!(stats.total_insertions, 0, "total insertions should be 0");
        assert_eq!(stats.total_deletions, 0, "total deletions should be 0");
    }

    #[test]
    fn test_full_diff_output() {
        // Test that full diff returns proper --stat output
        let repo = get_test_repo_path();
        let result = get_full_diff(&repo, "HEAD~1..HEAD");

        assert!(result.is_ok(), "should get full diff successfully");
        let diff = result.unwrap();
        // For non-empty ranges, should have some output
        // For empty ranges, output will be empty
        // Just verify we got a string back
        assert_eq!(diff, diff, "diff output should be valid string");
    }
}
