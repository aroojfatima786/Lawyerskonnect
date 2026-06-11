# LawyersKonnect — Docker production deploy (Render ki jagah)

> **No domain?** Use **[DEPLOY-PUBLIC.md](DEPLOY-PUBLIC.md)** — full stack + free `trycloudflare.com` HTTPS URL in one command.

Render free tier **15 minute baad sleep** ho jata hai. Is liye backend ko **Docker** par kisi **24/7 server (VPS)** par chalao.

> **Important:** Docker sirf laptop par nahi — internet par dikhane ke liye ek **cloud VM** chahiye jo hamesha on ho.

## Recommended setup (sab se aasan + free)

| Part | Kahan | Kyun |
|------|-------|------|
| **Frontend** | Vercel (pehle se) | Free, sleep nahi hota |
| **Backend + MongoDB** | Oracle Cloud Free VM + Docker | 24/7 free, Render jaisa sleep nahi |
| **Render** | Band karo | Paid ya 15 min sleep |

Live URLs example:
- Frontend: `https://lawyerskonnect.vercel.app`
- Backend: `http://YOUR_VM_IP:3000`

---

## Step 1 — Oracle Cloud free VM (recommended)

1. [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) → account banao
2. **Compute → Instances → Create**
   - Shape: **Ampere** (Always Free eligible)
   - OS: **Ubuntu 22.04**
   - SSH key add karo
3. **Networking → Security List → Ingress rule** add karo:
   - Port **3000** TCP — source `0.0.0.0/0` (backend API)
   - Port **22** TCP — SSH (sirf apna IP better hai)
4. VM ka **Public IP** note karo

---

## Step 2 — VM par Docker install

SSH se login:

```bash
ssh ubuntu@YOUR_VM_PUBLIC_IP
```

Phir:

```bash
sudo apt update && sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# logout + login again so docker group works
```

---

## Step 3 — Repo clone + env file

```bash
git clone https://github.com/aroojfatima786/Lawyerskonnect.git
cd Lawyerskonnect
git checkout feature/docker   # ya main jab merge ho jaye

cp .env.prod.example .env.prod
nano .env.prod
```

**Zaroori values (.env.prod):**

```env
JWT_SECRET=your-long-random-secret
FRONTEND_URL=https://lawyerskonnect.vercel.app
CORS_ORIGINS=https://lawyerskonnect.vercel.app
API_BASE_URL=http://YOUR_VM_PUBLIC_IP:3000
OPENAI_API_KEY=sk-...
NODE_ENV=development
```

`NODE_ENV=development` = uploads Docker volume par save (Cloudinary bina). FYP demo ke liye theek hai.

---

## Step 4 — Backend + MongoDB start (Vercel frontend ke sath)

```bash
docker compose -f docker-compose.backend.yml --env-file .env.prod up -d --build
```

Check:

```bash
docker compose -f docker-compose.backend.yml ps
curl http://localhost:3000/public/stats
```

Browser se (apne PC se): `http://YOUR_VM_PUBLIC_IP:3000/public/stats` → JSON aana chahiye.

---

## Step 5 — Vercel frontend update

1. [vercel.com](https://vercel.com) → project → **Settings → Environment Variables**
2. Set / update:
   ```
   VITE_API_BASE_URL=http://YOUR_VM_PUBLIC_IP:3000
   ```
   (HTTPS domain ho to `https://api.yourdomain.com` use karo)
3. **Deployments → Redeploy** (env change ke baad zaroori)

---

## Step 6 — Render band karo

1. [render.com](https://render.com) → `lawyerskonnect-api` service
2. **Suspend** ya **Delete** karo — ab backend VM par hai

Purana URL `lawyerskonnect-api.onrender.com` kaam karna band ho jayega. Vercel ab naye VM IP ko call karega.

---

## Full stack ek hi server par (optional)

Agar Vercel bhi nahi rakhna:

```bash
# .env.prod mein:
FRONTEND_URL=http://YOUR_VM_PUBLIC_IP
CORS_ORIGINS=http://YOUR_VM_PUBLIC_IP
API_BASE_URL=http://YOUR_VM_PUBLIC_IP:3000
VITE_API_BASE_URL=http://YOUR_VM_PUBLIC_IP:3000

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.prod --profile fullstack up -d --build
```

Firewall mein port **80** bhi kholo. Browser: `http://YOUR_VM_PUBLIC_IP`

---

## HTTPS (optional, better for FYP demo)

Free options:
- **Cloudflare Tunnel** — domain ke bina bhi HTTPS mil sakta hai
- **Caddy + domain** — apna domain ho to automatic SSL

Bina HTTPS ke bhi FYP internal demo chal jata hai (`http://IP:3000`).

---

## Useful commands

```bash
# Logs
docker compose -f docker-compose.backend.yml logs -f backend

# Restart after .env.prod change
docker compose -f docker-compose.backend.yml --env-file .env.prod up -d --build backend

# Stop
docker compose -f docker-compose.backend.yml down

# Fresh DB (sab data delete)
docker compose -f docker-compose.backend.yml down -v
```

---

## MongoDB Atlas (optional)

Local mongo ki jagah Atlas use karo to `.env.prod` mein:

```env
MONGODB_URI=mongodb+srv://USER:PASS@cluster....mongodb.net/lawyerskonnect
```

Phir `docker-compose.backend.yml` se `mongo` service hata do ya comment karo aur `depends_on: mongo` remove karo.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `curl VM_IP:3000` timeout | Oracle security list / firewall mein port 3000 kholo |
| CORS error browser mein | `CORS_ORIGINS` exactly Vercel URL ho (`https://`, no trailing slash) |
| Upload / KYC fail | `NODE_ENV=development` rakho ya Cloudinary set karo |
| VM restart ke baad down | `restart: unless-stopped` already set — `docker compose ... up -d` dubara chalao |
