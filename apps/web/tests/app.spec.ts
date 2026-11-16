import { test, expect } from "@playwright/test";
const password = "a-safe-test-password";
async function register(request: any) {
  const r = await request.post("/api/auth/signup", {
    data: {
      email: "learner." + crypto.randomUUID().slice(0, 8) + "@example.com",
      password,
    },
  });
  expect(r.ok()).toBeTruthy();
}
test("create collection, add card, reveal, review, reload and sign out", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill("learner." + crypto.randomUUID().slice(0, 8) + "@example.com");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account →" }).click();
  await expect(
    page.getByRole("heading", { name: "Your knowledge, growing." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ New collection" }).click();
  await page.getByLabel("Collection name").fill("TypeScript essentials");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page.getByRole("button", { name: /TypeScript essentials/ }).click();
  await page.getByRole("button", { name: "+ Add card" }).click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("What is a discriminated union?");
  await page
    .getByLabel("Answer", { exact: true })
    .fill("A union narrowed by a shared literal property.");
  await page.getByRole("button", { name: "Save card" }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".answer")).toHaveText(
    "A union narrowed by a shared literal property.",
  );
  await page.getByRole("button", { name: "Good 1 days" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".metrics")).toContainText("1");
  await page.getByRole("button", { name: /TypeScript essentials/ }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Create account →" }),
  ).toBeVisible();
});
test("HTTP authorization, cross-origin rejection and idempotent reviews", async ({
  request,
  playwright,
}) => {
  expect((await request.get("/api/decks")).status()).toBe(401);
  await register(request);
  const deck = await (
    await request.post("/api/decks", { data: { name: "Testing" } })
  ).json();
  const card = await (
    await request.post(`/api/decks/${deck.id}/cards`, {
      data: { front: "Question", back: "Answer" },
    })
  ).json();
  const other = await playwright.request.newContext({
    baseURL: "http://localhost:5178",
  });
  await register(other);
  expect((await other.get(`/api/decks/${deck.id}/cards`)).status()).toBe(404);
  expect(
    (
      await request.post("/api/decks", {
        headers: { Origin: "https://evil.example" },
        data: { name: "bad" },
      })
    ).status(),
  ).toBe(403);
  const body = { grade: "good", version: 0, requestId: crypto.randomUUID() };
  expect(
    (await request.post(`/api/cards/${card.id}/reviews`, { data: body })).ok(),
  ).toBeTruthy();
  const retry = await request.post(`/api/cards/${card.id}/reviews`, {
    data: body,
  });
  expect((await retry.json()).replayed).toBe(true);
  expect(await (await request.get("/api/stats")).json()).toEqual({
    reviews: 1,
    recalled: 1,
  });
  await other.dispose();
});
test("mobile forms remain usable with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
});
test("workspace screenshots with realistic learning collections", async ({
  page,
}) => {
  const request = page.request;
  await register(request);
  for (const name of [
    "TypeScript essentials",
    "System design notes",
    "Everyday Spanish",
  ]) {
    const d = await (
      await request.post("/api/decks", { data: { name } })
    ).json();
    for (const [front, back] of [
      [
        "What makes a useful flashcard?",
        "One focused question, one clear answer.",
      ],
      [
        "Why practice active recall?",
        "Retrieving an idea strengthens its memory.",
      ],
    ])
      await request.post(`/api/decks/${d.id}/cards`, { data: { front, back } });
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your knowledge, growing." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "docs/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: /TypeScript essentials/ }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.screenshot({ path: "docs/review.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
