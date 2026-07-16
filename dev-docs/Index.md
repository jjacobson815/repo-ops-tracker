# Developer Documentation — repo-ops-tracker Obsidian Vault

Welcome to the internal developer documentation vault for the **repo-ops-tracker** application. This vault describes the modular, containerized architecture of the tool.

## Key Navigation Links
- [[Architecture & Stack]]: Learn about the zero-build Native ES Modules frontend and Express backend.
- [[Docker & Persistence]]: Understand how Docker is set up and how data is persisted to host filesystems.
- [[Frontend Components]]: High-level layout of the divided frontend stylesheets and Javascript modules.
- [[Backend API Reference]]: Full details of the API endpoints, payload formats, and persistence schemas.

## Developer Quick Start

**Option A — Node (local)**
1. Install dependencies and start the server:
   ```bash
   npm install
   node server.js
   ```
2. Open your browser and navigate to `http://localhost:8787`.

**Option B — Docker**
1. Build and run the container:
   ```bash
   docker compose up --build
   ```
2. Open your browser and navigate to `http://localhost:8787`.

> Note: In Docker the image copies source at build time and only mounts `./data`,
> so code changes require a rebuild (`docker compose up --build`). The server does
> not auto-restart on code changes.

Data is persisted in a SQLite database (`data/dev.db`) via Prisma, with the
legacy JSON files kept only as mirrors. See [[Docker & Persistence]] for details.
