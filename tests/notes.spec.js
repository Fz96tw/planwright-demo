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

test("requests without a token are rejected", async ({ request }) => {
  const res = await request.get("/notes");
  expect(res.status()).toBe(401);
});
