# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Sin corepack ni pnpm en runtime: `next start` no los necesita y evit asi que el
# contenedor descargue pnpm o dispare un install implicito al arrancar.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/pipeline ./pipeline
COPY --from=build --chown=node:node /app/investigacion ./investigacion
EXPOSE 3000
# node:22-alpine ya trae el usuario sin privilegios "node" (PT-09 en
# investigacion/Pentesting.md): nada en `next start` necesita root.
USER node
CMD ["node_modules/.bin/next", "start"]
