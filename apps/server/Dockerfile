# Build from the repo root: docker build -f apps/server/Dockerfile -t doodle-war-server .
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/sim packages/sim
COPY apps/server apps/server
RUN pnpm install --frozen-lockfile --filter @doodle/server...
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
# Node runs the server itself, with tsx loading the TypeScript. Starting it through pnpm would keep a second
# Node process alive beside it for nothing, and hosts bill by memory.
WORKDIR /app/apps/server
# The server runs as the image's unprivileged node user. Root owns the files, so it can read the code but
# not change it.
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
