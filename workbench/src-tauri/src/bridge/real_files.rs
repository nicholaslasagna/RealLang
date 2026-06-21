//! Read-only workspace `.real` file discovery for the approved check (0.18).
//!
//! Walks ONLY inside the resolved workspace, returns workspace-relative `.real`
//! paths, excludes hidden/build/vendor directories, never follows symlinks, and
//! caps both file count and traversal depth. No writes, no shell, no network.

use super::types::RealFileListResult;
use super::workspace::{get_workspace_resolution, WorkspaceResolutionStatus};
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_REAL_FILES: usize = 500;
pub const MAX_DEPTH: usize = 12;

/// Directories never descended into (build/cache/vendor/VCS). Any hidden
/// directory (name starting with `.`) is also skipped.
pub const EXCLUDED_DIRS: &[&str] = &[
    ".git",
    ".venv",
    "node_modules",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".realforge",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".cargo",
    ".tox",
    ".idea",
    ".vscode",
];

pub fn list_real_files() -> RealFileListResult {
    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        return RealFileListResult::failure(
            "workspace_not_ready",
            "select a RealForge workspace before listing .real files",
        );
    }
    let Some(root_text) = resolution.repo_root else {
        return RealFileListResult::failure("workspace_not_ready", "workspace root is unavailable");
    };
    let canonical_root = match PathBuf::from(&root_text).canonicalize() {
        Ok(path) => path,
        Err(err) => {
            return RealFileListResult::failure(
                "workspace_not_ready",
                format!("failed to canonicalize workspace root: {err}"),
            )
        }
    };

    let mut files = Vec::new();
    let mut truncated = false;
    collect_real_files(&canonical_root, &canonical_root, 0, &mut files, &mut truncated);
    files.sort();
    files.dedup();
    RealFileListResult::success(files, truncated, canonical_root.to_string_lossy().into_owned())
}

fn collect_real_files(
    root: &Path,
    dir: &Path,
    depth: usize,
    files: &mut Vec<String>,
    truncated: &mut bool,
) {
    if depth > MAX_DEPTH {
        return;
    }
    if files.len() >= MAX_REAL_FILES {
        *truncated = true;
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if files.len() >= MAX_REAL_FILES {
            *truncated = true;
            return;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        // Never follow symlinks — they can escape the workspace or loop.
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if file_type.is_dir() {
            if name_str.starts_with('.') || EXCLUDED_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            collect_real_files(root, &entry.path(), depth + 1, files, truncated);
        } else if file_type.is_file() {
            if name_str.starts_with('.') {
                continue;
            }
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("real") {
                if let Ok(relative) = path.strip_prefix(root) {
                    files.push(relative.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace(name: &str) -> PathBuf {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("rf-realfiles-{name}-{stamp}"));
        fs::create_dir_all(root.join("examples")).unwrap();
        fs::create_dir_all(root.join("src/nested")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join("examples/hello.real"), "module main;").unwrap();
        fs::write(root.join("src/nested/loop.real"), "module loop;").unwrap();
        fs::write(root.join("src/notes.txt"), "ignore me").unwrap();
        fs::write(root.join("node_modules/pkg/vendor.real"), "module vendor;").unwrap();
        fs::write(root.join("target/built.real"), "module built;").unwrap();
        fs::write(root.join(".git/hidden.real"), "module hidden;").unwrap();
        root
    }

    fn collect(root: &Path) -> (Vec<String>, bool) {
        let canonical = root.canonicalize().unwrap();
        let mut files = Vec::new();
        let mut truncated = false;
        collect_real_files(&canonical, &canonical, 0, &mut files, &mut truncated);
        files.sort();
        (files, truncated)
    }

    #[test]
    fn returns_only_real_files_and_excludes_vendor_build_hidden() {
        let root = temp_workspace("scan");
        let (files, _) = collect(&root);
        assert!(files.contains(&"examples/hello.real".to_string()));
        assert!(files.contains(&"src/nested/loop.real".to_string()));
        assert!(!files.iter().any(|f| f.ends_with("notes.txt")));
        assert!(!files.iter().any(|f| f.contains("node_modules")));
        assert!(!files.iter().any(|f| f.contains("target/")));
        assert!(!files.iter().any(|f| f.contains(".git")));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn enforces_file_count_cap() {
        let root = temp_workspace("cap");
        let canonical = root.canonicalize().unwrap();
        let mut files = Vec::new();
        let mut truncated = false;
        // Cap is enforced by the running counter; simulate by pre-filling.
        for index in 0..MAX_REAL_FILES {
            files.push(format!("pre/{index}.real"));
        }
        collect_real_files(&canonical, &canonical, 0, &mut files, &mut truncated);
        assert!(truncated);
        assert_eq!(files.len(), MAX_REAL_FILES);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn depth_limit_stops_recursion() {
        let root = temp_workspace("depth");
        let canonical = root.canonicalize().unwrap();
        let mut files = Vec::new();
        let mut truncated = false;
        // Starting beyond the depth limit must collect nothing.
        collect_real_files(&canonical, &canonical, MAX_DEPTH + 1, &mut files, &mut truncated);
        assert!(files.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_files_and_dirs_are_skipped() {
        use std::os::unix::fs::symlink;
        let root = temp_workspace("symlink");
        let outside = root.parent().unwrap().join(format!(
            "rf-realfiles-outside-{}.real",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::write(&outside, "module outside;").unwrap();
        symlink(&outside, root.join("examples/escape.real")).unwrap();
        symlink(root.parent().unwrap(), root.join("examples/escape_dir")).unwrap();
        let (files, _) = collect(&root);
        assert!(!files.iter().any(|f| f.contains("escape")));
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&root);
    }
}
