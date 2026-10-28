import { test, expect } from "@playwright/test";

const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });

async function createNote(request, token, text) {
  const res = await request.post("/notes", { ...as(token), data: { text } });
  expect(res.status()).toBe(201);
  return res.json();
}

const noteIds = async (request, token) => (await (await request.get("/notes", as(token))).json()).map((n) => n.id);
const auditOf = async (request, token) => (await request.get("/audit", as(token))).json();
// Other spec files may write audit entries concurrently, so compare only the entries for one note.
const auditFor = async (request, token, noteId) => (await auditOf(request, token)).filter((e) => e.noteId === noteId);

test("[AC:59033e6e:ac_1] a user can delete their own note", async ({ request }) => {
  const note = await createNote(request, "alice-token", "delete me");
  expect(await noteIds(request, "alice-token")).toContain(note.id);

  const res = await request.delete(`/notes/${note.id}`, as("alice-token"));
  expect(res.status()).toBe(204);
  expect(await res.text()).toBe("");
  expect(await noteIds(request, "alice-token")).not.toContain(note.id);
});

test("[INV:delete-audited] [AC:59033e6e:ac_2] deleting a note appends a note.deleted audit entry and keeps earlier entries", async ({ request }) => {
  const note = await createNote(request, "alice-token", "audited delete");
  const before = await auditOf(request, "alice-token");

  await request.delete(`/notes/${note.id}`, as("alice-token"));

  const after = await auditOf(request, "alice-token");
  expect(after.slice(0, before.length)).toEqual(before);

  const forNote = after.filter((e) => e.noteId === note.id);
  expect(forNote.map((e) => e.action)).toEqual(["note.created", "note.deleted"]);
  expect(forNote[1]).toMatchObject({ userId: "alice", action: "note.deleted", noteId: note.id });
});

test("[AC:59033e6e:ac_3] a user can't delete another user's note", async ({ request }) => {
  const note = await createNote(request, "alice-token", "alice only");
  const aliceAuditBefore = await auditFor(request, "alice-token", note.id);

  const res = await request.delete(`/notes/${note.id}`, as("bob-token"));
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });

  expect(await noteIds(request, "alice-token")).toContain(note.id);
  expect(await auditFor(request, "alice-token", note.id)).toEqual(aliceAuditBefore);
  expect(await auditFor(request, "bob-token", note.id)).toEqual([]);
});

test("[AC:59033e6e:ac_4] deleting a missing or non-numeric note id returns 404 not_found", async ({ request }) => {
  const note = await createNote(request, "alice-token", "deleted twice");
  await request.delete(`/notes/${note.id}`, as("alice-token"));

  for (const path of [`/notes/${note.id}`, "/notes/999999", "/notes/abc", "/notes/1.5"]) {
    const res = await request.delete(path, as("alice-token"));
    expect(res.status(), path).toBe(404);
    expect(await res.json(), path).toEqual({ error: "not_found" });
  }
});

test("[AC:59033e6e:ac_5] deleting without a valid token returns 401 and deletes nothing", async ({ request }) => {
  const note = await createNote(request, "alice-token", "protected");
  const auditBefore = await auditFor(request, "alice-token", note.id);

  for (const headers of [{}, { authorization: "Bearer not-a-real-token" }, { authorization: "Bearer expired-token" }]) {
    const res = await request.delete(`/notes/${note.id}`, { headers });
    expect(res.status()).toBe(401);
  }

  expect(await noteIds(request, "alice-token")).toContain(note.id);
  expect(await auditFor(request, "alice-token", note.id)).toEqual(auditBefore);
});
