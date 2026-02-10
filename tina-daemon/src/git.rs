use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub timestamp: String,
    pub insertions: u32,
    pub deletions: u32,
}

/// Get new commits in a git repository since the given SHA.
///
/// If `since_sha` is None, returns the last 10 commits.
/// Returns commits in reverse chronological order (newest first).
pub fn get_new_commits(
    repo_path: &Path,
    _branch: &str,
    since_sha: Option<&str>,
) -> Result<Vec<GitCommit>> {
    let range = match since_sha {
        Some(sha) => format!("{}..HEAD", sha),
        None => "HEAD~10..HEAD".to_string(), // First sync: last 10 commits
    };

    // Run: git log <range> --numstat --format=%H|%h|%s|%an <%ae>|%aI
    let output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "log",
            &range,
            "--numstat",
            "--format=%H|%h|%s|%an <%ae>|%aI",
        ])
        .output()
        .context("Failed to run git log")?;

    if !output.status.success() {
        anyhow::bail!(
            "git log failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let stdout = String::from_utf8(output.stdout)?;
    parse_git_log_output(&stdout)
}

fn parse_git_log_output(output: &str) -> Result<Vec<GitCommit>> {
    let mut commits = Vec::new();
    let mut lines = output.lines();

    while let Some(header_line) = lines.next() {
        if header_line.trim().is_empty() {
            continue;
        }

        // Parse header: SHA|shortSHA|subject|author|timestamp
        let parts: Vec<&str> = header_line.split('|').collect();
        if parts.len() != 5 {
            continue; // Skip malformed lines
        }

        let sha = parts[0].to_string();
        let short_sha = parts[1].to_string();
        let subject = parts[2].to_string();
        let author = parts[3].to_string();
        let timestamp = parts[4].to_string();

        // Parse numstat lines until empty line or next commit
        let mut insertions = 0u32;
        let mut deletions = 0u32;

        loop {
            let line = lines.next();
            if line.is_none() || line.unwrap().trim().is_empty() {
                break;
            }

            let stat_line = line.unwrap();
            let parts: Vec<&str> = stat_line.split_whitespace().collect();
            if parts.len() >= 2 {
                // Format: <insertions> <deletions> <filename>
                // Binary files show "-" for insertions/deletions, so parse carefully
                if let Ok(ins) = parts[0].parse::<u32>() {
                    insertions += ins;
                }
                if let Ok(dels) = parts[1].parse::<u32>() {
                    deletions += dels;
                }
            }
        }

        commits.push(GitCommit {
            sha,
            short_sha,
            subject,
            author,
            timestamp,
            insertions,
            deletions,
        });
    }

    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_git_log_output() {
        let output = r#"abc123|abc1234|feat: add feature|John Doe <john@example.com>|2026-02-10T10:00:00Z
3       1       src/main.rs
2       0       README.md

def456|def4567|fix: bug fix|Jane Smith <jane@example.com>|2026-02-10T11:00:00Z
5       2       src/lib.rs
"#;
        let commits = parse_git_log_output(output).unwrap();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].sha, "abc123");
        assert_eq!(commits[0].short_sha, "abc1234");
        assert_eq!(commits[0].subject, "feat: add feature");
        assert_eq!(commits[0].insertions, 5);
        assert_eq!(commits[0].deletions, 1);
        assert_eq!(commits[1].sha, "def456");
        assert_eq!(commits[1].insertions, 5);
        assert_eq!(commits[1].deletions, 2);
    }

    #[test]
    fn test_parse_git_log_output_binary_files() {
        let output = r#"abc123|abc1234|feat: add binary|Author <a@b.c>|2026-02-10T10:00:00Z
-       -       binary.png
10      2       text.txt
"#;
        let commits = parse_git_log_output(output).unwrap();
        assert_eq!(commits.len(), 1);
        // Binary file stats should be ignored (parse fails on "-")
        assert_eq!(commits[0].insertions, 10);
        assert_eq!(commits[0].deletions, 2);
    }

    #[test]
    fn test_parse_git_log_output_empty() {
        let output = "";
        let commits = parse_git_log_output(output).unwrap();
        assert!(commits.is_empty());
    }
}
