# Self-contained: built from this directory only. No UberBond source is copied into the image.
FROM apify/actor-node:22
COPY --chown=myuser package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund
COPY --chown=myuser main.mjs ./
COPY --chown=myuser src ./src
CMD ["node", "main.mjs"]
