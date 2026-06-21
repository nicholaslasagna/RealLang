mod bridge;

use bridge::{
    check_bridge_health, check_for_update, clear_saved_workspace, get_bridge_capabilities,
    get_runtime_info, get_saved_workspace, get_update_status, get_workspace_paths,
    get_workspace_resolution, init_app_config_dir, list_readonly_report_sources,
    load_readonly_report_source, save_workspace_selection, select_workspace_directory,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            get_bridge_capabilities,
            list_readonly_report_sources,
            get_workspace_paths,
            get_saved_workspace,
            save_workspace_selection,
            clear_saved_workspace,
            get_workspace_resolution,
            check_bridge_health,
            select_workspace_directory,
            get_update_status,
            check_for_update,
            load_readonly_report_source,
        ])
        .setup(|app| {
            init_app_config_dir(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RealForge Workbench");
}
