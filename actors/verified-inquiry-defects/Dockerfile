# Built by Apify from the repository root (dockerContextDir ../..) so the Actor
# runs the same tested modules as UberBond itself.
FROM apify/actor-node-playwright-chrome:22
COPY --chown=myuser package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm install --no-save --ignore-scripts apify@3.7.2
COPY --chown=myuser src ./src
COPY --chown=myuser actors/verified-inquiry-defects/main.mjs ./main.mjs
CMD ["node", "main.mjs"]
