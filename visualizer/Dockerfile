FROM node:24.16.0-alpine3.23 AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY visualizer/package.json visualizer/package.json

RUN npm ci

COPY visualizer visualizer

RUN npm run build --workspace visualizer

FROM node:24.16.0-alpine3.23 AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY visualizer/package.json visualizer/package.json

RUN npm ci --omit=dev --workspace visualizer --include-workspace-root=false

FROM node:24.16.0-alpine3.23 AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY visualizer/package.json visualizer/package.json
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/visualizer/dist visualizer/dist

RUN adduser -D -h /home/appuser -s /sbin/nologin appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

ENTRYPOINT ["node", "visualizer/dist/src/index.js", "--host", "0.0.0.0", "--port", "8080"]
