// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--claude-hook") {
        if let Err(error) = pimux_lib::run_claude_hook() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    pimux_lib::run();
}
