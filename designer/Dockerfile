# LE Designer — editor + API in one container. Data (designs, libraries, history) lives in /data.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4000 LE_DESIGNS=/data/designs LE_LIBRARIES=/data/libraries
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js /app/le.js ./
COPY --from=build /app/server ./server
COPY --from=build /app/src/core ./src/core
COPY --from=build /app/designs ./seed/designs
COPY --from=build /app/libraries ./seed/libraries
COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && mkdir -p /data
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/api/docs > /dev/null || exit 1
ENTRYPOINT ["./entrypoint.sh"]
