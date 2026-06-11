# LawyersKonnect — Deploy checklist

Repo: `https://github.com/aroojfatima786/Lawyerskonnect`

## Order (follow this)

1. MongoDB Atlas (free DB)
2. Render (backend API)
3. Vercel (frontend)
4. Vercel env update + redeploy
5. Stripe webhook (optional, for payments)

---

## 1. MongoDB Atlas (free)

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → Create **M0 Free** cluster.
2. Database Access → user + password.
3. Network Access → **Allow access from anywhere** (`0.0.0.0/0`) for Render demo.
4. Connect → Drivers → copy URI, e.g.  
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/lawyerskonnect?retryWrites=true&w=majority`

Save as `MONGODB_URI`.

---

## 2. Render — backend

1. [render.com](https://render.com) → Sign in with GitHub.
2. **New +** → **Web Service** → repo **Lawyerskonnect**.
3. Settings:

| Field | Value |
|-------|--------|
| Name | `lawyerskonnect-api` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:prod` |
| Plan | Free (demo) or Starter (viva, no sleep) |

4. **Environment** (required):

```
MONGODB_URI=<Atlas URI>
JWT_SECRET=<long random string>
NODE_ENV=production
FRONTEND_URL=https://YOUR-APP.vercel.app
CORS_ORIGINS=https://YOUR-APP.vercel.app
AI_LEGAL_PROVIDER=openai
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-4o-mini
PAYMENT_PROVIDER=manual
STRIPE_SECRET_KEY=<sk_test_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
AUTH_LOGIN_OTP_ENABLED=false
```

Use a **placeholder** Vercel URL first if frontend not deployed yet; update after step 3.

5. **Create Web Service** → wait for deploy (5–10 min first time).
6. Copy live URL, e.g. `https://lawyerskonnect-api.onrender.com`
7. Test: open `https://YOUR-API.onrender.com/public/stats` in browser (JSON = OK).

**Chatbot PDF/RAG:** Already in repo (`law download/`, `backend/data/rag/`) — no extra upload.

---

## 3. Vercel — frontend

1. [vercel.com](https://vercel.com) → GitHub login.
2. **Add New Project** → **Lawyerskonnect** repo.
3. **Root Directory:** `frontend` (Edit → set to `frontend`).
4. **Environment Variables:**

| Name | Value |
|------|--------|
| `VITE_API_BASE_URL` | `https://lawyerskonnect-api.onrender.com` (your Render URL, no trailing slash) |
| `VITE_STRIPE_ENABLED` | `true` |

5. **Deploy** → copy URL, e.g. `https://lawyerskonnect.vercel.app`

---

## 4. Connect frontend ↔ backend

1. **Render** → Environment → set:
   - `FRONTEND_URL` = your Vercel URL
   - `CORS_ORIGINS` = same Vercel URL  
   Save → auto redeploy.

2. **Vercel** → confirm `VITE_API_BASE_URL` = Render URL → **Redeploy** if you changed it.

3. Test: Vercel site → Sign up / Login / AI Legal Guidance.

---

## 5. Stripe (test mode)

1. Stripe Dashboard → Webhooks → Add endpoint:  
   `https://YOUR-API.onrender.com/payment/stripe/webhook`
2. Events: `checkout.session.completed`
3. Copy **Signing secret** → Render `STRIPE_WEBHOOK_SECRET`
4. Render `STRIPE_SECRET_KEY` = Secret key from Stripe Developers.

If webhook misses (free tier sleep), use **Verify Stripe** on Payments page.

---

## Do not delete (chatbot)

- `law download/` — source PDFs
- `backend/data/rag/` — runtime index

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Vercel build fails | Set `VITE_API_BASE_URL` before deploy |
| CORS error | `CORS_ORIGINS` + `FRONTEND_URL` = exact Vercel URL (https, no slash) |
| API slow first request | Render free tier waking up — wait 30–60s |
| Chatbot empty answers | Check `OPENAI_API_KEY` on Render logs |
