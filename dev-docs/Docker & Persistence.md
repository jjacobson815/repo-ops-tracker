# Docker & Persistence

To prevent polluting the host operating system with Node.js modules or packages, the entire service runs in a lightweight Alpine Linux Docker container.

## Configuration Files

### Dockerfile
The container build is defined in `Dockerfile`:
- Uses the official `node:20-alpine` image to minimize size.
- Copies package manifests first to optimize layer caching.
- Installs production-only dependencies using `npm ci`.
- Exposes port `8787` for client access.

### Compose File
`docker-compose.yml` automates the run cycle:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8787:8787"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=8787
      - DATA_DIR=/app/data
```

## Volume Mount Persistence

> [!NOTE]
> Container filesystems are ephemeral by default. If a container is rebuilt or destroyed, all local modifications inside the container are lost.

To prevent data loss, the host directory `./data` is mapped to `/app/data` inside the container:
- The backend writes the SQLite database to `/app/data/dev.db`.
- The existing JSON files remain available as legacy import sources under `./data/`.
- You can backup, copy, or inspect the database file directly in `./data/`.

The container runs `npx prisma generate` at build time (see `Dockerfile`), and the
server runs `prisma migrate deploy` automatically on boot, so the SQLite schema
is applied without manual steps. To import pre-existing legacy JSON data into the
database, run `npm run migrate:json` locally (or exec it inside the container).

> [!TIP]
> The Docker image copies source files during build, and the compose service only
> mounts `./data`. Code changes in the repo therefore require rebuilding the
> image via `docker compose up --build` before the updated app will run.

See [[Backend API Reference]] for more details on the serialization schemas.
