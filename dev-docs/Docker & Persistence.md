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
- The backend writes files directly to `/app/data/tasks.json` and `/app/data/library.json`.
- These are reflected in real-time in the host system's `./data/` folder.
- You can backup, copy, or version control your databases by working directly with the files in `./data/`.

See [[Backend API Reference]] for more details on the serialization schemas.
