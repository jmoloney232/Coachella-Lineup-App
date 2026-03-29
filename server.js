import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildLineupData, normalizeLookupValue } from "./src/lib/lineupData.js";

const scrypt = promisify(scryptCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const distDir = path.join(__dirname, "dist");
const dataDir = path.join(__dirname, "data");
const savedListsFile = path.join(dataDir, "saved-lists.json");
const authFile = path.join(dataDir, "auth.json");
const PORT = Number(process.env.PORT ?? 3001);
const SESSION_COOKIE_NAME = "coachella_session";
const GUEST_COOKIE_NAME = "coachella_guest";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_CLEANUP_INTERVAL_MS = 1000 * 60 * 15;
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 1000 * 60 * 15);
const AUTH_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 10);
const MAX_JSON_BODY_BYTES = 32 * 1024;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const csvFiles = {
  coachella: path.join(publicDir, "coachella-2026-data.csv"),
  dolab: path.join(publicDir, "dolab-2026-data.csv"),
  quasar: path.join(publicDir, "quasar-2026-data.csv"),
};

let cachedData = null;
let cachedSignature = "";
let setTimesCache = null;
let pool = null;
let bootstrapPromise = null;
const authRateLimitStore = new Map();

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  return readFile(envPath, "utf8")
    .then((content) => {
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          return;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
          return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");

        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      });
    })
    .catch(() => {});
}

await loadEnvFile();

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? "";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return null;
}

function assertTrustedOrigin(request) {
  const origin = request.headers.origin;

  // No Origin header — allow (same-origin in some browsers, non-browser clients)
  if (!origin) {
    return;
  }

  // Origin is in the explicit allowlist
  if (ALLOWED_ORIGINS.includes(origin)) {
    return;
  }

  // Allow same-origin: Origin matches the server's own Host header
  const host = request.headers.host;
  if (host && (origin === `http://${host}` || origin === `https://${host}`)) {
    return;
  }

  throw createHttpError(403, "Request origin is not allowed.");
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = statusCode >= 400 && statusCode < 500;
  return error;
}

function getErrorStatusCode(error) {
  return error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
}

function getClientErrorMessage(error, statusCode) {
  if (error instanceof Error && error.expose && statusCode >= 400 && statusCode < 500) {
    return error.message;
  }

  return statusCode >= 500 ? "Unexpected server error." : "Request failed.";
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw createHttpError(500, "DATABASE_URL is required. Copy .env.example to .env and paste your Neon connection string.");
  }

  pool = new Pool({
    connectionString,
    ssl: isProduction() ? { rejectUnauthorized: true } : false,
  });

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS saved_lists (
      owner_id TEXT PRIMARY KEY,
      artist_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      owner_id TEXT PRIMARY KEY,
      songs    JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function maybeMigrateLocalJsonData() {
  const migrationEnabled = process.env.AUTO_MIGRATE_LOCAL_JSON !== "false";
  if (!migrationEnabled) {
    return;
  }

  try {
    const authExists = await stat(authFile).then(() => true).catch(() => false);
    if (authExists) {
      const content = await readFile(authFile, "utf8");
      const authStore = JSON.parse(content || "{}");

      if (Array.isArray(authStore.users)) {
        for (const user of authStore.users) {
          await query(
            `
              INSERT INTO users (id, email, password_hash, password_salt, created_at)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                password_salt = EXCLUDED.password_salt;
            `,
            [user.id, user.email, user.passwordHash, user.passwordSalt, user.createdAt ?? new Date().toISOString()],
          );
        }
      }

      if (authStore.sessions && typeof authStore.sessions === "object") {
        for (const [tokenHash, session] of Object.entries(authStore.sessions)) {
          await query(
            `
              INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
              VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0))
              ON CONFLICT (token_hash) DO NOTHING;
            `,
            [tokenHash, session.userId, session.createdAt ?? new Date().toISOString(), session.expiresAt],
          );
        }
      }
    }

    const savedListsExist = await stat(savedListsFile).then(() => true).catch(() => false);
    if (savedListsExist) {
      const content = await readFile(savedListsFile, "utf8");
      const savedListsStore = JSON.parse(content || "{}");
      const users = savedListsStore.users && typeof savedListsStore.users === "object" ? savedListsStore.users : {};

      for (const [ownerId, savedList] of Object.entries(users)) {
        const artistIds = Array.isArray(savedList.artistIds) ? savedList.artistIds : [];
        await query(
          `
            INSERT INTO saved_lists (owner_id, artist_ids, updated_at)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (owner_id) DO UPDATE SET
              artist_ids = EXCLUDED.artist_ids,
              updated_at = EXCLUDED.updated_at;
          `,
          [ownerId, JSON.stringify(artistIds), savedList.updatedAt ?? new Date().toISOString()],
        );
      }
    }
  } catch (error) {
    console.error("Local JSON migration skipped:", error instanceof Error ? error.message : error);
  }
}

async function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initializeDatabase();
      await maybeMigrateLocalJsonData();
    })();
  }

  await bootstrapPromise;
}

async function loadLineupData() {
  const signatures = await Promise.all(
    Object.values(csvFiles).map(async (filePath) => {
      const details = await stat(filePath);
      return `${filePath}:${details.mtimeMs}`;
    }),
  );
  const nextSignature = signatures.join("|");

  if (cachedData && cachedSignature === nextSignature) {
    return cachedData;
  }

  const [coachellaCsv, dolabCsv, quasarCsv] = await Promise.all(
    Object.values(csvFiles).map((filePath) => readFile(filePath, "utf8")),
  );

  cachedData = buildLineupData({ coachellaCsv, dolabCsv, quasarCsv });
  cachedSignature = nextSignature;
  return cachedData;
}

function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(isProduction() ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

function sendJson(request, response, statusCode, payload, headers = {}) {
  const allowedOrigin = getAllowedOrigin(request);
  response.writeHead(statusCode, {
    ...(allowedOrigin
      ? {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        }
      : {}),
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...getSecurityHeaders(),
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw createHttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function parseCookies(request) {
  const header = request.headers.cookie ?? "";
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function buildSessionCookie(value, expiresAt) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (isProduction()) {
    // SameSite=None + Secure required for cross-origin cookie sending (static site + API on separate Render services)
    parts.push("SameSite=None");
    parts.push("Secure");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts.join("; ");
}

function buildGuestCookie(guestId) {
  const parts = [
    `${GUEST_COOKIE_NAME}=${encodeURIComponent(guestId)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
  ];

  if (isProduction()) {
    parts.push("SameSite=None");
    parts.push("Secure");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts.join("; ");
}

// Returns the authoritative guest owner ID for this browser session.
// If the browser already has a bound guest cookie, use it (ignores the URL param).
// If not, accepts the requested ID and issues a new cookie to bind it.
function resolveGuestOwner(request, requestedId) {
  const cookies = parseCookies(request);
  const cookieId = cookies[GUEST_COOKIE_NAME];
  if (typeof cookieId === "string" && validateGuestUserId(cookieId)) {
    return { ownerId: cookieId, newCookie: null };
  }
  if (validateGuestUserId(requestedId)) {
    return { ownerId: requestedId, newCookie: buildGuestCookie(requestedId) };
  }
  return { ownerId: null, newCookie: null };
}

function clearSessionCookie() {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    `Expires=${new Date(0).toUTCString()}`,
  ];

  if (isProduction()) {
    parts.push("SameSite=None");
    parts.push("Secure");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts.join("; ");
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function validateGuestUserId(userId) {
  return typeof userId === "string" && /^guest_[a-z0-9]{8,40}$/i.test(userId);
}

function createAccountUserId() {
  return `acct_${randomUUID().replace(/-/g, "")}`;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derivedKey = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return {
    salt,
    hash: Buffer.from(derivedKey).toString("hex"),
  };
}

async function verifyPassword(password, salt, expectedHash) {
  const derivedKey = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  const actualHash = Buffer.from(derivedKey);
  const storedHash = Buffer.from(expectedHash, "hex");
  if (actualHash.length !== storedHash.length) return false;
  return timingSafeEqual(actualHash, storedHash);
}

async function getSavedArtistIds(ownerId) {
  const result = await query("SELECT artist_ids FROM saved_lists WHERE owner_id = $1;", [ownerId]);
  if (result.rowCount === 0) {
    return [];
  }

  const artistIds = result.rows[0].artist_ids;
  return Array.isArray(artistIds) ? artistIds : [];
}

async function updateSavedArtistIds(ownerId, artistIds) {
  const nextArtistIds = Array.from(new Set(artistIds.filter((value) => typeof value === "string" && value.length > 0)));

  await query(
    `
      INSERT INTO saved_lists (owner_id, artist_ids, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (owner_id) DO UPDATE SET
        artist_ids = EXCLUDED.artist_ids,
        updated_at = NOW();
    `,
    [ownerId, JSON.stringify(nextArtistIds)],
  );

  return nextArtistIds;
}

async function getPlaylistSongs(ownerId) {
  const result = await query("SELECT songs FROM playlist_songs WHERE owner_id = $1;", [ownerId]);
  if (result.rowCount === 0) return [];
  const songs = result.rows[0].songs;
  return Array.isArray(songs) ? songs : [];
}

async function updatePlaylistSongs(ownerId, songs) {
  const seen = new Set();
  const nextSongs = songs.filter((song) => {
    if (!song || typeof song.songName !== "string" || typeof song.artistId !== "string") return false;
    const key = `${song.artistId}::${song.songName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await query(
    `
      INSERT INTO playlist_songs (owner_id, songs, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (owner_id) DO UPDATE SET
        songs = EXCLUDED.songs,
        updated_at = NOW();
    `,
    [ownerId, JSON.stringify(nextSongs)],
  );

  return nextSongs;
}

async function mergeSavedArtistIds(fromOwnerId, toOwnerId) {
  if (!fromOwnerId || fromOwnerId === toOwnerId) {
    return getSavedArtistIds(toOwnerId);
  }

  const [sourceIds, targetIds] = await Promise.all([getSavedArtistIds(fromOwnerId), getSavedArtistIds(toOwnerId)]);
  const mergedIds = Array.from(new Set([...targetIds, ...sourceIds]));
  await updateSavedArtistIds(toOwnerId, mergedIds);
  return mergedIds;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

async function createUser(email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw createHttpError(400, "Please enter a valid email address.");
  }

  if (password.length < 8) {
    throw createHttpError(400, "Password must be at least 8 characters.");
  }

  const existingUser = await query("SELECT id FROM users WHERE email = $1;", [normalizedEmail]);
  if (existingUser.rowCount > 0) {
    throw createHttpError(409, "An account with that email already exists.");
  }

  const passwordRecord = await hashPassword(password);
  const user = {
    id: createAccountUserId(),
    email: normalizedEmail,
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
  };

  const result = await query(
    `
      INSERT INTO users (id, email, password_hash, password_salt)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, created_at;
    `,
    [user.id, user.email, user.passwordHash, user.passwordSalt],
  );

  return result.rows[0];
}

async function authenticateUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const result = await query("SELECT * FROM users WHERE email = $1 LIMIT 1;", [normalizedEmail]);
  const user = result.rows[0];

  if (!user) {
    throw createHttpError(401, "Invalid email or password.");
  }

  const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!isValid) {
    throw createHttpError(401, "Invalid email or password.");
  }

  return user;
}

async function createSession(userId) {
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(sessionToken);
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  await query(
    `
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0));
    `,
    [tokenHash, userId, expiresAt],
  );

  return {
    sessionToken,
    expiresAt,
  };
}

async function deleteSession(sessionToken) {
  if (!sessionToken) {
    return;
  }

  await query("DELETE FROM sessions WHERE token_hash = $1;", [hashToken(sessionToken)]);
}

async function deleteExpiredSessions() {
  await query("DELETE FROM sessions WHERE expires_at <= NOW();");
}

async function getAuthenticatedUser(request) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  const result = await query(
    `
      SELECT users.id, users.email, users.created_at, sessions.expires_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1
      LIMIT 1;
    `,
    [hashToken(sessionToken)],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (Date.now() > new Date(row.expires_at).getTime()) {
    await deleteSession(sessionToken);
    return null;
  }

  return row;
}

function getClientIp(request) {
  if (process.env.TRUST_PROXY === "true") {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
      return forwardedFor.split(",")[0].trim();
    }
  }

  return request.socket.remoteAddress ?? "unknown";
}

function pruneRateLimitStore(now = Date.now()) {
  for (const [key, entry] of authRateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      authRateLimitStore.delete(key);
    }
  }
}

function consumeAuthRateLimit(request, routeKey) {
  const now = Date.now();
  pruneRateLimitStore(now);

  const clientKey = `${routeKey}:${getClientIp(request)}`;
  const existingEntry = authRateLimitStore.get(clientKey);

  if (!existingEntry || existingEntry.resetAt <= now) {
    authRateLimitStore.set(clientKey, {
      count: 1,
      resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }

  existingEntry.count += 1;
  authRateLimitStore.set(clientKey, existingEntry);

  if (existingEntry.count > AUTH_RATE_LIMIT_MAX_REQUESTS) {
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((existingEntry.resetAt - now) / 1000)),
    };
  }

  return null;
}

function parseTimeToMinutes(timeStr) {
  const [time, period] = timeStr.trim().split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const total = hours * 60 + minutes;
  // Post-midnight AM slots (e.g. 1:00 AM = 25th hour on the timeline)
  if (period === "AM" && hours < 6) return total + 1440;
  return total;
}

async function loadSetTimesData() {
  if (setTimesCache) return setTimesCache;
  const csvPath = path.join(__dirname, "public", "set-times-2026.csv");
  const text = await readFile(csvPath, "utf8");
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  setTimesCache = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return {
      day: row.Day,
      stage: row.Stage,
      artist: row.Artist,
      startMinutes: parseTimeToMinutes(row.Start_Time),
      endMinutes: parseTimeToMinutes(row.End_Time),
      startTime: row.Start_Time,
      endTime: row.End_Time,
    };
  });
  return setTimesCache;
}

function filterArtists(artists, searchParams) {
  const q = normalizeLookupValue(searchParams.get("q") ?? "");
  const festival = searchParams.get("festival") ?? "";
  const day = searchParams.get("day") ?? "";
  const weekend = searchParams.get("weekend") ?? "";
  const limit = Number(searchParams.get("limit") ?? "0");

  let filtered = artists;

  if (festival) {
    filtered = filtered.filter((artist) => artist.festival === festival);
  }

  if (day) {
    filtered = filtered.filter((artist) => artist.day === day);
  }

  if (weekend) {
    filtered = filtered.filter((artist) => artist.weekend === weekend);
  }

  if (q) {
    filtered = filtered.filter((artist) => {
      const haystacks = [
        artist.artist,
        artist.genre,
        artist.note,
        ...(artist.relatedArtistsList ?? []),
        ...(artist.popularSongsList ?? []),
        ...(artist.songsList ?? []),
      ];

      return haystacks.some((value) => normalizeLookupValue(value).includes(q));
    });
  }

  if (limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(request, response, 400, { error: "Missing request URL." });
    return;
  }

  if (request.method === "OPTIONS") {
    const allowedOrigin = getAllowedOrigin(request);
    response.writeHead(204, {
      ...(allowedOrigin
        ? {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Credentials": "true",
            Vary: "Origin",
          }
        : {}),
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (!["GET", "POST", "PUT"].includes(request.method)) {
    sendJson(request, response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    await bootstrapDatabase();

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const data = await loadLineupData();
    const authenticatedUser = await getAuthenticatedUser(request);

    if (url.pathname === "/api/health") {
      sendJson(request, response, 200, {
        ok: true,
        festivals: ["coachella", "dolab", "quasar"],
        artistCount: data.artists.length,
        database: "neon",
      });
      return;
    }

    if (url.pathname === "/api/auth/me") {
      sendJson(request, response, 200, {
        user: authenticatedUser ? publicUser(authenticatedUser) : null,
      });
      return;
    }

    if (url.pathname === "/api/auth/signup" && request.method === "POST") {
      assertTrustedOrigin(request);

      const rateLimit = consumeAuthRateLimit(request, "signup");
      if (rateLimit) {
        sendJson(
          request,
          response,
          429,
          { error: "Too many signup attempts. Please try again later." },
          { "Retry-After": String(rateLimit.retryAfterSeconds) },
        );
        return;
      }

      const body = await readJsonBody(request);
      const user = await createUser(body.email ?? "", body.password ?? "");
      const session = await createSession(user.id);
      const guestUserId = body.guestUserId ?? "";

      if (validateGuestUserId(guestUserId)) {
        await mergeSavedArtistIds(guestUserId, user.id);
      }

      sendJson(
        request,
        response,
        201,
        {
          user: publicUser(user),
        },
        {
          "Set-Cookie": buildSessionCookie(session.sessionToken, session.expiresAt),
        },
      );
      return;
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      assertTrustedOrigin(request);

      const rateLimit = consumeAuthRateLimit(request, "login");
      if (rateLimit) {
        sendJson(
          request,
          response,
          429,
          { error: "Too many login attempts. Please try again later." },
          { "Retry-After": String(rateLimit.retryAfterSeconds) },
        );
        return;
      }

      const body = await readJsonBody(request);
      const user = await authenticateUser(body.email ?? "", body.password ?? "");
      const session = await createSession(user.id);
      const guestUserId = body.guestUserId ?? "";

      if (validateGuestUserId(guestUserId)) {
        await mergeSavedArtistIds(guestUserId, user.id);
      }

      sendJson(
        request,
        response,
        200,
        {
          user: publicUser(user),
        },
        {
          "Set-Cookie": buildSessionCookie(session.sessionToken, session.expiresAt),
        },
      );
      return;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      assertTrustedOrigin(request);

      const cookies = parseCookies(request);
      await deleteSession(cookies[SESSION_COOKIE_NAME]);
      sendJson(
        request,
        response,
        200,
        { ok: true },
        {
          "Set-Cookie": clearSessionCookie(),
        },
      );
      return;
    }

    if (url.pathname === "/api/lineups") {
      sendJson(request, response, 200, {
        coachella: data.coachella,
        dolab: data.dolab,
        quasar: data.quasar,
        meta: {
          totalArtists: data.artists.length,
          generatedFrom: Object.keys(csvFiles),
        },
      });
      return;
    }

    if (url.pathname === "/api/my-list") {
      let ownerId, guestCookie;
      if (authenticatedUser) {
        ownerId = authenticatedUser.id;
        guestCookie = null;
      } else {
        const resolved = resolveGuestOwner(request, url.searchParams.get("userId") ?? "");
        if (!resolved.ownerId) {
          sendJson(request, response, 400, { error: "A valid guest userId is required." });
          return;
        }
        ownerId = resolved.ownerId;
        guestCookie = resolved.newCookie;
      }

      if (request.method === "GET") {
        const artistIds = await getSavedArtistIds(ownerId);
        sendJson(request, response, 200, {
          ownerId,
          artistIds,
          count: artistIds.length,
          isAuthenticated: Boolean(authenticatedUser),
        }, guestCookie ? { "Set-Cookie": guestCookie } : {});
        return;
      }

      assertTrustedOrigin(request);

      const body = await readJsonBody(request);
      const artistIds = Array.isArray(body.artistIds) ? body.artistIds : null;
      if (!artistIds) {
        sendJson(request, response, 400, { error: "artistIds must be an array." });
        return;
      }
      if (artistIds.length > 500) {
        sendJson(request, response, 400, { error: "artistIds array exceeds maximum length of 500." });
        return;
      }

      const validArtistIds = new Set(data.artists.map((artist) => artist.id));
      const sanitizedArtistIds = artistIds.filter((artistId) => validArtistIds.has(artistId));
      const nextArtistIds = await updateSavedArtistIds(ownerId, sanitizedArtistIds);

      sendJson(request, response, 200, {
        ownerId,
        artistIds: nextArtistIds,
        count: nextArtistIds.length,
        isAuthenticated: Boolean(authenticatedUser),
      }, guestCookie ? { "Set-Cookie": guestCookie } : {});
      return;
    }

    if (url.pathname.startsWith("/api/lineups/")) {
      const festival = url.pathname.split("/").pop();
      if (!festival || !data[festival]) {
        sendJson(request, response, 404, { error: "Lineup not found." });
        return;
      }

      sendJson(request, response, 200, {
        festival,
        artists: data[festival],
        count: data[festival].length,
      });
      return;
    }

    if (url.pathname === "/api/artists") {
      const artists = filterArtists(data.artists, url.searchParams);
      sendJson(request, response, 200, {
        count: artists.length,
        artists,
      });
      return;
    }

    if (url.pathname.startsWith("/api/artists/")) {
      const artistId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const artist = data.artists.find((entry) => entry.id === artistId);

      if (!artist) {
        sendJson(request, response, 404, { error: "Artist not found." });
        return;
      }

      sendJson(request, response, 200, artist);
      return;
    }

    if (url.pathname === "/api/playlist") {
      let ownerId, guestCookie;
      if (authenticatedUser) {
        ownerId = authenticatedUser.id;
        guestCookie = null;
      } else {
        const resolved = resolveGuestOwner(request, url.searchParams.get("userId") ?? "");
        if (!resolved.ownerId) {
          sendJson(request, response, 400, { error: "A valid guest userId is required." });
          return;
        }
        ownerId = resolved.ownerId;
        guestCookie = resolved.newCookie;
      }

      if (request.method === "GET") {
        const songs = await getPlaylistSongs(ownerId);
        sendJson(request, response, 200, { ownerId, songs, count: songs.length }, guestCookie ? { "Set-Cookie": guestCookie } : {});
        return;
      }

      assertTrustedOrigin(request);

      const body = await readJsonBody(request);
      const songs = Array.isArray(body.songs) ? body.songs : null;
      if (!songs) {
        sendJson(request, response, 400, { error: "songs must be an array." });
        return;
      }
      if (songs.length > 2000) {
        sendJson(request, response, 400, { error: "songs array exceeds maximum length of 2000." });
        return;
      }

      const nextSongs = await updatePlaylistSongs(ownerId, songs);
      sendJson(request, response, 200, { ownerId, songs: nextSongs, count: nextSongs.length }, guestCookie ? { "Set-Cookie": guestCookie } : {});
      return;
    }

    if (url.pathname === "/api/playlist/export.csv") {
      let ownerId, guestCookie;
      if (authenticatedUser) {
        ownerId = authenticatedUser.id;
        guestCookie = null;
      } else {
        const resolved = resolveGuestOwner(request, url.searchParams.get("userId") ?? "");
        if (!resolved.ownerId) {
          sendJson(request, response, 400, { error: "A valid guest userId is required." });
          return;
        }
        ownerId = resolved.ownerId;
        guestCookie = resolved.newCookie;
      }

      const songs = await getPlaylistSongs(ownerId);
      const csvRows = ["song_name,artist,day"];
      for (const song of songs) {
        const row = [song.songName, song.artistName, song.day]
          .map((field) => {
            const str = String(field ?? "");
            const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
            return `"${safe.replace(/"/g, '""')}"`;
          })
          .join(",");
        csvRows.push(row);
      }

      const allowedOrigin = getAllowedOrigin(request);
      response.writeHead(200, {
        ...(allowedOrigin
          ? { "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" }
          : {}),
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="coachella-playlist.csv"',
        "Cache-Control": "no-store",
        ...getSecurityHeaders(),
        ...(guestCookie ? { "Set-Cookie": guestCookie } : {}),
      });
      response.end(csvRows.join("\n"));
      return;
    }

    if (url.pathname === "/api/set-times") {
      const sets = await loadSetTimesData();
      sendJson(request, response, 200, { sets });
      return;
    }

    // Serve static frontend files (SPA fallback)
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
    };

    const urlPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(distDir, "." + urlPath);

    // Security: prevent path traversal outside dist
    if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
      sendJson(request, response, 400, { error: "Invalid path." });
      return;
    }

    const serveFile = async (fp) => {
      const fileStats = await stat(fp).catch(() => null);
      if (!fileStats?.isFile()) return false;
      const ext = path.extname(fp).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      const isImmutable = fp.includes(`${path.sep}assets${path.sep}`);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": isImmutable ? "public, max-age=31536000, immutable" : "no-cache",
        ...getSecurityHeaders(),
      });
      createReadStream(fp).pipe(response);
      return true;
    };

    if (!(await serveFile(filePath))) {
      // SPA fallback: unknown paths → index.html
      if (!(await serveFile(path.join(distDir, "index.html")))) {
        sendJson(request, response, 404, { error: "Not found." });
      }
    }
  } catch (error) {
    const statusCode = getErrorStatusCode(error);
    if (statusCode >= 500) {
      console.error("Request failed:", error);
    }

    sendJson(request, response, statusCode, {
      error: getClientErrorMessage(error, statusCode),
    });
  }
});

await bootstrapDatabase();
await deleteExpiredSessions();

setInterval(() => {
  deleteExpiredSessions().catch((error) => {
    console.error("Session cleanup failed:", error instanceof Error ? error.message : error);
  });
}, SESSION_CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Coachella backend listening on http://localhost:${PORT}`);
});
