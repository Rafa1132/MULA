# Running Mula in Docker

Three containers, one compose file (`docker-compose.yml` at the repository root):

| Service    | What it runs                                   | Reachable at |
|------------|------------------------------------------------|--------------|
| `web`      | Next.js frontend (`Dockerfile.web`)            | http://127.0.0.1:3000 |
| `api`      | FastAPI backend + Hermes (`Dockerfile.api`)    | internal only (`api:8000`) |
| `postgres` | PostgreSQL 17, the same one `./run.sh` uses    | 127.0.0.1:5432 |

## Before the first run

- Docker Desktop is running.
- `server/.env.hermes` and `.env.postgres` exist (from `setup_hermes.py` or the README's database steps).
- Ollama is running on the Mac. The api container reaches it at `host.docker.internal:11434`.

## Commands

```sh
docker compose --profile app up --build      # build and start everything (first build downloads Hermes)
docker compose --profile app down            # stop the app; data stays in the volumes
docker compose --profile app logs -f api     # backend + Hermes logs
```

`docker compose up -d postgres` (what `./run.sh` does) still starts only the database.
Don't run `./run.sh` and the Docker app at the same time: both use port 3000.

## Data

- `mula-postgres`: the database, shared with `./run.sh`.
- `mula-hermes`: the container's Hermes home (profiles, sessions, runtime tools). Seeded from the image on
  first start. After changing `server/hermes/revision.txt`, remove it so the new Hermes is used:
  `docker compose --profile app down && docker volume rm mula_mula-hermes`.
- `mula-workspaces`: each project's memory store and notes vault.

Secrets are read at run time from `server/.env.hermes`; no image contains them.

The volume's `config.yaml` is copied from the template only when it is missing, so a volume made before
the Board needs its kanban settings and tool list updated once, then an `api` rebuild:

```sh
docker compose --profile app run --rm --no-deps -T --entrypoint python3 api /app/server/scripts/enable_kanban.py --apply </dev/null
docker compose --profile app run --rm --no-deps -T --entrypoint python3 api /app/server/scripts/connect_agents.py </dev/null
```

(On the VPS, add `-f docker-compose.yml -f docker-compose.vps.yml` as usual.) Without `--apply`,
`enable_kanban.py` only prints what it would change.

## Settings compose overrides for the api container

- `MULA_DATABASE_HOST=postgres`: the start script swaps `127.0.0.1` in `MULA_DATABASE_URL` for it.
- `MULA_MODEL_BASE_URL=http://host.docker.internal:11434/v1`: change this to switch models (e.g. OpenRouter).
