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
    // Run:
    // - Incremental: git log <since_sha>..HEAD --numstat --format=...
    // - First sync: git log -n 10 HEAD --numstat --format=...
    //
    // Using HEAD~10..HEAD fails on short histories; "-n 10 HEAD" works even
    // when fewer than 10 commits exist.
    let output = if let Some(sha) = since_sha {
        let range = format!("{}..HEAD", sha);
        Command::new("git")
            .current_dir(repo_path)
            .args([
                "log",
                &range,
                "--numstat",
                "--format=%H|%h|%s|%an <%ae>|%aI",
            ])
            .output()
            .context("Failed to run git log")?
    } else {
        Command::new("git")
            .current_dir(repo_path)
            .args([
                "log",
                "-n",
                "10",
                "HEAD",
                "--numstat",
                "--format=%H|%h|%s|%an <%ae>|%aI",
            ])
            .output()
            .context("Failed to run git log")?
    };

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

// -- Diff types and parsing --

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffFileStat {
    pub path: String,
    pub status: FileStatus,
    pub insertions: u32,
    pub deletions: u32,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineKind {
    Context,
    Add,
    Delete,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
}

/// Get the list of changed files between `base` and HEAD with stats.
///
/// Runs `git diff --name-status` and `git diff --numstat` with
/// `--diff-filter=ACDMR --find-renames` and joins the results.
pub fn get_diff_file_list(repo_path: &Path, base: &str) -> Result<Vec<DiffFileStat>> {
    let range = format!("{}...HEAD", base);

    let name_status_output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "diff",
            "--name-status",
            "--diff-filter=ACDMR",
            "--find-renames",
            &range,
        ])
        .output()
        .context("Failed to run git diff --name-status")?;

    if !name_status_output.status.success() {
        anyhow::bail!(
            "git diff --name-status failed: {}",
            String::from_utf8_lossy(&name_status_output.stderr)
        );
    }

    let numstat_output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "diff",
            "--numstat",
            "--diff-filter=ACDMR",
            "--find-renames",
            &range,
        ])
        .output()
        .context("Failed to run git diff --numstat")?;

    if !numstat_output.status.success() {
        anyhow::bail!(
            "git diff --numstat failed: {}",
            String::from_utf8_lossy(&numstat_output.stderr)
        );
    }

    let name_status_str = String::from_utf8(name_status_output.stdout)?;
    let numstat_str = String::from_utf8(numstat_output.stdout)?;

    parse_diff_file_list(&name_status_str, &numstat_str)
}

fn parse_diff_file_list(name_status: &str, numstat: &str) -> Result<Vec<DiffFileStat>> {
    let status_entries = parse_name_status_lines(name_status);
    let numstat_entries = parse_numstat_lines(numstat);

    // Join by index (both commands output in same order with same filters)
    let results = status_entries
        .into_iter()
        .enumerate()
        .map(|(i, (status, path, old_path))| {
            let (insertions, deletions) = numstat_entries
                .get(i)
                .map(|(_, ins, del)| (*ins, *del))
                .unwrap_or((0, 0));
            DiffFileStat {
                path,
                status,
                insertions,
                deletions,
                old_path,
            }
        })
        .collect();

    Ok(results)
}

fn parse_name_status_lines(input: &str) -> Vec<(FileStatus, String, Option<String>)> {
    input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                return None;
            }
            let raw_status = parts[0];
            if raw_status.starts_with('R') {
                let old = parts.get(1).unwrap_or(&"").to_string();
                let new = parts.get(2).unwrap_or(&"").to_string();
                Some((FileStatus::Renamed, new, Some(old)))
            } else {
                let status = match raw_status {
                    "A" => FileStatus::Added,
                    "D" => FileStatus::Deleted,
                    _ => FileStatus::Modified,
                };
                Some((status, parts[1].to_string(), None))
            }
        })
        .collect()
}

fn parse_numstat_lines(input: &str) -> Vec<(String, u32, u32)> {
    input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 3 {
                return None;
            }
            let insertions = parts[0].parse::<u32>().unwrap_or(0);
            let deletions = parts[1].parse::<u32>().unwrap_or(0);
            let path = parts[2..].join("\t");
            Some((path, insertions, deletions))
        })
        .collect()
}

/// Get unified diff hunks for a single file between `base` and HEAD.
pub fn get_file_diff(repo_path: &Path, base: &str, file: &str) -> Result<Vec<DiffHunk>> {
    let range = format!("{}...HEAD", base);
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["diff", "-U3", &range, "--", file])
        .output()
        .context("Failed to run git diff")?;

    if !output.status.success() {
        anyhow::bail!(
            "git diff failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let stdout = String::from_utf8(output.stdout)?;
    parse_file_diff(&stdout)
}

fn parse_file_diff(diff_output: &str) -> Result<Vec<DiffHunk>> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    let mut old_line: u32 = 0;
    let mut new_line: u32 = 0;

    for line in diff_output.lines() {
        if line.starts_with("diff ")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("Binary files ")
        {
            continue;
        }

        if line.starts_with("@@ ") {
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            let (os, oc, ns, nc) = parse_hunk_header(line)?;
            current_hunk = Some(DiffHunk {
                old_start: os,
                old_count: oc,
                new_start: ns,
                new_count: nc,
                lines: Vec::new(),
            });
            old_line = os;
            new_line = ns;
            continue;
        }

        if let Some(ref mut hunk) = current_hunk {
            push_diff_line(hunk, line, &mut old_line, &mut new_line);
        }
    }

    if let Some(hunk) = current_hunk.take() {
        hunks.push(hunk);
    }

    Ok(hunks)
}

fn push_diff_line(hunk: &mut DiffHunk, line: &str, old_line: &mut u32, new_line: &mut u32) {
    if let Some(text) = line.strip_prefix('+') {
        hunk.lines.push(DiffLine {
            kind: DiffLineKind::Add,
            old_line: None,
            new_line: Some(*new_line),
            text: text.to_string(),
        });
        *new_line += 1;
    } else if let Some(text) = line.strip_prefix('-') {
        hunk.lines.push(DiffLine {
            kind: DiffLineKind::Delete,
            old_line: Some(*old_line),
            new_line: None,
            text: text.to_string(),
        });
        *old_line += 1;
    } else if let Some(text) = line.strip_prefix(' ') {
        hunk.lines.push(DiffLine {
            kind: DiffLineKind::Context,
            old_line: Some(*old_line),
            new_line: Some(*new_line),
            text: text.to_string(),
        });
        *old_line += 1;
        *new_line += 1;
    } else if line == "\\ No newline at end of file" {
        // Skip this marker
    } else {
        // Bare context line (no leading space — can happen for empty lines in diff)
        hunk.lines.push(DiffLine {
            kind: DiffLineKind::Context,
            old_line: Some(*old_line),
            new_line: Some(*new_line),
            text: line.to_string(),
        });
        *old_line += 1;
        *new_line += 1;
    }
}

fn parse_hunk_header(line: &str) -> Result<(u32, u32, u32, u32)> {
    // Format: @@ -old_start,old_count +new_start,new_count @@ optional header
    let line = line.trim_start_matches("@@ ");
    let end = line
        .find(" @@")
        .unwrap_or(line.len());
    let range_part = &line[..end];

    let parts: Vec<&str> = range_part.split_whitespace().collect();
    if parts.len() < 2 {
        anyhow::bail!("Invalid hunk header: {}", line);
    }

    let old_range = parts[0].trim_start_matches('-');
    let new_range = parts[1].trim_start_matches('+');

    let (old_start, old_count) = parse_range(old_range)?;
    let (new_start, new_count) = parse_range(new_range)?;

    Ok((old_start, old_count, new_start, new_count))
}

fn parse_range(range: &str) -> Result<(u32, u32)> {
    if let Some((start, count)) = range.split_once(',') {
        Ok((start.parse()?, count.parse()?))
    } else {
        // Single line: e.g., "5" means start=5, count=1
        Ok((range.parse()?, 1))
    }
}

/// Get the content of a file at a specific git ref.
pub fn get_file_at_ref(repo_path: &Path, git_ref: &str, file: &str) -> Result<String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["show", &format!("{}:{}", git_ref, file)])
        .output()
        .context("Failed to run git show")?;
    if !output.status.success() {
        anyhow::bail!(
            "git show failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
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

    // -- Diff file list tests --

    #[test]
    fn test_parse_diff_file_list() {
        let name_status = "A\tsrc/new.rs\nM\tsrc/lib.rs\nD\tsrc/old.rs\nR100\tsrc/before.rs\tsrc/after.rs\n";
        let numstat = "50\t0\tsrc/new.rs\n10\t3\tsrc/lib.rs\n0\t25\tsrc/old.rs\n2\t1\tsrc/after.rs\n";

        let files = parse_diff_file_list(name_status, numstat).unwrap();
        assert_eq!(files.len(), 4);

        // Added file
        assert_eq!(files[0].path, "src/new.rs");
        assert_eq!(files[0].status, FileStatus::Added);
        assert_eq!(files[0].insertions, 50);
        assert_eq!(files[0].deletions, 0);
        assert!(files[0].old_path.is_none());

        // Modified file
        assert_eq!(files[1].path, "src/lib.rs");
        assert_eq!(files[1].status, FileStatus::Modified);
        assert_eq!(files[1].insertions, 10);
        assert_eq!(files[1].deletions, 3);

        // Deleted file
        assert_eq!(files[2].path, "src/old.rs");
        assert_eq!(files[2].status, FileStatus::Deleted);
        assert_eq!(files[2].insertions, 0);
        assert_eq!(files[2].deletions, 25);

        // Renamed file
        assert_eq!(files[3].path, "src/after.rs");
        assert_eq!(files[3].status, FileStatus::Renamed);
        assert_eq!(files[3].old_path, Some("src/before.rs".to_string()));
        assert_eq!(files[3].insertions, 2);
        assert_eq!(files[3].deletions, 1);
    }

    #[test]
    fn test_parse_diff_file_list_empty() {
        let files = parse_diff_file_list("", "").unwrap();
        assert!(files.is_empty());
    }

    #[test]
    fn test_parse_diff_binary_file() {
        // Binary files show "-\t-\tpath" in numstat
        let name_status = "A\timage.png\nM\tsrc/lib.rs\n";
        let numstat = "-\t-\timage.png\n5\t2\tsrc/lib.rs\n";

        let files = parse_diff_file_list(name_status, numstat).unwrap();
        assert_eq!(files.len(), 2);

        // Binary: insertions/deletions should be 0 (parse of "-" fails gracefully)
        assert_eq!(files[0].path, "image.png");
        assert_eq!(files[0].status, FileStatus::Added);
        assert_eq!(files[0].insertions, 0);
        assert_eq!(files[0].deletions, 0);

        // Text file
        assert_eq!(files[1].path, "src/lib.rs");
        assert_eq!(files[1].insertions, 5);
        assert_eq!(files[1].deletions, 2);
    }

    // -- File diff parsing tests --

    #[test]
    fn test_parse_file_diff_single_hunk() {
        let diff = "\
diff --git a/src/lib.rs b/src/lib.rs
index abc123..def456 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -1,5 +1,6 @@
 use std::io;

-fn old_function() {
+fn new_function() {
+    println!(\"hello\");
     // body
 }
";
        let hunks = parse_file_diff(diff).unwrap();
        assert_eq!(hunks.len(), 1);

        let h = &hunks[0];
        assert_eq!(h.old_start, 1);
        assert_eq!(h.old_count, 5);
        assert_eq!(h.new_start, 1);
        assert_eq!(h.new_count, 6);

        // Lines: context, context, delete, add, add, context, context
        assert_eq!(h.lines.len(), 7);

        assert_eq!(h.lines[0].kind, DiffLineKind::Context);
        assert_eq!(h.lines[0].text, "use std::io;");
        assert_eq!(h.lines[0].old_line, Some(1));
        assert_eq!(h.lines[0].new_line, Some(1));

        assert_eq!(h.lines[2].kind, DiffLineKind::Delete);
        assert_eq!(h.lines[2].text, "fn old_function() {");
        assert_eq!(h.lines[2].old_line, Some(3));
        assert_eq!(h.lines[2].new_line, None);

        assert_eq!(h.lines[3].kind, DiffLineKind::Add);
        assert_eq!(h.lines[3].text, "fn new_function() {");
        assert_eq!(h.lines[3].old_line, None);
        assert_eq!(h.lines[3].new_line, Some(3));

        assert_eq!(h.lines[4].kind, DiffLineKind::Add);
        assert_eq!(h.lines[4].text, "    println!(\"hello\");");
        assert_eq!(h.lines[4].new_line, Some(4));
    }

    #[test]
    fn test_parse_file_diff_hunks() {
        let diff = "\
diff --git a/src/lib.rs b/src/lib.rs
index abc123..def456 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3
@@ -10,3 +11,3 @@
 line10
-old_line11
+new_line11
 line12
";
        let hunks = parse_file_diff(diff).unwrap();
        assert_eq!(hunks.len(), 2);

        // First hunk
        assert_eq!(hunks[0].old_start, 1);
        assert_eq!(hunks[0].old_count, 3);
        assert_eq!(hunks[0].new_start, 1);
        assert_eq!(hunks[0].new_count, 4);
        assert_eq!(hunks[0].lines.len(), 4);

        // Second hunk
        assert_eq!(hunks[1].old_start, 10);
        assert_eq!(hunks[1].old_count, 3);
        assert_eq!(hunks[1].new_start, 11);
        assert_eq!(hunks[1].new_count, 3);
        assert_eq!(hunks[1].lines.len(), 4); // context, delete, add, context
    }

    #[test]
    fn test_parse_file_diff_empty() {
        let hunks = parse_file_diff("").unwrap();
        assert!(hunks.is_empty());
    }
}
