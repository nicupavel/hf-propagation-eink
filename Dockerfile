FROM node:20-bullseye
WORKDIR /usr/src/app


RUN mkdir -p /var/cache/apt/archives/partial \
    && apt-get update || true \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD [ "node", "server.js" ]
