# syntax=docker/dockerfile:1
# Imagen de la API y del trabajador. Se construye una vez y sirve para los dos procesos:
#   API:      node apps/api/dist/main.js
#   Trabajador: node apps/worker/dist/main.js
#
# Es multi-etapa para que la imagen final no lleve el codigo fuente ni las herramientas de
# compilacion, pero conserva las dependencias ya instaladas (los paquetes del monorepo se
# construyen a dist y en tiempo de ejecucion solo se leen).

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Primero solo los manifiestos: si no cambian, la instalacion se reutiliza de la cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

# Las variables NEXT_PUBLIC_* de Next.js se incrustan AL CONSTRUIR: si faltan aqui, la web se
# compila sin conexion a Supabase. Se pasan como argumentos de build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN pnpm build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]