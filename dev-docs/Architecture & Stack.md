# Architecture & Stack Overview

The **repo-ops-tracker** uses a lightweight, low-overhead stack designed for local personal use. It eliminates runtime compilation dependencies and build pipelines, maintaining high execution speed and simplicity.

## Architecture Diagram

```mermaid
graph TD
    subgraph Browser (Client)
        HTML[index.html] -->|Loads| AppJS[js/app.js]
        AppJS -->|Imports| ESM[ES Modules: dashboard, board, library, modal]
        AppJS -->|Queries| API[js/api.js]
    end
    
    subgraph Docker Container
        Express[Express Server] -->|Serves| Static[Static Files in public/]
        API -->|REST Calls| Express
        Express -->|Read/Write| JSON[data/tasks.json & data/library.json]
    end

    subgraph Host Filesystem
        JSON -.->|Mounted Volume| Host[data/ directory on host]
    end
```

## Stack Components

### 1. Frontend (Zero-Build ESM)
Instead of bundling packages using tools like Webpack, Vite, or Rollup, the browser serves native **ES Modules (ESM)**. 
- In [[Index]], `<script type="module" src="js/app.js">` bootstraps the system.
- Modules are loaded asynchronously, making code organization modular without compile overhead.

### 2. Backend (Node.js & Express)
- Exposes a REST API to manipulate JSON stores.
- Serves the `public/` folder statically.
- Keeps dependencies minimal (only `express`).

### 3. State & Persistence
- Eliminates browser-only `localStorage` for system resilience.
- Auto-saves updates as flat JSON arrays in files.
- Mounted volume in [[Docker & Persistence]] links database files to host disk.
