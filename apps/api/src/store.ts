import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
export type Grade = "again" | "good" | "easy";
export function schedule(grade: Grade, interval: number, now: number) {
  const days = Math.min(
    365,
    grade === "again"
      ? 0
      : grade === "good"
        ? Math.max(1, interval * 2)
        : Math.max(3, interval * 3),
  );
  return { interval: days, due: now + (days ? days * 86400000 : 600000) };
}
export function field(value: unknown, max: number, name: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export class Store {
  db: DatabaseSync;
  constructor(path = process.env.DB_PATH || "var/recalldeck.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS decks(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cards(id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE, front TEXT NOT NULL, back TEXT NOT NULL, due INTEGER NOT NULL, interval INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE, request_id TEXT NOT NULL, grade TEXT NOT NULL, reviewed_at INTEGER NOT NULL, due INTEGER NOT NULL, UNIQUE(user_id,request_id));
    CREATE INDEX IF NOT EXISTS decks_user ON decks(user_id); CREATE INDEX IF NOT EXISTS cards_deck_due ON cards(deck_id,due);`);
  }
  auth(body: any, signup: boolean) {
    const email = field(body.email, 254, "Email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException("Enter a valid email.");
    const password = field(body.password, 128, "Password");
    if (password.length < 10)
      throw new BadRequestException(
        "Use at least 10 characters for your password.",
      );
    let user = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email) as any;
    if (signup) {
      if (user)
        throw new ConflictException("This email is already registered.");
      const salt = randomBytes(16).toString("hex");
      const result = this.db
        .prepare("INSERT INTO users(email,hash,salt) VALUES(?,?,?)")
        .run(email, scryptSync(password, salt, 64).toString("hex"), salt);
      user = { id: Number(result.lastInsertRowid), email };
    } else if (
      !user ||
      !timingSafeEqual(
        Buffer.from(user.hash, "hex"),
        scryptSync(password, user.salt, 64),
      )
    )
      throw new UnauthorizedException("Invalid email or password.");
    const token = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(this.digest(token), user.id, Date.now() + 86400000);
    return { token, user: { id: user.id, email: user.email } };
  }
  digest(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
  user(token: string) {
    const u = this.db
      .prepare(
        "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      )
      .get(this.digest(token), Date.now());
    if (!u) throw new UnauthorizedException("Please sign in.");
    return u as { id: number; email: string };
  }
  deck(uid: number, id: number) {
    const d = this.db
      .prepare("SELECT * FROM decks WHERE id=? AND user_id=?")
      .get(id, uid);
    if (!d) throw new NotFoundException("Collection not found.");
    return d;
  }
  list(uid: number, now = Date.now()) {
    return this.db
      .prepare(
        `SELECT d.id,d.name,COUNT(c.id) AS total,COALESCE(SUM(CASE WHEN c.due<=? THEN 1 ELSE 0 END),0) AS due FROM decks d LEFT JOIN cards c ON c.deck_id=d.id WHERE d.user_id=? GROUP BY d.id ORDER BY d.id DESC`,
      )
      .all(now, uid);
  }
  cards(uid: number, id: number) {
    this.deck(uid, id);
    return this.db
      .prepare("SELECT * FROM cards WHERE deck_id=? ORDER BY due,id")
      .all(id);
  }
  createDeck(uid: number, body: any) {
    const name = field(body.name, 80, "Collection name");
    const r = this.db
      .prepare("INSERT INTO decks(user_id,name) VALUES(?,?)")
      .run(uid, name);
    return { id: Number(r.lastInsertRowid), name };
  }
  createCard(uid: number, id: number, body: any) {
    this.deck(uid, id);
    const front = field(body.front, 500, "Question"),
      back = field(body.back, 2000, "Answer");
    const r = this.db
      .prepare("INSERT INTO cards(deck_id,front,back,due) VALUES(?,?,?,?)")
      .run(id, front, back, Date.now());
    return { id: Number(r.lastInsertRowid) };
  }
  review(uid: number, id: number, body: any, now = Date.now()) {
    if (
      !["again", "good", "easy"].includes(body.grade) ||
      !Number.isSafeInteger(body.version) ||
      typeof body.requestId !== "string" ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)
    )
      throw new BadRequestException("Invalid review.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db
        .prepare("SELECT * FROM reviews WHERE user_id=? AND request_id=?")
        .get(uid, body.requestId) as any;
      if (old) {
        if (old.card_id !== id || old.grade !== body.grade)
          throw new ConflictException("Request ID already used.");
        this.db.exec("COMMIT");
        return { due: old.due, replayed: true };
      }
      const card = this.db
        .prepare(
          "SELECT c.* FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND d.user_id=?",
        )
        .get(id, uid) as any;
      if (!card) throw new NotFoundException("Card not found.");
      if (card.version !== body.version)
        throw new ConflictException("Card changed. Refresh your queue.");
      if (card.due > now)
        throw new ConflictException("This card is not due yet.");
      const next = schedule(body.grade, card.interval, now);
      this.db
        .prepare(
          "UPDATE cards SET due=?,interval=?,version=version+1 WHERE id=?",
        )
        .run(next.due, next.interval, id);
      this.db
        .prepare(
          "INSERT INTO reviews(user_id,card_id,request_id,grade,reviewed_at,due) VALUES(?,?,?,?,?,?)",
        )
        .run(uid, id, body.requestId, body.grade, now, next.due);
      this.db.exec("COMMIT");
      return next;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  stats(uid: number) {
    return this.db
      .prepare(
        "SELECT COUNT(*) AS reviews,COALESCE(SUM(CASE WHEN grade!='again' THEN 1 ELSE 0 END),0) AS recalled FROM reviews WHERE user_id=?",
      )
      .get(uid);
  }
}
