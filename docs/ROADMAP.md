# Future Product Roadmap

Here is the future timeline and milestones planned for Thalavedana.

## Phase 1: Native Windows Integration
- Adapt Electron `safeStorage` settings calls to transparently hook into DPAPI (Data Protection API) keychains on Windows platforms.
- Adjust `git` execFile file resolver calls to locate local `git.exe` in Windows environments.
- Verify path splitting separator compatibility across Linux/Windows.
- Add Windows-specific packaging and installer validation checklist.

## Phase 2: LLM Extensions & Local Processing
- Expand LLM provider configuration to support Ollama / Local Llama models via OpenAI-compatible API schemas.
- Build custom Prompt Templates inside settings so users can dictate formatting rules for their reports.
- Add per-provider fallback ordering and timeout controls in settings.

## Phase 3: Reporting & Visuals
- Support PDF exports of daily markdown logs.
- Add git author filter scopes so the scraper can filter commits by team members or custom author email filters.
- Add weekly and monthly summary report generation with export options.
