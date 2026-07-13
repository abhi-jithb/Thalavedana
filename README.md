# Thalavedana 🧠

A privacy-first, local-only Electron desktop application that automates the generation and submission of internship work reports. It automatically scrapes daily Git history, drafts professional summaries via Google Gemini/LLM, appends entries to a local Excel log sheet (preserving layout styles), and sends email updates via secure Gmail OAuth2.

---

## Key Features

- **Daily Git Scraping**: Connect multiple local Git repositories. The app parses today's commits, changed files, and code diffs (safely truncated to preserve LLM context limits).
- **AI-Generated Summaries**: Formulates professional report bullet points and email bodies using Google Gemini (or custom OpenAI-compatible endpoints) strictly on request or scheduler ticks.
- **Excel Appender**: Dynamically writes report date, text summaries, and repository metadata into your custom internship log sheet using `exceljs`, while maintaining row styling.
- **Secure Gmail Delivery**: Integrates OAuth2 through a local loopback server (`http://localhost:5999/oauth2callback`) to send email reports directly from your address.
- **Startup Recovery Scheduler**: If your computer is shut down during the daily schedule time, the background manager scans the past 7 days of history on boot, runs any missing days, and retries pending deliveries.

---

## Tech Stack & Architecture

- **Core**: Electron (Main, Preload IPC Bridge), React, TypeScript.
- **Database**: Native `node:sqlite` (SQLite) for storing settings, repositories, historical reports, and logs.
- **Libraries**:
  - `exceljs` for safe spreadsheet manipulation.
  - `googleapis` for Google Gmail OAuth2.
- **Design**: Modern dark glassmorphic styling utilizing vanilla CSS, responsive grids, active indicators, and custom consoles.

---

## Installation & Launch

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
Starts the Electron application window with hot module reloading (HMR) for the React renderer:
```bash
npm run dev
```

### 3. Build Production Bundle
Bundles the code for distribution:
```bash
npm run build
```

---

## Configuration & Setup Wizard

When starting the application for the first time, you will be guided through a Setup Wizard:

1. **Git Repositories**: Input paths of folders containing active Git work. The wizard checks paths and verifies they are valid repository directories.
2. **LLM Provider**:
   - **Gemini (Native)**: Input your Google Gemini API key. Uses `gemini-1.5-flash` by default.
   - **OpenAI-Compatible**: Enter a custom model name and endpoint (e.g. Groq, local LLMs like Ollama).
3. **Gmail Connection**:
   - Open your Google Cloud Console.
   - Enable the **Gmail API** for your project.
   - Create an **OAuth 2.0 Client ID** (Application type: *Web application*).
   - Add Authorized redirect URIs: `http://localhost:5999/oauth2callback`.
   - Paste the Client ID and Secret in the Wizard, click **Authorize Gmail Account**, and complete the sign-in flow.
4. **Email Targets**: Set recipient emails (`To`), copy addresses (`Cc`), and backup folders (`Bcc`).
5. **Excel Mapping**:
   - Point to your internship spreadsheet file on disk and click **Inspect Excel**.
   - Select your target worksheet.
   - Map your layout columns (e.g. `Column A` -> Report Date, `Column B` -> LLM Work Report Summary, `Column C` -> Repository names, or Fixed strings/Blank cells).
6. **Scheduler Time**: Choose the daily execution time (e.g. `17:30`).

---

## Verification & Type Safety

Verification checks are in place:
- **Typecheck**: `npm run typecheck` passes with zero compiler issues.
- **Zero background CPU idle overhead**: Operation checks are performed once a minute to see if a scheduler event is ready, maintaining low memory footprints.
- **Local-first Security**: All API keys, secrets, repositories, and historical logs are persisted only to the local SQLite database.