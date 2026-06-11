# LawyersKonnect — Public deploy (Chrome mein link, bina domain)

**Domain nahi hai? Koi baat nahi.** Docker + **Cloudflare free tunnel** se app internet par chalti hai aur free HTTPS link milti hai:

`https://lawyerskonnect-a1b2.trycloudflare.com`

Supervisor / koi bhi Chrome mein link khole — tumhare laptop par kuch run karne ki zaroorat nahi.

> **Free domain hosting:** Cloudflare `trycloudflare.com` subdomain bilkul free hai. Render jaisa 15 min sleep nahi. Sirf ek **Oracle Cloud free VM** chahiye jahan Docker 24/7 chale.

Poori app **Docker + Cloudflare free tunnel** se internet par — supervisor ko sirf link bhejo.

---

## Kya chalega

| Service | Role |
|---------|------|
| mongo | Database (Docker volume) |
| backend | NestJS API + chatbot + KYC |
| frontend | React app (nginx) |
| gateway | Ek URL — SPA + API same origin |
| cloudflared | Free HTTPS tunnel (Cloudflare) |

---

## Step 1 — Oracle Cloud free VM (24/7 server)

1. [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) → account
2. **Compute → Instances → Create**
   - Shape: **Ampere** (Always Free)
   - OS: **Ubuntu 22.04**
   - SSH key add karo
3. **Networking → Security list → Ingress**
   - Port **22** (SSH)
   - Port **8080** (optional — local gateway debug)
   - Cloudflare tunnel ke liye **3000/80 public khulne ki zaroorat nahi** (outbound enough)
4. Public IP note karo

---

## Step 2 — VM par Docker + Git

```bash
ssh ubuntu@YOUR_VM_IP

sudo apt update && sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# logout + login
```

```bash
git clone https://github.com/aroojfatima786/Lawyerskonnect.git
cd Lawyerskonnect
git checkout feature/docker   # ya main jab merge ho
```

---

## Step 3 — Secrets configure karo

```bash
cp .env.public.example .env.public
nano .env.public
```

**Zaroori:**

| Variable | Example |
|----------|---------|
| `JWT_SECRET` | lamba random string |
| `OPENAI_API_KEY` | sk-... (chatbot ke liye) |

`PUBLIC_URL` pehli dafa placeholder rehne do — script tunnel URL khud batayegi.

---

## Step 4 — Ek command deploy

```bash
chmod +x deploy-public.sh
./deploy-public.sh
```

Script:
1. Sab containers build/start karega (~10–15 min pehli dafa)
2. Cloudflare tunnel URL print karega
3. `.env.public` mein `PUBLIC_URL=` update karke dubara chalao:

```bash
nano .env.public   # PUBLIC_URL=https://xxxx.trycloudflare.com
./deploy-public.sh
```

**Test Chrome mein:** tunnel URL kholo → home page → register/login

**API test:**
```bash
curl -s https://YOUR-TUNNEL-URL.trycloudflare.com/public/stats
```

---

## Step 5 — Render band karo (15 min sleep khatam)

1. [render.com](https://render.com) → login
2. Service **lawyerskonnect-api** kholo
3. **Suspend** ya **Delete**
4. Ab backend sirf Docker VM par hai

---

## Step 6 — Vercel (optional)

Pehle Vercel par frontend tha. Ab **poori app Docker tunnel se** chal rahi hai.

- Vercel project **band** kar sakti ho (optional)
- Agar Vercel chalta rahe to purana link confuse karega — FYP demo ke liye sirf tunnel URL use karo

---

## Manual config summary

| Item | Required? |
|------|-----------|
| Oracle Cloud VM | Haan |
| `.env.public` → JWT_SECRET | Haan |
| OPENAI_API_KEY | Recommended |
| PUBLIC_URL (tunnel) | Deploy ke baad |
| Domain | **Nahi** |
| Cloudinary | Nahi (NODE_ENV=development) |
| Stripe / Gmail | Nahi (internal demo) |

---

## Legal chatbot (RAG index)

Chatbot pre-built index use karta hai: `backend/data/rag/` (`chunks_meta.json`, `embeddings.f32.bin`).

- Agar files git mein hain → Docker image mein automatically jati hain
- Agar khali ho → OpenAI answers chalenge, lekin RAG citations weak hongi
- Index rebuild (optional, heavy):

```bash
# Local machine par (342 PDFs chahiye law download/ folder mein)
cd backend
pip install -r scripts/requirements-legal-rag.txt
npm run setup:legal-rag
git add data/rag/
git commit -m "Add legal RAG index"
```

---

## Useful commands

```bash
# Status
docker compose -f docker-compose.public.yml ps

# Logs
docker compose -f docker-compose.public.yml logs -f backend
docker compose -f docker-compose.public.yml logs -f cloudflared

# Restart
docker compose -f docker-compose.public.yml --env-file .env.public up -d

# Stop
docker compose -f docker-compose.public.yml down

# Fresh database
docker compose -f docker-compose.public.yml down -v
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Tunnel URL nahi mili | `docker logs lawyerskonnect-tunnel` — 1 min wait |
| Login fail / CORS | `PUBLIC_URL` tunnel se match kare, frontend rebuild: `./deploy-public.sh` |
| API 404 on /public/stats | Gateway check: `curl http://127.0.0.1:8080/public/stats` on VM |
| Chat socket fail | Same `PUBLIC_URL` use karo; tunnel WebSocket support karta hai |
| Upload fail | `NODE_ENV=development` rakho ya Cloudinary add karo |
| Tunnel URL badal gayi (restart) | `.env.public` update + `./deploy-public.sh` dubara |

---

## FYP demo flow

1. VM par `./deploy-public.sh` chalao
2. Tunnel URL copy karo
3. Supervisor ko WhatsApp/email par link bhejo
4. Wo Chrome khole → app dikhao — **tumhare laptop par kuch run nahi**

---

## Local test (laptop par, optional)

```bash
cp .env.public.example .env.public
# PUBLIC_URL=http://localhost:8080
docker compose -f docker-compose.public.yml --env-file .env.public up -d --build
# Browser: http://localhost:8080
```

Local par cloudflared bhi tunnel URL dega — production ke liye VM use karo.
