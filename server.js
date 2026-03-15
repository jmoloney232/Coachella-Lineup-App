import { createHash, randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildLineupData, normalizeLookupValue } from "./src/lib/lineupData.js";

const scrypt = promisify(scryptCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const savedListsFile = path.join(dataDir, "saved-lists.json");
const authFile = path.join(dataDir, "auth.json");
const PORT = Number(process.env.PORT ?? 3001);
const SESSION_COOKIE_NAME = "coachella_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

const csvFiles = {
  coachella: path.join(publicDir, "coachella-2026-data.csv"),
  dolab: path.join(publicDir, "dolab-2026-data.csv"),
  quasar: path.join(publicDir, "quasar-2026-data.csv"),
};

let cachedData = null;
let cachedSignature = "";
let savedListsCache = null;
let authCache = null;

async function ensureJsonFile(filePath, fallback) {
  await mkdir(dataDir, { recursive: true });

  try {
    await stat(filePath);
  } catch {
    await writeFile(filePath, JSON.stringify(fallback, null, 2));
  }
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

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
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
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  return parts.join("; ");
}

function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(0).toUTCString()}`;
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

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derivedKey = await scrypt(password, salt, 64);
  return {
    salt,
    hash: Buffer.from(derivedKey).toString("hex"),
  };
}

async function verifyPassword(password, salt, expectedHash) {
  const derivedKey = await scrypt(password, salt, 64);
  const actualHash = Buffer.from(derivedKey).toString("hex");
  return actualHash === expectedHash;
}

async function loadSavedLists() {
  if (savedListsCache) {
    return savedListsCache;
  }

  await ensureJsonFile(savedListsFile, { users: {} });
  const content = await readFile(savedListsFile, "utf8");
  const parsed = JSON.parse(content || "{}");
  savedListsCache = {
    users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
  };
  return savedListsCache;
}

async function saveSavedLists(store) {
  savedListsCache = store;
  await ensureJsonFile(savedListsFile, { users: {} });
  await writeFile(savedListsFile, JSON.stringify(store, null, 2));
}

async function getSavedArtistIds(ownerId) {
  const store = await loadSavedLists();
  const artistIds = store.users[ownerId]?.artistIds;
  return Array.isArray(artistIds) ? artistIds : [];
}

async function updateSavedArtistIds(ownerId, artistIds) {
  const nextArtistIds = Array.from(new Set(artistIds.filter((value) => typeof value === "string" && value.length > 0)));
  const store = await loadSavedLists();
  store.users[ownerId] = {
    artistIds: nextArtistIds,
    updatedAt: new Date().toISOString(),
  };
  await saveSavedLists(store);
  return nextArtistIds;
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

async function loadAuthStore() {
  if (authCache) {
    return authCache;
  }

  await ensureJsonFile(authFile, { users: [], sessions: {} });
  const content = await readFile(authFile, "utf8");
  const parsed = JSON.parse(content || "{}");
  authCache = {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
  };
  return authCache;
}

async function saveAuthStore(store) {
  authCache = store;
  await ensureJsonFile(authFile, { users: [], sessions: {} });
  await writeFile(authFile, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

async function createUser(email, password) {
  const authStore = await loadAuthStore();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existingUser = authStore.users.find((user) => user.email === normalizedEmail);
  if (existingUser) {
    throw new Error("An account with that email already exists.");
  }

  const passwordRecord = await hashPassword(password);
  const user = {
    id: createAccountUserId(),
    email: normalizedEmail,
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
    createdAt: new Date().toISOString(),
  };

  authStore.users.push(user);
  await saveAuthStore(authStore);
  return user;
}

async function authenticateUser(email, password) {
  const authStore = await loadAuthStore();
  const normalizedEmail = normalizeEmail(email);
  const user = authStore.users.find((entry) => entry.email === normalizedEmail);

  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const isValid = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password.");
  }

  return user;
}

async function createSession(userId) {
  const authStore = await loadAuthStore();
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(sessionToken);
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  authStore.sessions[tokenHash] = {
    userId,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  await saveAuthStore(authStore);
  return {
    sessionToken,
    expiresAt,
  };
}

async function deleteSession(sessionToken) {
  if (!sessionToken) {
    return;
  }

  const authStore = await loadAuthStore();
  const tokenHash = hashToken(sessionToken);
  if (authStore.sessions[tokenHash]) {
    delete authStore.sessions[tokenHash];
    await saveAuthStore(authStore);
  }
}

async function getAuthenticatedUser(request) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  const authStore = await loadAuthStore();
  const tokenHash = hashToken(sessionToken);
  const session = authStore.sessions[tokenHash];

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    delete authStore.sessions[tokenHash];
    await saveAuthStore(authStore);
    return null;
  }

  const user = authStore.users.find((entry) => entry.id === session.userId);
  if (!user) {
    delete authStore.sessions[tokenHash];
    await saveAuthStore(authStore);
    return null;
  }

  return user;
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
    sendJson(response, 400, { error: "Missing request URL." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (!["GET", "POST", "PUT"].includes(request.method)) {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const data = await loadLineupData();
    const authenticatedUser = await getAuthenticatedUser(request);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        festivals: ["coachella", "dolab", "quasar"],
        artistCount: data.artists.length,
      });
      return;
    }

    if (url.pathname === "/api/auth/me") {
      sendJson(response, 200, {
        user: authenticatedUser ? publicUser(authenticatedUser) : null,
      });
      return;
    }

    if (url.pathname === "/api/auth/signup" && request.method === "POST") {
      const body = await readJsonBody(request);
      const user = await createUser(body.email ?? "", body.password ?? "");
      const session = await createSession(user.id);
      const guestUserId = body.guestUserId ?? "";

      if (validateGuestUserId(guestUserId)) {
        await mergeSavedArtistIds(guestUserId, user.id);
      }

      sendJson(
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
      const body = await readJsonBody(request);
      const user = await authenticateUser(body.email ?? "", body.password ?? "");
      const session = await createSession(user.id);
      const guestUserId = body.guestUserId ?? "";

      if (validateGuestUserId(guestUserId)) {
        await mergeSavedArtistIds(guestUserId, user.id);
      }

      sendJson(
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
      const cookies = parseCookies(request);
      await deleteSession(cookies[SESSION_COOKIE_NAME]);
      sendJson(
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
      sendJson(response, 200, {
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
      const ownerId = authenticatedUser?.id ?? (url.searchParams.get("userId") ?? "");

      if (!authenticatedUser && !validateGuestUserId(ownerId)) {
        sendJson(response, 400, { error: "A valid guest userId is required." });
        return;
      }

      if (request.method === "GET") {
        const artistIds = await getSavedArtistIds(ownerId);
        sendJson(response, 200, {
          ownerId,
          artistIds,
          count: artistIds.length,
          isAuthenticated: Boolean(authenticatedUser),
        });
        return;
      }

      const body = await readJsonBody(request);
      const artistIds = Array.isArray(body.artistIds) ? body.artistIds : null;
      if (!artistIds) {
        sendJson(response, 400, { error: "artistIds must be an array." });
        return;
      }

      const validArtistIds = new Set(data.artists.map((artist) => artist.id));
      const sanitizedArtistIds = artistIds.filter((artistId) => validArtistIds.has(artistId));
      const nextArtistIds = await updateSavedArtistIds(ownerId, sanitizedArtistIds);

      sendJson(response, 200, {
        ownerId,
        artistIds: nextArtistIds,
        count: nextArtistIds.length,
        isAuthenticated: Boolean(authenticatedUser),
      });
      return;
    }

    if (url.pathname.startsWith("/api/lineups/")) {
      const festival = url.pathname.split("/").pop();
      if (!festival || !data[festival]) {
        sendJson(response, 404, { error: "Lineup not found." });
        return;
      }

      sendJson(response, 200, {
        festival,
        artists: data[festival],
        count: data[festival].length,
      });
      return;
    }

    if (url.pathname === "/api/artists") {
      const artists = filterArtists(data.artists, url.searchParams);
      sendJson(response, 200, {
        count: artists.length,
        artists,
      });
      return;
    }

    if (url.pathname.startsWith("/api/artists/")) {
      const artistId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const artist = data.artists.find((entry) => entry.id === artistId);

      if (!artist) {
        sendJson(response, 404, { error: "Artist not found." });
        return;
      }

      sendJson(response, 200, artist);
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Coachella backend listening on http://localhost:${PORT}`);
});
