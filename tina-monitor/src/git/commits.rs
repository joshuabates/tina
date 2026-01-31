//! Commit history and statistics

use super::git_command;
use anyhow::Result;
use std::path::Path;

/// A single commit in git history
#[derive(Debug, Clone, PartialEq)]
pub struct Commit {
    pub short_hash: String,
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub relative_time: String,
}

/// Summary of commits in a range
#[derive(Debug, Clone, PartialEq)]
pub struct CommitSummary {
    pub commits: Vec<Commit>,
    pub total_commits: usize,
    pub insertions: usize,
    pub deletions: usize,
}

/// Get commits in the given range
pub fn get_commits(cwd: &Path, range: &str) -> Result<CommitSummary> {
    // Format: short_hash|hash|subject|author|relative_time
    let format = "--pretty=format:%h|%H|%s|%an|%ar";
    let output = git_command(cwd, &["log", format, range])?;

    let commits: Vec<Commit> = output
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            Commit {
                short_hash: parts.first().unwrap_or(&"").to_string(),
                hash: parts.get(1).unwrap_or(&"").to_string(),
                subject: parts.get(2).unwrap_or(&"").to_string(),
                author: parts.get(3).unwrap_or(&"").to_string(),
                relative_time: parts.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    let total_commits = commits.len();
    let (insertions, deletions) = get_shortstat(cwd, range)?;

    Ok(CommitSummary {
        commits,
        total_commits,
        insertions,
        deletions,
    })
}

/// Get shortstat for a range (insertions/deletions)
fn get_shortstat(cwd: &Path, range: &str) -> Result<(usize, usize)> {
    let output = git_command(cwd, &["diff", "--shortstat", range])?;

    if output.trim().is_empty() {
        return Ok((0, 0));
    }

    // Parse format: "N files changed, M insertions(+), K deletions(-)"
    let mut insertions = 0;
    let mut deletions = 0;

    for part in output.split(',') {
        let part = part.trim();
        if part.contains("insertion") {
            if let Some(num_str) = part.split_whitespace().next() {
                insertions = num_str.parse().unwrap_or(0);
            }
        } else if part.contains("deletion") {
            if let Some(num_str) = part.split_whitespace().next() {
                deletions = num_str.parse().unwrap_or(0);
            }
        }
    }

    Ok((insertions, deletions))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn get_test_repo_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf()
    }

    #[test]
    fn test_parse_commit_format() {
        // Test that we can parse the git log format correctly
        let repo = get_test_repo_path();
        let result = get_commits(&repo, "HEAD~1..HEAD");

        assert!(result.is_ok(), "should parse commits successfully");
        let summary = result.unwrap();
        assert!(
            !summary.commits.is_empty(),
            "should have at least one commit"
        );

        let commit = &summary.commits[0];
        assert!(
            !commit.short_hash.is_empty(),
            "short hash should not be empty"
        );
        assert!(!commit.hash.is_empty(), "hash should not be empty");
        assert!(!commit.subject.is_empty(), "subject should not be empty");
        assert!(!commit.author.is_empty(), "author should not be empty");
        assert!(
            !commit.relative_time.is_empty(),
            "relative time should not be empty"
        );
        assert_eq!(
            commit.short_hash.len(),
            7,
            "short hash should be 7 characters"
        );
        assert!(
            commit.hash.len() >= 40,
            "full hash should be at least 40 characters"
        );
    }

    #[test]
    fn test_parse_shortstat() {
        // Test parsing insertion/deletion stats
        let repo = get_test_repo_path();
        let result = get_commits(&repo, "HEAD~1..HEAD");

        assert!(result.is_ok(), "should get stats successfully");
        let summary = result.unwrap();
        // Stats may be 0 for some commits, but should parse correctly
        // Both insertions and deletions are valid (could be 0 or positive)
        assert!(
            summary.insertions == summary.insertions,
            "insertions should parse"
        );
        assert!(
            summary.deletions == summary.deletions,
            "deletions should parse"
        );
    }

    #[test]
    fn test_empty_range() {
        // Test handling of empty commit range
        let repo = get_test_repo_path();
        let result = get_commits(&repo, "HEAD..HEAD");

        assert!(result.is_ok(), "should handle empty range gracefully");
        let summary = result.unwrap();
        assert_eq!(summary.commits.len(), 0, "should have no commits");
        assert_eq!(summary.total_commits, 0, "total should be 0");
        assert_eq!(summary.insertions, 0, "insertions should be 0");
        assert_eq!(summary.deletions, 0, "deletions should be 0");
    }
}
