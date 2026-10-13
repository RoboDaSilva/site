FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80
ENV PORT=80

CMD ["sh", "-c", "ls -la /app && node server.cjs"]
