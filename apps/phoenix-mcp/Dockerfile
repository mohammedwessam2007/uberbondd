FROM node:22-bookworm-slim
WORKDIR /app
COPY apps/phoenix-mcp/package*.json ./apps/phoenix-mcp/
RUN npm ci --prefix apps/phoenix-mcp --ignore-scripts --omit=dev --no-audit --no-fund
COPY apps/phoenix-mcp ./apps/phoenix-mcp
COPY scripts/phoenix-cos-operator.mjs ./scripts/phoenix-cos-operator.mjs
COPY src ./src
COPY artifacts ./artifacts
COPY docs ./docs
ENV NODE_ENV=production
ENV PHOENIX_MCP_HOST=0.0.0.0
CMD ["node", "apps/phoenix-mcp/server.mjs", "--http"]
