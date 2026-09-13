FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY server.cjs ./

EXPOSE 10000

ENV NODE_OPTIONS="--dns-result-order=ipv4first"

CMD ["node", "server.cjs"]
