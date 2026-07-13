# Changelog

All notable changes to the Thalavedana internship reporting application are logged here.

## [1.1.0] - Hardening & Security Refactor

### Added
- **Local Keyring Encryption**: Leveraged Electron's `safeStorage` to encrypt API keys, credentials, and access tokens using GNOME Keyring/KWallet on Linux.
- **Log Table Auto-Pruning**: Integrated a startup database task to prune debug log entries older than 30 days.
- **CSRF State Verification**: Added secure state token checks during local loopback port callback operations for OAuth authentication.
- **Orchestrator Stage Dispatcher**: Implemented the unified `DailyReportOrchestrator` providing step-by-step progress events (`Git Scrape` -> `AI Summary` -> `Excel Log` -> `Gmail Sent`) to the front-end dashboard in real-time.

### Fixed
- **Shell Injection vulnerability**: Swapped `exec` shell execution in `gitService.ts` with direct, sandboxed binary execution using `execFile` with argument list arrays.
- **Dynamic Scheduler recovery range**: Replaced the hardcoded 7-day startup lookup window with a computed, dynamic days range calculated relative to the last processed report run.
