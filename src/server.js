import http from "node:http";

const PORT = Number(process.env.PORT ?? 4010);

// Demo tokens. "expired" is past its expiry so the 401 path can be tested.
const tokens = new Map([
  ["alice-token", { userId: "alice", expiresAt: Date.now() + 24 * 3600 * 1000 }],
  ["bob-token", { userId: "bob", expiresAt: Date.now() + 24 * 3600 * 1000 }],
  ["expired-token", { userId: "alice", expiresAt: Date.now() - 1000 }],
]);

const notes = []; // { id, userId, text, createdAt }
const auditLog = []; // append-only: { seq, userId, action, noteId, at }

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function authenticate(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const entry = token ? tokens.get(token) : null;
  if (!entry) return { error: "invalid_token" };
  if (entry.expiresAt < Date.now()) return { error: "token_expired" };
  return { userId: entry.userId };
}

function audit(userId, action, noteId) {
  auditLog.push({ seq: auditLog.length + 1, userId, action, noteId, at: new Date().toISOString() });
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true });
    }

    const auth = authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    if (req.method === "GET" && url.pathname === "/notes") {
      return send(res, 200, notes.filter((n) => n.userId === auth.userId));
    }

    if (req.method === "POST" && url.pathname === "/notes") {
      const body = await readJson(req);
      if (typeof body.text !== "string" || body.text.trim() === "") {
        return send(res, 400, { error: "text_required" });
      }
      const note = { id: notes.length + 1, userId: auth.userId, text: body.text, createdAt: new Date().toISOString() };
      notes.push(note);
      audit(auth.userId, "note.created", note.id);
      return send(res, 201, note);
    }

    if (req.method === "GET" && url.pathname === "/audit") {
      return send(res, 200, auditLog.filter((e) => e.userId === auth.userId));
    }

    send(res, 404, { error: "not_found" });
  } catch {
    // Never leak stack traces to clients.
    send(res, 500, { error: "internal_error" });
  }
});

server.listen(PORT, () => console.log(`planwright-demo listening on :${PORT}`));
