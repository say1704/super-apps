const { createServer } = require("https");
const { createServer: httpCreateServer } = require("http");
const httpRequest = require("http").request;
const crypto = require("crypto");
const { parse } = require("url");
const next = require("next");
const path = require("path");
const fs = require("fs");

const dev = process.env.NODE_ENV !== "production";
const httpsPort = parseInt(process.env.HTTPS_PORT || "3443", 10);
const httpRedirectPort = parseInt(process.env.HTTP_PORT || "3001", 10);
const devFallbackPort = parseInt(process.env.PORT || "3001", 10);
const host = process.env.HOST || "0.0.0.0";
const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = path.join(__dirname, "..", "certs");
const certFile = path.join(certDir, "cert.pem");
const keyFile = path.join(certDir, "key.pem");
const hasCert = fs.existsSync(certFile) && fs.existsSync(keyFile);

let jwtSecret = null;
try {
  const keyPath = path.join(__dirname, "..", "backend", ".superapps", "secret.key");
  if (fs.existsSync(keyPath)) {
    jwtSecret = fs.readFileSync(keyPath, "utf-8").trim();
  }
} catch (e) {
  console.error("[AdminUI Auth] Cannot read JWT secret key:", e.message);
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;

function getClientIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.connection.remoteAddress
    || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function verifyToken(token) {
  if (!token || !jwtSecret) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac("sha256", jwtSecret)
      .update(headerB64 + "." + payloadB64)
      .digest("base64url");
    if (signatureB64 !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && payload.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function getTokenFromCookies(cookieHeader) {
  if (!cookieHeader) return null;
  for (const name of ["__Secure-access_token", "access_token"]) {
    const match = cookieHeader.match(new RegExp("(?:^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
    if (match) return match[1];
  }
  return null;
}

function proxyAdminUI(req, res) {
  const ip = getClientIP(req);
  const startTime = Date.now();

  // Rate-limit only the sqlite-web login (brute-force protection). Other
  // /admin-ui requests are already gated by JWT verification below, so
  // throttling them would break normal DB browsing.
  const isLoginAttempt = req.method === "POST" && req.url.startsWith("/admin-ui/login");
  if (isLoginAttempt && isRateLimited(ip)) {
    console.log(`[AdminUI Audit] ${new Date().toISOString()} ${ip} ${req.method} ${req.url} 429 RATE_LIMITED`);
    res.writeHead(429, { "Content-Type": "text/plain" });
    res.end("Too Many Requests");
    return;
  }

  if (!jwtSecret) {
    console.error(`[AdminUI Audit] ${new Date().toISOString()} ${ip} ${req.method} ${req.url} 503 AUTH UNAVAILABLE`);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Authentication unavailable" }));
    return;
  }
  const token = getTokenFromCookies(req.headers.cookie)
    || (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : null);
  if (!token || !verifyToken(token)) {
    console.log(`[AdminUI Audit] ${new Date().toISOString()} ${ip} ${req.method} ${req.url} 401 UNAUTHORIZED`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const proxyPath = req.url.replace(/^\/admin-ui/, "/admin-ui");
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: 8082,
      path: proxyPath,
      method: req.method,
      headers: { ...req.headers, host: "127.0.0.1:8082" },
    },
    (proxyRes) => {
      const duration = Date.now() - startTime;
      const status = proxyRes.statusCode || 0;
      if (status >= 300 && status < 400 && proxyRes.headers.location) {
        proxyRes.headers.location = proxyRes.headers.location.replace(/^https?:\/\/[^/]+/, "");
      }
      console.log(`[AdminUI Audit] ${new Date().toISOString()} ${ip} ${req.method} ${req.url} ${status} ${duration}ms`);
      res.writeHead(status, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    console.error(`[AdminUI Proxy] ${ip} ${req.method} ${req.url} Error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    }
  });
  if (req.pipe) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000);

app.prepare().then(() => {
  if (!jwtSecret) {
    console.error("[AdminUI Auth] JWT secret key not found — /admin-ui access will be denied (fail-closed)");
  } else {
    console.log("[AdminUI Auth] JWT verification active for /admin-ui");
  }
  console.log(`[AdminUI RateLimit] ${RATE_LIMIT_MAX} req/min per IP, cleanup every 60s`);

  const requestListener = (req, res) => {
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
    if (req.url.startsWith("/admin-ui")) {
      proxyAdminUI(req, res);
      return;
    }
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  };

  if (hasCert) {
    // Production: HTTP → HTTPS redirect
    const redirectListener = (req, res) => {
      const hostOnly = req.headers.host?.split(':')[0] || host;
      const httpsUrl = `https://${hostOnly}:${httpsPort}${req.url}`;
      res.writeHead(301, {
        Location: httpsUrl,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      });
      res.end();
    };

    httpCreateServer(redirectListener).listen(httpRedirectPort, host, (err) => {
      if (err) throw err;
      console.log(`> HTTP redirect → HTTPS on http://${host}:${httpRedirectPort}`);
    });

    const port80 = httpCreateServer(redirectListener);
    port80.on('error', () => console.log('> Port 80 redirect unavailable (need root)'));
    port80.listen(80, host, () => console.log(`> HTTP :80 → HTTPS :${httpsPort} redirect`));

    const httpsServer = createServer(
      { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) },
      requestListener
    );

    httpsServer.on("upgrade", (req, socket, head) => {
      app.getUpgradeHandler()(req, socket, head);
    });

    httpsServer.listen(httpsPort, host, (err) => {
      if (err) throw err;
      console.log(`> Next.js HTTPS server on https://${host}:${httpsPort}`);
    });
  } else {
    // Development: HTTP on fallback port (no SSL)
    httpCreateServer(requestListener).listen(devFallbackPort, host, (err) => {
      if (err) throw err;
      console.log(`> Next.js HTTP server on http://${host}:${devFallbackPort} (no SSL)`);
    });
  }
});