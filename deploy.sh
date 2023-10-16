#!/bin/bash -xv
docker run -t --rm -e NODE_TLS_REJECT_UNAUTHORIZED=0 -v $PWD:/app -w /app node:6 npm install --quiet --progress=false && \
docker run -t --rm -v $PWD:/app -w /app node:6 npm run deploy
