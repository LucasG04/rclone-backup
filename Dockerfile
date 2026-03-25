FROM node:22-alpine

RUN apk update && apk add --no-cache tzdata rclone bash

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --omit=dev

COPY src /app/src

CMD ["npm", "start"]