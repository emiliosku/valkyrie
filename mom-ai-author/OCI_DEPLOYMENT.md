# OCI Deployment

This service is deployed as an ARM64 container behind the existing OCI Caddy
proxy. It is reachable at:

```text
https://143.47.38.215/valkyrie/
```

The public route is protected by Caddy Basic Auth. Do not publish container
port 3000 to the host.

## Prerequisites

- The image is built by `.github/workflows/build.yml` after a push to `master`.
- The Valkyrie repository has GitHub secrets `SSH_HOST`, `SSH_USER`, and
  `SSH_KEY`, using the same OCI deployment identity as the other applications.
- The server can pull the private GHCR image.
- Complete the OCI infrastructure changes below before the first CI deploy.

## OCI Infrastructure Changes

All commands in this section run on the OCI server as `ubuntu` from
`/home/ubuntu/oci-infra`.

### 1. Create persistent directories

```bash
cd /home/ubuntu/oci-infra
mkdir -p data/valkyrie-import data/mom-ai-author
sudo chown -R 1000:1000 data/mom-ai-author
sudo chmod 700 data/mom-ai-author
```

`data/valkyrie-import` holds an authorized Valkyrie MoM import and is mounted
read-only. `data/mom-ai-author` holds `tile-ports.json`,
`tile-connections.json`, and short-lived generated packages.

### 2. Configure Caddy credentials

Create `secrets/caddy.env`; this file is gitignored and must not be committed.

```bash
cd /home/ubuntu/oci-infra
read -rsp 'Valkyrie web password: ' password
printf '\n'
hash=$(docker run --rm caddy:2 caddy hash-password --plaintext "$password")
unset password
printf "VALKYRIE_BASIC_AUTH_HASH='%s'\n" "$hash" > secrets/caddy.env
chmod 600 secrets/caddy.env
```

Add the environment file to the existing `caddy` service in
`docker-compose.yml`:

```yaml
  caddy:
    env_file:
      - secrets/caddy.env
```

The single quotes around the bcrypt hash preserve its `$` characters when
Docker Compose parses the environment file.

### 3. Add the service

Add this service to `docker-compose.yml` under `services`:

```yaml
  valkyrie-mom-ai-author:
    image: ghcr.io/emiliosku/valkyrie-mom-ai-author:latest
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: "3000"
      MOM_CONTENT_ROOT: /app/content/MoM
      MOM_AI_IMPORT_ROOT: /opt/valkyrie-import
      MOM_AI_DATA_DIR: /var/lib/mom-ai-author
    volumes:
      - ./data/valkyrie-import:/opt/valkyrie-import:ro
      - ./data/mom-ai-author:/var/lib/mom-ai-author
    networks:
      - proxy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Add `valkyrie-mom-ai-author` to Caddy's `depends_on` list. It only needs the
`proxy` network: the service has no database.

### 4. Add the Caddy routes

Add these handlers to `caddy/Caddyfile` before the default `handle /*` block:

```caddy
	# Valkyrie tile annotation and connection review.
	handle /valkyrie {
		redir * /valkyrie/ 308
	}

	handle /valkyrie/* {
		basic_auth {
			valkyrie {$VALKYRIE_BASIC_AUTH_HASH}
		}
		uri strip_prefix /valkyrie
		reverse_proxy valkyrie-mom-ai-author:3000
	}
```

Caddy removes `/valkyrie` before proxying. The app's browser code resolves
paths relative to its base URL so requests such as `v1/tile-ports` remain
under `/valkyrie/` in the browser and reach `/v1/tile-ports` in the container.

### 5. Persist the infrastructure change

Commit the edited `docker-compose.yml` and `caddy/Caddyfile` in the
`oci-infra` repository. Add `data/` to that repository's `.gitignore`. Do not
add `secrets/caddy.env` or imported media to Git.

Validate and start the service after the first image has been pushed:

```bash
cd /home/ubuntu/oci-infra
docker compose config -q
docker compose pull valkyrie-mom-ai-author
docker compose up -d valkyrie-mom-ai-author
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose ps valkyrie-mom-ai-author
```

## Import MoM Media Over SSH

The tile reviewer needs only the media in the Valkyrie MoM import directory.
It does not upload, expose as static files, or package that media; images are
read by the service and streamed only to authenticated review pages.

Run these commands on the machine with the local Valkyrie import:

```bash
KEY="$HOME/src/tests/ssh-key-2026-04-17.key"
SOURCE="$HOME/.config/Valkyrie/MoM/import/"
TARGET="ubuntu@143.47.38.215:/home/ubuntu/oci-infra/data/valkyrie-import/"

test -f "$KEY"
test -d "$SOURCE"
du -sh "$SOURCE"

ssh -i "$KEY" ubuntu@143.47.38.215 \
  "mkdir -p /home/ubuntu/oci-infra/data/valkyrie-import && du -sh /home/ubuntu/oci-infra/data"

rsync -a --info=progress2 -e "ssh -i $KEY" "$SOURCE" "$TARGET"

# Confirm the server has every transferred file without changing anything.
rsync -a --checksum --dry-run -e "ssh -i $KEY" "$SOURCE" "$TARGET"

ssh -i "$KEY" ubuntu@143.47.38.215 \
  "find /home/ubuntu/oci-infra/data/valkyrie-import -type d -exec chmod 755 {} + && find /home/ubuntu/oci-infra/data/valkyrie-import -type f -exec chmod 644 {} +"
```

Use the same `rsync` command to update the server after importing additional
owned MoM content locally. Do not use `--delete`: it could remove server media
that is not present in the local import at the time of synchronization.

## Back Up Annotation Data

The existing `scripts/backup.sh` backs up PostgreSQL only. Add this after its
database backup loop so the shared tile decisions are protected:

```bash
tar -C "${COMPOSE_DIR}/data" -czf \
  "${BACKUP_DIR}/${TIMESTAMP}/mom-ai-author-data.tar.gz" \
  mom-ai-author
```

Do not back up `data/valkyrie-import` through the routine backup job. It can be
re-synchronized from the authorized local import and may be large.

## Verify

The authenticated external checks are:

```bash
curl -sk -u valkyrie:'<password>' \
  https://143.47.38.215/valkyrie/v1/health

curl -sk -u valkyrie:'<password>' \
  https://143.47.38.215/valkyrie/ >/dev/null
```

Expected health response:

```json
{"protocol":1,"service":"mom-ai-author"}
```

Open the protected review tools:

```text
https://143.47.38.215/valkyrie/annotator
https://143.47.38.215/valkyrie/connector
```

If tile images do not appear, confirm the imported media mount and inspect the
service logs:

```bash
cd /home/ubuntu/oci-infra
docker compose logs --tail=100 valkyrie-mom-ai-author
docker compose exec -T valkyrie-mom-ai-author \
  node -e "fetch('http://localhost:3000/v1/tiles?packs=MoMBase').then(r => r.json()).then(x => console.log(x.tiles.length))"
```

## Manual Redeploy

Normally, a successful push to `master` runs the workflow and deploys the image
by immutable digest. To restart the current tag manually:

```bash
cd /home/ubuntu/oci-infra
docker compose pull valkyrie-mom-ai-author
docker compose up -d --force-recreate --no-deps valkyrie-mom-ai-author
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The CI deployment is preferred because it pulls the image by digest and avoids
a transient stale `latest` response from GHCR.
