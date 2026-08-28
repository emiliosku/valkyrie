# Install JavaScript dependencies on the native CI architecture. The
# arm64 runtime stage runs natively on the OCI host.
FROM --platform=$BUILDPLATFORM node:20-alpine AS dependencies

WORKDIR /app
COPY mom-ai-author/package.json mom-ai-author/package-lock.json ./
RUN npm ci --no-audit --no-fund && mkdir -p node_modules /var/lib/mom-ai-author

FROM node:20-alpine

WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules/ ./node_modules/
COPY --from=dependencies --chown=node:node /var/lib/mom-ai-author/ /var/lib/mom-ai-author/
COPY --chown=node:node mom-ai-author/src/ ./src/
COPY --chown=node:node mom-ai-author/public/ ./public/

# Bake the MoM catalog manifests into the image. Imported tile artwork
# is deliberately excluded and mounted read-only through MOM_AI_IMPORT_ROOT.
COPY --chown=node:node unity/Assets/StreamingAssets/content/MoM/ /app/content/MoM/

ENV HOST=0.0.0.0 \
    PORT=3000 \
    MOM_CONTENT_ROOT=/app/content/MoM \
    MOM_AI_DATA_DIR=/var/lib/mom-ai-author \
    NODE_ENV=production

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
