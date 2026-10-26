import { test, expect } from "@playwright/test";

const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });

test("health check responds without a token", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
});

test("a user can create and list their own notes", async ({ request }) => {
  const created = await request.post("/notes", { ...as("alice-token"), data: { text: "buy milk" } });
  expect(created.status()).toBe(201);

  const list = await request.get("/notes", as("alice-token"));
  const texts = (await list.json()).map((n) => n.text);
  expect(texts).toContain("buy milk");
});

test("a note without text is rejected", async ({ request }) => {
  const res = await request.post("/notes", { ...as("alice-token"), data: { text: "" } });
  expect(res.status()).toBe(400);
});

test("[INV:auth-required] [AC:ac_1] every endpoint except /health rejects missing, unknown and expired tokens", async ({ request }) => {
  const health = await request.get("/health");
  expect(health.status()).toBe(200);

  const badAuth = [
    { name: "missing", headers: {} },
    { name: "unknown", headers: { authorization: "Bearer not-a-real-token" } },
    { name: "expired", headers: { authorization: "Bearer expired-token" } },
  ];
  const calls = [
    (headers) => request.get("/notes", { headers }),
    (headers) => request.post("/notes", { headers, data: { text: "should not be stored" } }),
    (headers) => request.get("/audit", { headers }),
  ];

  for (const { name, headers } of badAuth) {
    for (const call of calls) {
      const res = await call(headers);
      expect(res.status(), `${name} token`).toBe(401);
    }
  }
});

test("[INV:user-isolation] [AC:ac_2] a user never sees another user's notes or audit entries", async ({ request }) => {
  const marker = `isolation-${Date.now()}`;
  const aliceNote = await (await request.post("/notes", { ...as("alice-token"), data: { text: `alice ${marker}` } })).json();
  const bobNote = await (await request.post("/notes", { ...as("bob-token"), data: { text: `bob ${marker}` } })).json();

  for (const [token, userId, otherNote] of [
    ["alice-token", "alice", bobNote],
    ["bob-token", "bob", aliceNote],
  ]) {
    const notes = await (await request.get("/notes", as(token))).json();
    expect(notes.every((n) => n.userId === userId)).toBe(true);
    expect(notes.map((n) => n.id)).not.toContain(otherNote.id);

    const audit = await (await request.get("/audit", as(token))).json();
    expect(audit.every((e) => e.userId === userId)).toBe(true);
    expect(audit.map((e) => e.noteId)).not.toContain(otherNote.id);
  }
});

test("[INV:audit-append-only] [AC:ac_3] audit entries can't be modified or deleted", async ({ request }) => {
  await request.post("/notes", { ...as("alice-token"), data: { text: "audit before" } });
  const before = await (await request.get("/audit", as("alice-token"))).json();
  expect(before.length).toBeGreaterThan(0);

  const target = before[0];
  for (const method of ["put", "patch", "delete"]) {
    for (const path of ["/audit", `/audit/${target.seq}`]) {
      const res = await request[method](path, { ...as("alice-token"), data: { action: "tampered" } });
      expect(res.status(), `${method.toUpperCase()} ${path}`).toBeGreaterThanOrEqual(400);
    }
  }

  await request.post("/notes", { ...as("alice-token"), data: { text: "audit after" } });
  const after = await (await request.get("/audit", as("alice-token"))).json();
  expect(after.length).toBeGreaterThan(before.length);
  expect(after.slice(0, before.length)).toEqual(before);
});

test("[INV:no-error-leak] [AC:ac_4] error responses never include stack traces or internal details", async ({ request }) => {
  const malformed = await request.post("/notes", {
    headers: { authorization: "Bearer alice-token", "content-type": "application/json" },
    data: Buffer.from("{not valid json"), // a Buffer is sent as-is; a string would be JSON-encoded
  });
  expect(malformed.status()).toBe(500);
  expect(await malformed.json()).toEqual({ error: "internal_error" });

  const errors = [
    malformed,
    await request.post("/notes", { ...as("alice-token"), data: { text: "" } }), // 400
    await request.get("/notes"), // 401
    await request.get("/does-not-exist", as("alice-token")), // 404
  ];
  expect(errors.map((r) => r.status())).toEqual([500, 400, 401, 404]);

  for (const res of errors) {
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error).toMatch(/^[a-z_]+$/);
    expect(raw).not.toMatch(/\bat\s.+:\d+|Error\b|stack|\/src\/|node:/);
  }
});
