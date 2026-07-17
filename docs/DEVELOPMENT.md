# Developer Setup & Guide

Follow this step-by-step guide to run, debug, compile, and build Thalavedana from scratch.

## 0. Prerequisites
- Node.js 20+
- npm 10+
- Git CLI available in `PATH`
- Linux desktop keyring available (GNOME Keyring or KWallet) for `safeStorage` integration

## 1. Initial Project Scaffolding
To create this application from the ground up, we set up `electron-vite` as the build system:

```bash
# Initialize a TypeScript-based Electron-Vite app:
npx -y create-electron-vite@latest thalavedana --template react-ts
cd thalavedana
```

## 2. Installing Dependencies
Install the required application dependencies:

```bash
# Install all runtime and development dependencies from package-lock.json
npm install
```

## 3. Running Locally in Development Mode
Start the dual-process hot-reloading development environment:

```bash
# Runs the compiler and opens the Electron BrowserWindow
npm run dev
```

## 4. Running Verification Steps
Before packaging the app, run static code audits and compiler checks:

```bash
# Run TypeScript compilation check
npm run typecheck

# Validate build configuration
npm run build
```

## 5. Directory Structure
- `electron/main/`: Core application lifecycle, database migration, git service execution, and scheduler.
- `electron/preload/`: Sandbox API definition exposing secure IPC handlers.
- `src/renderer/`: React front-end application and minimalist light-themed styling.
- `src/shared/`: Shared interfaces, API structures, and shared types.

## 6. Packaging for Production
To bundle the app into a native installer:

```bash
# Build Electron main/preload and renderer bundles
npm run build

# Package using electron-builder (installer artifacts are generated in `dist/`)
npx electron-builder
```

## 7. Common Troubleshooting
- If Gmail OAuth callback fails, verify the redirect URI is exactly `http://localhost:5999/oauth2callback`.
- If repository scanning fails, verify each configured repository path is valid and accessible.
- If app secrets fail to decrypt on Linux, ensure your desktop keyring service is running before launching the app.
