# Thalavedana 🧠

A privacy-first, local-only Electron desktop application that completely automates your daily internship work reporting. It scrapes commits from your local Git repositories, synthesizes professional daily work summaries using Google Gemini, appends rows to a Google Sheets document, and dispatches the summary via secure Gmail OAuth2.

---

## 🔒 Security-First & Local-Only Design

- **OS Keyring Cryptography**: Sensitive credentials (Gemini API keys, Gmail OAuth2 client secrets, and refresh tokens) are encrypted at rest using Electron's native `safeStorage` API. On Linux, this automatically integrates with the system login keyring (GNOME Keyring / KWallet). No keys are ever stored in plain text.
- **Zero-Shell Execution**: Uses `execFile` with structured string arguments for Git scraping, ensuring protection against command-injection vulnerabilities.
- **CSRF Protection**: The local Gmail authentication callback server uses secure cryptographically generated state token validations.
- **Zero Cloud Footprint**: All scanned commits, draft reports, application settings, and logs are persisted locally inside an SQLite database (`thalavedana.db`). No telemetry or code leaks.

---

## ⚡ Key Highlights

- **Live Stage Orchestration Panel**: A step-by-step progress visualizer (**Git Scrape** → **AI Summary** → **Google Sheets** → **Gmail Sent**) on the dashboard shows real-time subtask status, commit volumes, and logs during automated or manual runs.
- **Startup Recovery**: Computes lookback ranges on app boot to backfill and send reports for dates where the computer was turned off during scheduled run times.
- **Auto Log Pruning**: Automatically cleans and prunes historical debug and system logs older than 30 days.

---

## 📂 Technical Documentation

Deep dive into the architectural blueprints in the `docs/` folder:

* 🏗️ **[docs/ARCHITECTURE.md](file:///home/abhijithb/Projects/Thalavedana/docs/ARCHITECTURE.md)**: Main, Preload, and Renderer multi-process boundaries.
* 🔄 **[docs/WORKFLOW.md](file:///home/abhijithb/Projects/Thalavedana/docs/WORKFLOW.md)**: Sequential diagrams of the orchestration engine.
* 🗄️ **[docs/DATABASE.md](file:///home/abhijithb/Projects/Thalavedana/docs/DATABASE.md)**: SQLite tables and keyring storage schema.
* 🔌 **[docs/API.md](file:///home/abhijithb/Projects/Thalavedana/docs/API.md)**: Secure context bridge IPC channel documentation.
* 🛠️ **[docs/DEVELOPMENT.md](file:///home/abhijithb/Projects/Thalavedana/docs/DEVELOPMENT.md)**: Step-by-step installation and manual execution guide.
* 🔮 **[docs/ROADMAP.md](file:///home/abhijithb/Projects/Thalavedana/docs/ROADMAP.md)**: Windows compatibility and Ollama local model expansions.
* 📜 **[docs/CHANGELOG.md](file:///home/abhijithb/Projects/Thalavedana/docs/CHANGELOG.md)**: Hardening features and release updates.

---

## 🚀 Quick Start Guide

### 1. Install Project Dependencies
```bash
npm install
```

### 2. Launch the Development Client
```bash
npm run dev
```

### 3. Verify Types & Compilation
```bash
npm run typecheck
npm run build
```

---

## ⚙️ Initial Configuration Steps

When starting the application for the first time, you will be guided through a Setup Wizard:
1. **Git Repositories**: Specify the local folder paths of repositories you work on.
2. **LLM Provider**: Enter your Gemini API key (native support for fast and free summaries).
3. **Gmail Credentials**: Enable Gmail API on the Google Developer Console, create an OAuth Web Client ID with redirect URI `http://localhost:5999/oauth2callback`, and authorize your account.
4. **Google Sheets Mapping**: Paste your Google Spreadsheet URL and map columns (e.g. Column A -> Date, Column B -> Report Summary, etc.) preserving row formats.
5. **Scheduler**: Set the daily execution time.