# LawyersKonnect — Docker (local full stack)

Run **MongoDB + backend + frontend** with one command. Does not replace Vercel/Render production deploy.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows: enable WSL2)
- Stop local `npm start` / `npm run dev` if ports **3000** or **5173** are in use

## Quick start

```bash
# 1. Configure secrets (first time only)
cp .env.docker.example .env.docker
# Edit .env.docker — at minimum set JWT_SECRET; add OPENAI_API_KEY for chatbot

# 2. Build and start everything
docker compose up --build

# 3. Open in browser
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000/public/stats  (JSON = OK)
```

Stop:

```bash
docker compose down
```

Remove volumes (fresh DB):

```bash
docker compose down -v
```

## What runs

| Service  | Image / build      | Host port | Purpose                    |
|----------|--------------------|-----------|----------------------------|
| mongo    | mongo:7            | 27017     | MongoDB database           |
| backend  | backend/Dockerfile | 3000      | NestJS API + chatbot + KYC |
| frontend | frontend/Dockerfile| 5173      | React app (nginx)          |

## Manual configuration (`.env.docker`)

Copy from `.env.docker.example`. **Never commit `.env.docker`.**

| Variable | Required? | Notes |
|----------|-----------|-------|
| `JWT_SECRET` | Yes | Long random string |
| `OPENAI_API_KEY` | Recommended | AI Legal Guidance |
| `STRIPE_*` | No | Card payments demo |
| `GMAIL_*` | No | Default `EMAIL_PROVIDER=mock` in compose |
| `CLOUDINARY_*` | No | `NODE_ENV=development` uses local `uploads/` |

Compose overrides in `docker-compose.yml` (you usually don't change these):

- `MONGODB_URI=mongodb://mongo:27017/lawyerskonnect`
- `FRONTEND_URL` / `CORS_ORIGINS` = `http://localhost:5173`

## MongoDB Atlas instead of local container

1. Set `MONGODB_URI` in `.env.docker` to your Atlas connection string
2. Comment out or remove the `mongo` service and `depends_on` in `docker-compose.yml`
3. Remove `MONGODB_URI` override under `backend.environment`

## First build notes

- **5–15 minutes** first time (npm, Python/OpenCV, KYC ONNX model download ~30MB)
- RAG chatbot uses **pre-built** index in `backend/data/rag/` (342 source PDFs not copied into image)
- KYC face match needs Python in the backend image (included)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 3000/5173 in use | Stop local Node servers or change compose ports |
| Backend unhealthy | `docker compose logs backend` — check MongoDB connection |
| Chatbot empty | Set `OPENAI_API_KEY` in `.env.docker`, restart: `docker compose up --build backend` |
| KYC face match fails | Rebuild backend: `docker compose build --no-cache backend` |
| CORS error | Ensure `FRONTEND_URL`/`CORS_ORIGINS` match `http://localhost:5173` |

## Branch / production safety

Docker files live on **`feature/docker`** until merged. Vercel + Render deploy from `main` unchanged.
