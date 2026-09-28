# Jalan keluar dari Vercel (D-016): tidak dipakai deploy saat ini, tapi harus tetap bisa di-build.
# Build dari ROOT monorepo:  docker build -f apps/api/Dockerfile -t hris-api .
# Jalankan:                  docker run --rm -p 3000:3000 -e DATABASE_URL=... hris-api

FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app

# Manifest dulu supaya layer dependensi ter-cache.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --ignore-scripts --filter @hris/api

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN cd apps/api && bunx prisma generate \
  && bun build src/index.ts --target=bun --outdir=dist

FROM oven/bun:1.4.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/v1/health || exit 1
CMD ["bun", "dist/index.js"]
