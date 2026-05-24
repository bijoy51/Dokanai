# syntax=docker/dockerfile:1
#
# Production build of the Next.js frontend, used by docker-compose.yml for
# local "everything at once" runs. Vercel does NOT use this file — it builds
# the app on its own platform, so changes here can't break the Vercel deploy.

FROM node:20-alpine AS builder
WORKDIR /app

# Install deps with a clean, reproducible lockfile install. Copy package files
# first so this layer caches when only source changes.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app. `next build` reads next.config.mjs / tsconfig.json from /app.
COPY . .
RUN npm run build

# ---- runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Only production deps in the final image.
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Build output + config needed by `next start`.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000
CMD ["npm", "start"]
