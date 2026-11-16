import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, schedule } from "../src/store";
function setup() {
  const s = new Store(":memory:");
  const a = s.auth(
    { email: "a@example.com", password: "a-strong-password" },
    true,
  );
  const b = s.auth(
    { email: "b@example.com", password: "b-strong-password" },
    true,
  );
  const d = s.createDeck(a.user.id, { name: "TypeScript" });
  const c = s.createCard(a.user.id, d.id, {
    front: "What is unknown?",
    back: "A type-safe counterpart to any.",
  });
  return { s, a, b, d, c };
}
test("scheduler uses explicit bounded rules and deterministic time", () => {
  assert.deepEqual(schedule("again", 5, 1000), { interval: 0, due: 601000 });
  assert.deepEqual(schedule("good", 0, 0), { interval: 1, due: 86400000 });
  assert.equal(schedule("easy", 3, 0).interval, 9);
});
test("sign-in verifies password and sessions store only token digests", () => {
  const { s, a } = setup();
  assert.equal(s.user(a.token).email, "a@example.com");
  assert.throws(() =>
    s.auth({ email: "a@example.com", password: "wrong-password" }, false),
  );
  assert.throws(() => s.user("bad"));
  assert.equal(
    (
      s.db
        .prepare("SELECT token FROM sessions WHERE user_id=?")
        .get(a.user.id) as any
    ).token,
    s.digest(a.token),
  );
  s.db.close();
});
test("accounts cannot list, add to, or review another account collection", () => {
  const { s, a, b, d, c } = setup();
  assert.equal(s.list(b.user.id).length, 0);
  assert.throws(() => s.cards(b.user.id, d.id));
  assert.throws(() => s.createCard(b.user.id, d.id, { front: "x", back: "y" }));
  assert.throws(() =>
    s.review(b.user.id, c.id, {
      grade: "good",
      version: 0,
      requestId: "other-account",
    }),
  );
  s.db.close();
});
test("duplicate review is idempotent and conflicting reuse rejected", () => {
  const { s, a, c } = setup();
  const now = Date.now() + 1;
  const body = { grade: "good", version: 0, requestId: "unique-request" };
  const first = s.review(a.user.id, c.id, body, now);
  assert.equal(s.review(a.user.id, c.id, body, now).due, first.due);
  assert.equal((s.stats(a.user.id) as any).reviews, 1);
  assert.throws(() =>
    s.review(a.user.id, c.id, { ...body, grade: "easy" }, now),
  );
  s.db.close();
});
test("stale versions and premature reviews cannot alter scheduling", () => {
  const { s, a, d, c } = setup();
  const now = Date.now() + 1;
  s.review(
    a.user.id,
    c.id,
    { grade: "good", version: 0, requestId: "request-one" },
    now,
  );
  assert.throws(() =>
    s.review(
      a.user.id,
      c.id,
      { grade: "easy", version: 0, requestId: "request-two" },
      now,
    ),
  );
  assert.throws(() =>
    s.review(
      a.user.id,
      c.id,
      { grade: "easy", version: 1, requestId: "request-three" },
      now,
    ),
  );
  assert.equal((s.cards(a.user.id, d.id)[0] as any).version, 1);
  assert.equal((s.stats(a.user.id) as any).reviews, 1);
  s.db.close();
});
test("failed review transaction releases lock and allows subsequent valid review", () => {
  const { s, a, c } = setup();
  assert.throws(() =>
    s.review(a.user.id, 999, {
      grade: "good",
      version: 0,
      requestId: "invalid-card",
    }),
  );
  assert.doesNotThrow(() =>
    s.review(
      a.user.id,
      c.id,
      { grade: "again", version: 0, requestId: "valid-card" },
      Date.now() + 1,
    ),
  );
  s.db.close();
});
test("validation rejects blank cards, oversized inputs, weak passwords and invalid grades", () => {
  const { s, a, d, c } = setup();
  assert.throws(() => s.createCard(a.user.id, d.id, { front: " ", back: "x" }));
  assert.throws(() => s.createDeck(a.user.id, { name: "x".repeat(81) }));
  assert.throws(() =>
    s.auth({ email: "invalid", password: "long-password" }, true),
  );
  assert.throws(() =>
    s.auth({ email: "c@example.com", password: "short" }, true),
  );
  assert.throws(() =>
    s.review(a.user.id, c.id, {
      grade: "invalid",
      version: 0,
      requestId: "test-request",
    }),
  );
  s.db.close();
});
test("session expiration is enforced", () => {
  const { s, a } = setup();
  s.db.prepare("UPDATE sessions SET expires=0 WHERE user_id=?").run(a.user.id);
  assert.throws(() => s.user(a.token));
  s.db.close();
});

test("SQLite data and session authentication survive reopening the store", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const folder = mkdtempSync(join(tmpdir(), "recalldeck-"));
  try {
    const path = join(folder, "test.sqlite");
    const first = new Store(path);
    const account = first.auth(
      { email: "persist@example.com", password: "a-persistent-password" },
      true,
    );
    first.createDeck(account.user.id, { name: "Persistent collection" });
    first.db.close();
    const second = new Store(path);
    assert.equal(second.user(account.token).id, account.user.id);
    assert.equal(second.list(account.user.id).length, 1);
    second.db.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
