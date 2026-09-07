FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY shared ./shared
COPY hub ./hub

RUN npm ci --omit=dev --ignore-scripts
RUN npm run --workspace @ithyno/hub build

EXPOSE 4322
CMD ["node", "hub/dist/index.js"]
