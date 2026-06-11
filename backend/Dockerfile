# Build context: repo root (see docker-compose.yml)
FROM node:22-bookworm-slim

WORKDIR /app

# Python 3 for KYC face-match script (kyc_face_match.py)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./

RUN npm ci --include=dev

COPY backend/scripts/requirements-kyc-docker.txt ./scripts/requirements-kyc-docker.txt
RUN pip3 install --no-cache-dir --break-system-packages -r scripts/requirements-kyc-docker.txt

COPY backend/ ./

# Pre-built RAG index is in backend/data/rag/; ONNX face models are gitignored — download at build
RUN npm run setup:kyc:models

RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
ENV KYC_PYTHON_BIN=python3

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
