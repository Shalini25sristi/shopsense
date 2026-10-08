# ShopSense is dependency-free, so the image is just Node + the source.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY . .

EXPOSE 3000

# Render (and most hosts) inject PORT; the server reads process.env.PORT.
CMD ["node", "src/server.js"]
