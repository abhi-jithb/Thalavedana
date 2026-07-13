# Developer Setup & Guide

Follow this step-by-step guide to run, debug, compile, and build Thalavedana from scratch.

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
# Install Google APIs and developer tools
npm install googleapis @google/genai

# Install developer tools and type packages
npm install -D typescript @types/node @types/react @types/react-dom
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
# Build app bundle
npm run build

# Package using electron-builder (Fedoras/Linux target output in dist/)
npx electron-builder
```
