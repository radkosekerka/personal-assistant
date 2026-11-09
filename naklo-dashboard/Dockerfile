# Náklo Dashboard: obraz pro Google Cloud Run.
#   web  – Next.js server (standalone výstup), výchozí cíl
#   jobs – plánované úlohy a údržba (npm run bot / sync:bank / sync:events / sync:kilomayo / db:push)
# Build: docker build --target web -t IMAGE . ; docker build --target jobs -t IMAGE-jobs .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Úlohy potřebují tsx a drizzle-kit (devDependencies), proto plné node_modules.
FROM node:22-bookworm-slim AS jobs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
ENTRYPOINT ["npm", "run", "--silent"]
CMD ["bot"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
