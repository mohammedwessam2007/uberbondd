# PHOENIX N26: isolated OCI application runner, never a database backup helper.
# Build pulls the EXACT independently admitted app source. No source branch is altered.
FROM node:22.16.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git iptables iproute2 util-linux coreutils libc-bin \
    && rm -rf /var/lib/apt/lists/*
ARG APP_SHA=c1f9b4aac2278617cb0c9e04d14e29f0544dd701
RUN test "$APP_SHA" = "c1f9b4aac2278617cb0c9e04d14e29f0544dd701"
WORKDIR /srv/uberbond
RUN git init && git remote add origin https://github.com/mohammedwessam2007/uberbondd.git \
    && git fetch --no-tags --depth=1 origin "$APP_SHA" \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "$APP_SHA"
RUN npm ci --omit=dev --ignore-scripts
COPY ops/phoenix-held-runner-20261015/entrypoint.sh /opt/phoenix/entrypoint.sh
COPY ops/phoenix-held-runner-20261015/supervise.mjs /opt/phoenix/supervise.mjs
RUN chmod 0555 /opt/phoenix/entrypoint.sh && chmod 0444 /opt/phoenix/supervise.mjs \
    && chown -R node:node /srv/uberbond
ENV PHOENIX_HELD_RESTORE_PROBE=1 NODE_ENV=production PROCESS_ROLE=web STORE_BACKEND=postgres \
    DATABASE_SSL=true PORT=28994 APP_BASE_URL=https://held-restore.invalid \
    AUTOPILOT_ENABLED=false OUTBOUND_ENABLED=false OUTBOUND_DRY_RUN=true \
    OUTBOUND_EMERGENCY_STOP=true PUBLIC_AUDIT_ENABLED=false AGENT_RELAY_ENABLED=false \
    ALLOW_TEST_PAYMENT_UNLOCK=false NODE_TLS_REJECT_UNAUTHORIZED=1
WORKDIR /srv/uberbond
ENTRYPOINT ["/opt/phoenix/entrypoint.sh"]
