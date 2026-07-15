# Backend API Reference

The backend server is implemented as an Express application exposing simple JSON REST routes.

## Endpoints

### 1. Tasks API
- **`GET /api/tasks`**
  - Returns: Array of all task items.
  - Response Schema:
    ```json
    [
      {
        "id": "k8szg3j",
        "title": "Onboard payments-service repo",
        "repoName": "payments-service",
        "repoUrl": "https://github.com/org/payments-service",
        "agent": "Claude",
        "agentCustom": "",
        "column": "backlog",
        "tags": ["docs-gen", "build"],
        "notes": "Instruction notes...",
        "createdAt": "2026-07-15T20:00:00.000Z",
        "updatedAt": "2026-07-15T20:05:00.000Z"
      }
    ]
    ```
- **`POST /api/tasks`**
  - Payload: Entire array of tasks to replace the current state.
  - Returns: Status `200 OK` on successful write.

### 2. Instruction Library API
- **`GET /api/library`**
  - Returns: Array of instruction/prompt items.
  - Response Schema:
    ```json
    [
      {
        "id": "l91jka8",
        "category": "Docs Generation",
        "title": "New Repo — Dev Docs Bootstrap",
        "body": "Instructions content...",
        "createdAt": "2026-07-15T20:00:00.000Z",
        "updatedAt": "2026-07-15T20:00:00.000Z"
      }
    ]
    ```
- **`POST /api/library`**
  - Payload: Entire array of instruction library entries to replace current state.
  - Returns: Status `200 OK` on successful write.

## Seeding
On startup, if `/app/data/library.json` is missing or empty, the backend automatically writes three default configuration prompt files (orientation, bootstrap documentation, and build sanity check prompts) to seed the workspace library.
