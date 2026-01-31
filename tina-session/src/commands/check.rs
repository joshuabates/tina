use std::path::Path;

pub fn complexity(
    _cwd: &Path,
    _max_file_lines: u32,
    _max_total_lines: u32,
    _max_complexity: u32,
) -> anyhow::Result<u8> {
    todo!("check complexity command")
}

pub fn verify(_cwd: &Path) -> anyhow::Result<u8> {
    todo!("check verify command")
}

pub fn plan(_path: &Path) -> anyhow::Result<u8> {
    todo!("check plan command")
}
