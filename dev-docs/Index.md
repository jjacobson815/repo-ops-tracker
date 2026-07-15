# Developer Documentation — repo-ops-tracker Obsidian Vault

Welcome to the internal developer documentation vault for the **repo-ops-tracker** application. This vault describes the modular, containerized architecture of the tool.

## Key Navigation Links
- [[Architecture & Stack]]: Learn about the zero-build Native ES Modules frontend and Express backend.
- [[Docker & Persistence]]: Understand how Docker is set up and how data is persisted to host filesystems.
- [[Frontend Components]]: High-level layout of the divided frontend stylesheets and Javascript modules.
- [[Backend API Reference]]: Full details of the API endpoints, payload formats, and persistence schemas.

## Developer Quick Start
1. To start the app locally in development:
   ```bash
   docker compose up --build
   ```
2. Open your browser and navigate to `http://localhost:8787`.
3. Changes to static assets in `public/` will reflect immediately upon page refresh. Changes to `server.js` or backend configurations will auto-restart when building/running.
