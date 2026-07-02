# ⚡ Hazelink Bot — v2 Update Guide
## New Economy, Businesses, Investments & Dashboard

This README covers **only the new files** added in v2.  
It tells you exactly what to create, what to replace, and how to run everything locally on your PC.

---

## 📁 New Files — What to Create

### Folder structure to add:

```
hazelink-bot/
├── commands/
│   └── economy/
│       └── index.js              ← NEW (all slash economy commands)
├── features/
│   ├── economySystem/
│   │   └── index.js              ← REPLACE (updated)
│   ├── investmentSystem/
│   │   └── index.js              ← NEW
│   └── businessSystem/
│       └── index.js              ← NEW
├── database/
│   └── economy.js                ← REPLACE (updated schema)
├── public/
│   └── dashboard.html            ← REPLACE (full new user dashboard)
├── dashboard.js                  ← REPLACE (all new API routes)
└── index.js                      ← REPLACE (root index only)
```

---

## 📝 Step by Step

### Step 1 — Create new folders

Inside `hazelink-bot/`, create these folders if they don't exist:

```
commands/economy/
features/investmentSystem/
features/businessSystem/
```

### Step 2 — Drop in new files

| File | Action |
|------|--------|
| `commands/economy/index.js` | Create new |
| `features/investmentSystem/index.js` | Create new |
| `features/businessSystem/index.js` | Create new |
| `features/economySystem/index.js` | Replace existing |
| `database/economy.js` | Replace existing |
| `public/dashboard.html` | Replace existing |
| `dashboard.js` | Replace existing |
| `index.js` (root only) | Replace existing |

> ⚠️ Do NOT replace `public/admin.html` — that file is unchanged.

### Step 3 — Install new dependency

Open your terminal inside `hazelink-bot/` and run:

```bash
npm install
```

This picks up any new packages. No new packages were added in v2 but run it anyway to be safe.

---

## 🖥️ Running on Your PC (Local Hosting)

### Prerequisites

Make sure these are installed on your PC:

- **Node.js v18+** → [nodejs.org](https://nodejs.org) (download LTS)
- **MongoDB** → Either:
  - MongoDB Atlas (free cloud) → [mongodb.com/atlas](https://mongodb.com/atlas) ← recommended
  - Or MongoDB locally → [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
- **Git** (optional but recommended) → [git-scm.com](https://git-scm.com)

---

### Option A — Run directly on your PC

#### 1. Create a `.env` file

Inside `hazelink-bot/`, create a file called `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/hazelink
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/bots/hazel/auth/callback
OWNER_ID=your_discord_user_id
PORT=3000
METALS_API_KEY=your_free_metals_api_key
NODE_ENV=development
```

> For `METALS_API_KEY` → sign up free at [metalpriceapi.com](https://metalpriceapi.com) (free tier = 100 requests/month, enough for testing)

#### 2. Start the bot

```bash
cd hazelink-bot
npm start
```

You should see:
```
✅ Hazel is online! Logged in as Hazel#XXXX
[DB] MongoDB connected.
[API] Registered 20 slash command(s).
[Dashboard] http://localhost:3000/bots/hazel/dashboard
[Dashboard] Admin → http://localhost:3000/bots/hazel/admin
[Invest] Investment system initialised. Prices refresh every 60s.
[Business] Business system initialised.
```

#### 3. Access the dashboard

Open your browser and go to:
- **User Dashboard** → `http://localhost:3000/bots/hazel/dashboard`
- **Admin Panel** → `http://localhost:3000/bots/hazel/admin`

---

### Option B — Keep it running 24/7 on your PC

Install PM2 (a process manager):

```bash
npm install -g pm2
```

Then start the bot with PM2:

```bash
cd hazelink-bot
pm2 start index.js --name "hazel-bot"
pm2 save
pm2 startup
```

PM2 will:
- Keep the bot running even if you close the terminal
- Auto-restart if it crashes
- Start automatically when your PC boots

Useful PM2 commands:
```bash
pm2 logs hazel-bot     # View live logs
pm2 restart hazel-bot  # Restart the bot
pm2 stop hazel-bot     # Stop the bot
pm2 status             # See if it's running
```

---

### Option C — Make it accessible from the internet (for Netlify dashboard)

Since your PC is the server, you need to expose `localhost:3000` to the internet so `hazelink.app/bots/hazel` can talk to it.

**Use ngrok (free):**

1. Download ngrok → [ngrok.com/download](https://ngrok.com/download)
2. Sign up free and get your auth token
3. Run:

```bash
ngrok http 3000
```

You'll get a URL like:
```
https://abc123.ngrok-free.app
```

4. Update your `bots/hazel/index.html` on Netlify:
```js
const API_BASE = 'https://abc123.ngrok-free.app';
```

5. Also update your `.env`:
```env
DISCORD_REDIRECT_URI=https://abc123.ngrok-free.app/bots/hazel/auth/callback
```

And add it in Discord Developer Portal → OAuth2 → Redirects.

> ⚠️ ngrok URL changes every time you restart unless you have a paid plan. For a permanent free URL, try **Cloudflare Tunnel** instead:

**Cloudflare Tunnel (free, permanent URL):**

1. Install cloudflared → [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads)
2. Login: `cloudflared tunnel login`
3. Create a tunnel: `cloudflared tunnel create hazel-bot`
4. Route it: `cloudflared tunnel route dns hazel-bot bot.hazelink.app`
5. Run: `cloudflared tunnel run hazel-bot`

This gives you a permanent `bot.hazelink.app` URL for free that always points to your PC.

---

## 🌐 Netlify — Update API_BASE

After setting up ngrok or Cloudflare Tunnel, open:
```
hazelink-netlify/bots/hazel/index.html
```

Find:
```js
const API_BASE = 'https://your-bot-backend.com';
```

Replace with your tunnel URL:
```js
const API_BASE = 'https://abc123.ngrok-free.app';
// or
const API_BASE = 'https://bot.hazelink.app';
```

Re-deploy to Netlify.

---

## 🔑 Discord Developer Portal — Required Steps

1. Go to → [discord.com/developers/applications](https://discord.com/developers/applications)
2. Select your Hazel app
3. **OAuth2 → Redirects** → Add:
   - `http://localhost:3000/bots/hazel/auth/callback` (for local dev)
   - `https://your-tunnel-url/bots/hazel/auth/callback` (for production)
4. **Bot → Privileged Gateway Intents** → Enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
   - ✅ Presence Intent

---

## 💰 New Economy Commands (All Slash)

| Command | Description |
|---------|-------------|
| `/balance` | Check wallet balance |
| `/daily` | Claim daily reward |
| `/work` | Work a random job |
| `/gamble <amount>` | Slot machine |
| `/rob @user` | Rob another user |
| `/give @user <amount>` | Send coins |
| `/deposit <amount>` | Wallet → Bank |
| `/withdraw <amount>` | Bank → Wallet |
| `/shop` | Browse shop |
| `/buy <item>` | Buy shop item |
| `/inventory` | View inventory |
| `/leaderboard` | Richest members |
| `/business` | View all businesses |
| `/buy-business <name>` | Buy a business |
| `/collect <business>` | Collect income |
| `/upgrade <business>` | Upgrade level |
| `/market` | Live market prices |
| `/invest <symbol> <shares>` | Buy investment |
| `/sell <symbol>` | Sell investment |
| `/portfolio` | View active investments |

---

## 🏢 Businesses

| Business | L1 Price | L1 Income | Cooldown |
|----------|----------|-----------|----------|
| Coffee Shop | 50,000 | 800 | 1h |
| Restaurant | 150,000 | 2,500 | 2h |
| Car Dealership | 500,000 | 8,000 | 3h |
| Tech Startup | 1,500,000 | 25,000 | 4h |
| Real Estate Agency | 5,000,000 | 85,000 | 6h |
| Private Bank | 15,000,000 | 280,000 | 8h |

Each level: price ×2.5, income ×2, cooldown +45min, max Level 3.

---

## 📈 Stocks & Investments

| Symbol | Name | Type | Source |
|--------|------|------|--------|
| GOOGL | Google | Stock | Yahoo Finance |
| AMZN | Amazon | Stock | Yahoo Finance |
| NVDA | Nvidia | Stock | Yahoo Finance |
| AAPL | Apple | Stock | Yahoo Finance |
| 005930.KS | Samsung | Stock | Yahoo Finance |
| OQ | OQ | Stock | Simulated |
| HZLK | Hazelink | Stock | Simulated (250 coins start) |
| BTC | Bitcoin | Crypto | CoinGecko |
| DOGE | Dogecoin | Crypto | CoinGecko |
| XAU | Gold | Commodity | Metals API |
| XAG | Silver | Commodity | Metals API |

**Rules:** 2 hour hold · 7% tax on profits · No tax on losses

---

## 🛡️ Security Features

- **Secured users** — Admin can toggle protection on any user in the admin panel. When secured, `/rob` attempts against them fail with a shield message.
- **Wealth Roles** — Auto-assigned/removed based on total coins (wallet + bank combined). Configurable tiers in admin panel.

---

## 🗺️ URL Map

```
localhost:3000/bots/hazel/login       → Discord login page
localhost:3000/bots/hazel/dashboard   → User dashboard
localhost:3000/bots/hazel/admin       → Admin panel
localhost:3000/bots/hazel/api/*       → All API endpoints
hazelink.app/bots                     → Bot selector (Netlify)
hazelink.app/bots/hazel               → Hazel dashboard (Netlify)
```

---

## ✅ Final Checklist

- [ ] Created `commands/economy/index.js`
- [ ] Created `features/investmentSystem/index.js`
- [ ] Created `features/businessSystem/index.js`
- [ ] Replaced `features/economySystem/index.js`
- [ ] Replaced `database/economy.js`
- [ ] Replaced `public/dashboard.html`
- [ ] Replaced `dashboard.js`
- [ ] Replaced root `index.js`
- [ ] Created `.env` with all variables
- [ ] Ran `npm install`
- [ ] Privileged intents enabled in Discord Developer Portal
- [ ] Redirect URIs added in Discord Developer Portal
- [ ] PM2 installed and bot started (for 24/7)
- [ ] ngrok or Cloudflare Tunnel set up (to expose to internet)
- [ ] `API_BASE` updated in Netlify `bots/hazel/index.html`
- [ ] Free Metals API key added for gold/silver prices
#   H a z e  
 #   H a z e  
 #   H a z e  
 