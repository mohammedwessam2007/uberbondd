# Context: repository root. Dockerfile.dockerignore admits only the transitive
# Actor import graph plus the Actor's private, pinned lockfile.
FROM apify/actor-node-playwright-chrome:22
COPY --chown=myuser actors/verified-inquiry-defects/package.json actors/verified-inquiry-defects/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=myuser src/ ./src/
COPY --chown=myuser actors/verified-inquiry-defects/main.mjs ./main.mjs
CMD ["node", "main.mjs"]
