// ============================================================
//  auth.js — Discord OAuth2 + Access Control
//  No password. Login via Discord only.
//  Admin access = manually approved by owner in admin panel.
//  User access  = self-register, owner approves.
// ============================================================

const crypto = require("crypto");
const { AccessControl } = require("./database/economy");

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     ?? "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const APP_BASE_PATH         = process.env.APP_BASE_PATH         ?? "/bots";
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  ?? "https://hazelink.app/bots/auth/callback";
const OWNER_ID              = process.env.OWNER_ID              ?? "";

const DISCORD_API  = "https://discord.com/api/v10";
const OAUTH_BASE   = "https://discord.com/oauth2/authorize";
const TOKEN_URL    = `${DISCORD_API}/oauth2/token`;
const SCOPES       = "identify guilds";

// ── In-memory session store ───────────────────────────────────
const sessions = new Map();

function getOAuthURL(state) {
  return `${OAUTH_BASE}?${new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    state,
    prompt:        "consent",
  })}`;
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code", code, redirect_uri: DISCORD_REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange: ${res.status}`);
  return res.json();
}

async function fetchDiscordUser(token) {
  const res = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Failed to fetch Discord user");
  return res.json();
}

async function fetchDiscordGuilds(token) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  return res.json();
}

// ── Sessions ──────────────────────────────────────────────────
function createSession(data) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { ...data, expiresAt: Date.now() + 24 * 3_600_000 });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}
function deleteSession(token) { sessions.delete(token); }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now > v.expiresAt) sessions.delete(k);
}, 30 * 60 * 1000);

// ── Middleware ─────────────────────────────────────────────────
function sessionMiddleware(req, res, next) {
  const s = getSession(req.cookies?.hazel_session);
  req.session = s ?? null;
  req.user    = s?.user ?? null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect(`${APP_BASE_PATH}/login`);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect(`${APP_BASE_PATH}/login`);
  if (req.user.role !== "admin" && req.user.discordId !== OWNER_ID)
    return res.status(403).json({ error: "Admin access required." });
  next();
}

function requireApproved(req, res, next) {
  if (!req.user) return res.redirect(`${APP_BASE_PATH}/login`);
  if (!req.user.approved && req.user.discordId !== OWNER_ID)
    return res.status(403).json({ error: "Your account is pending approval." });
  next();
}

// ── Auth routes ───────────────────────────────────────────────
function attachAuthRoutes(app, botClient) {
  const cookieParser = require("cookie-parser");
  app.use(cookieParser());
  app.use(sessionMiddleware);

  // ── Login page ─────────────────────────────────────────────
  app.get(["/bots/login", "/bots/hazel/login"], (req, res) => {
    if (req.user?.approved || req.user?.discordId === OWNER_ID) return res.redirect(`${APP_BASE_PATH}/dashboard`);
    const error = req.query.error;
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60_000, sameSite: "lax" });

    const errorMsg = {
      denied:       "Discord login was cancelled.",
      not_approved: "Your account is pending approval from an admin.",
      banned:       "Your account has been suspended.",
      auth_failed:  "Authentication failed. Please try again.",
    }[error] ?? "";

    res.send(loginPage(getOAuthURL(state), errorMsg));
  });

  // ── OAuth callback ─────────────────────────────────────────
  app.get(["/bots/auth/callback", "/bots/hazel/auth/callback"], async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${APP_BASE_PATH}/login?error=denied`);

    const storedState = req.cookies?.oauth_state;
    if (!state || state !== storedState) return res.status(400).send("Invalid state.");

    try {
      const tokens  = await exchangeCode(code);
      const dUser   = await fetchDiscordUser(tokens.access_token);
      const guilds  = await fetchDiscordGuilds(tokens.access_token);

      const avatarURL = dUser.avatar
        ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.webp?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(dUser.id >> 22n % 6n) % 6}.png`;

      // Upsert access record
      let access = await AccessControl.findOne({ discordId: dUser.id });
      const isOwner = dUser.id === OWNER_ID;

      if (!access) {
        access = await AccessControl.create({
          userId:    dUser.id,
          discordId: dUser.id,
          username:  dUser.username,
          avatar:    avatarURL,
          role:      isOwner ? "admin" : "user",
          approved:  isOwner,
          banned:    false,
        });
      } else {
        access.username = dUser.username;
        access.avatar   = avatarURL;
        if (isOwner) { access.role = "admin"; access.approved = true; }
        await access.save();
      }

      if (access.banned) return res.redirect(`${APP_BASE_PATH}/login?error=banned`);

      const sessionData = {
        user: {
          discordId:   dUser.id,
          username:    dUser.username,
          avatar:      avatarURL,
          role:        access.role,
          approved:    access.approved || isOwner,
          isOwner,
          accessToken: tokens.access_token,
          guilds:      guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon, permissions: g.permissions })),
        },
      };

      const token = createSession(sessionData);
      res
        .clearCookie("oauth_state")
        .cookie("hazel_session", token, {
          httpOnly: true, maxAge: 24 * 3_600_000,
          sameSite: "lax", secure: process.env.NODE_ENV === "production",
        });

      if (!access.approved && !isOwner) return res.redirect(`${APP_BASE_PATH}/pending`);
      res.redirect(`${APP_BASE_PATH}/dashboard`);
    } catch (err) {
      console.error("[Auth] Callback error:", err.message);
      res.redirect(`${APP_BASE_PATH}/login?error=auth_failed`);
    }
  });

  // ── Pending approval page ──────────────────────────────────
  app.get(["/bots/pending", "/bots/hazel/pending"], sessionMiddleware, (req, res) => {
    res.send(pendingPage(req.user));
  });

  // ── Logout ─────────────────────────────────────────────────
  app.get(["/bots/logout", "/bots/hazel/logout"], (req, res) => {
    deleteSession(req.cookies?.hazel_session);
    res.clearCookie("hazel_session").redirect(`${APP_BASE_PATH}/login`);
  });
}

// ── Login page HTML ───────────────────────────────────────────
function loginPage(oauthURL, errorMsg) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sign in — Hazel Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:#07071A;color:#EEF0FF;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 800px 600px at 50% 0%,rgba(91,110,245,.12),transparent);pointer-events:none;}
.card{background:#12122E;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:48px 44px;text-align:center;width:100%;max-width:420px;box-shadow:0 40px 100px rgba(0,0,0,.5);}
.logo{width:68px;height:68px;border-radius:18px;background:linear-gradient(135deg,#5B6EF5,#2DD4BF);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:900;box-shadow:0 12px 40px rgba(91,110,245,.4);}
h1{font-size:1.6rem;font-weight:800;letter-spacing:-.03em;margin-bottom:6px;}
.sub{color:#7878A0;font-size:.9rem;line-height:1.6;margin-bottom:28px;}
.error{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:10px;padding:10px 16px;font-size:.83rem;color:#F43F5E;margin-bottom:20px;text-align:left;}
.btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:14px;background:#5865F2;color:#fff;text-decoration:none;border-radius:12px;font-size:1rem;font-weight:700;transition:background .2s,transform .15s,box-shadow .2s;box-shadow:0 6px 24px rgba(88,101,242,.4);}
.btn:hover{background:#4752c4;transform:translateY(-1px);box-shadow:0 10px 30px rgba(88,101,242,.5);}
.btn svg{flex-shrink:0;}
.footer{margin-top:24px;font-size:.75rem;color:#4A4A7A;}
</style></head><body>
<div class="card">
  <div class="logo">H</div>
  <h1>Hazel Dashboard</h1>
  <p class="sub">Sign in with your Discord account to access the Hazelink bot management panel.</p>
  ${errorMsg ? `<div class="error">⚠️ ${errorMsg}</div>` : ""}
  <a class="btn" href="${oauthURL}">
    <svg width="22" height="17" viewBox="0 0 71 55" fill="none"><path d="M60.105 4.898A58.55 58.55 0 0 0 45.232.176a.22.22 0 0 0-.232.11 40.78 40.78 0 0 0-1.8 3.698 54.07 54.07 0 0 0-16.235 0 37.37 37.37 0 0 0-1.827-3.698.229.229 0 0 0-.232-.11A58.36 58.36 0 0 0 10.033 4.9a.207.207 0 0 0-.095.082C1.578 17.39-.944 29.574.293 41.601a.244.244 0 0 0 .092.167 58.8 58.8 0 0 0 17.722 8.957.23.23 0 0 0 .25-.083 42.04 42.04 0 0 0 3.627-5.9.225.225 0 0 0-.123-.312 38.77 38.77 0 0 1-5.539-2.64.228.228 0 0 1-.022-.378c.372-.279.744-.569 1.1-.862a.22.22 0 0 1 .23-.031c11.622 5.305 24.198 5.305 35.683 0a.219.219 0 0 1 .232.028c.356.293.728.586 1.103.865a.228.228 0 0 1-.02.378 36.384 36.384 0 0 1-5.54 2.637.226.226 0 0 0-.12.315 47.18 47.18 0 0 0 3.624 5.897.226.226 0 0 0 .249.084 58.66 58.66 0 0 0 17.737-8.957.228.228 0 0 0 .092-.164c1.48-15.315-2.48-28.618-10.497-40.62a.18.18 0 0 0-.092-.084z" fill="#fff"/></svg>
    Continue with Discord
  </a>
  <p class="footer">hazelink.app · Hazel v2.0</p>
</div>
</body></html>`;
}

function pendingPage(user) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pending Approval — Hazel</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:#07071A;color:#EEF0FF;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.card{background:#12122E;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:48px 44px;text-align:center;max-width:420px;width:100%;}
.icon{font-size:3rem;margin-bottom:16px;}
h1{font-size:1.5rem;font-weight:800;margin-bottom:8px;}
p{color:#7878A0;font-size:.9rem;line-height:1.6;margin-bottom:24px;}
.avatar{width:56px;height:56px;border-radius:50%;border:2px solid rgba(255,255,255,.15);margin:0 auto 12px;}
.username{font-weight:700;font-size:1rem;margin-bottom:4px;}
.tag{font-size:.78rem;color:#4A4A7A;font-family:monospace;}
a{color:#5B6EF5;text-decoration:none;font-size:.85rem;}
</style></head><body>
<div class="card">
  <div class="icon">⏳</div>
  ${user ? `<img class="avatar" src="${user.avatar}" alt="avatar"/>
  <div class="username">${user.username}</div>` : ""}
  <h1>Pending Approval</h1>
  <p>Your account has been registered and is awaiting approval from an administrator. You'll be able to access the dashboard once approved.</p>
  <a href="/bots/hazel/logout">← Sign out</a>
</div>
</body></html>`;
}

module.exports = {
  attachAuthRoutes, sessionMiddleware,
  requireAuth, requireAdmin, requireApproved,
  getSession, createSession, deleteSession,
  fetchDiscordUser, fetchDiscordGuilds,
};
