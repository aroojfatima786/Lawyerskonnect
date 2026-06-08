# LawyersKonnect — Deploy notes

## Chatbot PDF / RAG data (do not delete)

| Path | Purpose |
|------|---------|
| `law download/` | ~342 Pakistan Code PDFs — source for `npm run setup:legal-rag` |
| `backend/data/rag/` | Built index (`chunks_meta.json`, `embeddings.f32.bin`, `faiss.index`) — chatbot reads this at runtime |

If you redeploy backend on a new server, copy both folders or run `npm run setup:legal-rag` after copying `law download/`.

## Vercel (frontend only)

1. Push this repo to GitHub.
2. Vercel → **Import Project** → set **Root Directory** to `frontend`.
3. Environment variables:
   - `VITE_API_BASE_URL` = your live NestJS API URL (e.g. `https://api.yourdomain.com`)
   - `VITE_STRIPE_ENABLED=true` (if using Stripe checkout in UI)
4. Deploy.

## Backend (NestJS — not on Vercel)

Host on Railway, Render, VPS, etc. Set env from `backend/.env.example`:

- `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`
- `OPENAI_API_KEY`, `AI_LEGAL_PROVIDER=openai`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, webhook URL → `POST /payment/stripe/webhook`
- `PAYMENT_PROVIDER=manual` is fine; citizens can still pay via Stripe when `VITE_STRIPE_ENABLED=true` and Stripe keys are set.

Build: `cd backend && npm ci && npm run build`  
Start: `npm run start:prod`

## Stripe (production)

Same as local testing: Stripe Checkout + webhook. On deploy, register webhook in Stripe Dashboard pointing to your API `/payment/stripe/webhook`.
