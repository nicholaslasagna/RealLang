//! Cross-platform virtualenv Python resolution for the read-only CLI bridge.

use std::path::{Path, PathBuf};

pub const VENV_PYTHON_CANDIDATES: &[&[&str]] = &[
    &[".venv", "bin", "python"],
    &[".venv", "bin", "python3"],
    &[".venv", "Scripts", "python.exe"],
    &[".venv", "Scripts", "python"],
];

pub fn join_candidate(repo_root: &Path, parts: &[&str]) -> PathBuf {
    parts.iter().fold(repo_root.to_path_buf(), |acc, segment| acc.join(segment))
}

pub fn resolve_python(repo_root: &Path) -> Result<PathBuf, String> {
    resolve_python_with(repo_root, |path| path.exists())
}

pub fn resolve_python_with<F>(repo_root: &Path, exists: F) -> Result<PathBuf, String>
where
    F: Fn(&Path) -> bool,
{
    for parts in VENV_PYTHON_CANDIDATES {
        let candidate = join_candidate(repo_root, parts);
        if exists(&candidate) {
            return Ok(candidate);
        }
    }

    let fallback = if cfg!(windows) { "python" } else { "python3" };
    Ok(PathBuf::from(fallback))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-bridge-test-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_unix_venv_python() {
        let repo = temp_repo();
        let python = repo.join(".venv").join("bin").join("python");
        fs::create_dir_all(python.parent().unwrap()).unwrap();
        fs::write(&python, b"").unwrap();

        let resolved = resolve_python(&repo).unwrap();
        assert_eq!(resolved, python);

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn resolves_windows_venv_python_exe() {
        let repo = temp_repo();
        let python = repo.join(".venv").join("Scripts").join("python.exe");
        fs::create_dir_all(python.parent().unwrap()).unwrap();
        fs::write(&python, b"").unwrap();

        let resolved = resolve_python(&repo).unwrap();
        assert_eq!(resolved, python);

        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn falls_back_to_platform_python_name() {
        let repo = temp_repo();
        let resolved = resolve_python(&repo).unwrap();
        let expected = if cfg!(windows) { "python" } else { "python3" };
        assert_eq!(resolved, PathBuf::from(expected));
        let _ = fs::remove_dir_all(&repo);
    }
}
