import { Component, signal, computed } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
interface Deck {
  id: number;
  name: string;
  total: number;
  due: number;
}
interface Card {
  id: number;
  front: string;
  back: string;
  due: number;
  interval: number;
  version: number;
}
@Component({
  selector: "app-root",
  standalone: true,
  template: `
    @if (!user()) {
      <main class="entry">
        <section class="intro">
          <a class="brand" href="/">◈ RecallDeck</a>
          <div class="eyebrow">A LITTLE EVERY DAY. A LOT OVER TIME.</div>
          <h1>Make room for<br /><em>what you know.</em></h1>
          <p>
            Turn interesting ideas into lasting knowledge. Build your
            collection, practice recall, and come back at the right time.
          </p>
          <div class="sample">
            <span>YOUR NEXT SMALL WIN</span>
            <h3>Why does spaced repetition work?</h3>
            <p>
              Revisiting knowledge just before you forget strengthens long-term
              memory.
            </p>
            <b>01 / COLLECT &nbsp; 02 / RECALL &nbsp; 03 / REPEAT</b>
          </div>
        </section>
        <section class="auth panel">
          <div class="eyebrow">YOUR PERSONAL STUDY SPACE</div>
          <h2>{{ signup() ? "Start a learning habit." : "Welcome back." }}</h2>
          <p>
            {{
              signup()
                ? "Create an account to save your collections."
                : "Your next review is waiting for you."
            }}
          </p>
          <form (submit)="authenticate($event)">
            <label
              >Email<input
                name="email"
                type="email"
                autocomplete="email"
                required
                placeholder="you@example.com" /></label
            ><label
              >Password<input
                name="password"
                type="password"
                [attr.autocomplete]="
                  signup() ? 'new-password' : 'current-password'
                "
                minlength="10"
                maxlength="128"
                required
                placeholder="At least 10 characters" /></label
            ><button class="primary wide" [disabled]="busy()">
              {{
                busy()
                  ? "Please wait…"
                  : signup()
                    ? "Create account →"
                    : "Sign in →"
              }}
            </button>
          </form>
          <button class="text" (click)="signup.set(!signup())">
            {{
              signup()
                ? "Already have an account? Sign in"
                : "New here? Create an account"
            }}
          </button>
          <p class="fine">Your cards stay private to your account.</p>
        </section>
      </main>
    } @else {
      <div class="layout">
        <aside>
          <a class="brand" href="/">◈ RecallDeck</a>
          <p class="nav-label">YOUR WORKSPACE</p>
          <button class="nav active" (click)="home()">
            ▦ &nbsp; My collections
          </button>
          <div class="aside-bottom">
            <span>{{ user().email }}</span><button
              class="text"
              (click)="logout()"
            >
              Sign out
            </button>
          </div>
        </aside>
        <main class="workspace">
          <header>
            <span
              >PERSONAL LEARNING /
              {{ selected() ? selected()!.name : "OVERVIEW" }}</span
            ><span class="pill">● &nbsp; One review at a time</span>
          </header>
          <div class="page-heading">
            <div class="eyebrow">BUILD A LITTLE MOMENTUM</div>
            <h1>
              {{ selected() ? selected()!.name : "Your knowledge, growing." }}
            </h1>
            <p>
              {{
                selected()
                  ? "Practice what matters. Let the next review take care of itself."
                  : "A home for the things you want to remember."
              }}
            </p>
          </div>
          <section class="metrics">
            <div>
              <span>READY TO REVIEW</span
              ><strong>{{ dueCount() }} <small>cards</small></strong>
            </div>
            <div>
              <span>COLLECTIONS</span
              ><strong
                >{{ decks().length }} <small>in your library</small></strong
              >
            </div>
            <div>
              <span>REVIEWS COMPLETED</span
              ><strong
                >{{ stats().reviews }}
                <small>moments of progress</small></strong
              >
            </div>
          </section>
          @if (!selected()) {
            <section class="section-heading">
              <h2>
                Your collections <span>{{ decks().length }}</span>
              </h2>
              <button class="primary" (click)="newDeck.set(!newDeck())">
                + New collection
              </button>
            </section>
            @if (newDeck()) {
              <form class="inline-form panel" (submit)="addDeck($event)">
                <label
                  >Collection name<input
                    name="name"
                    maxlength="80"
                    required
                    placeholder="e.g. TypeScript essentials" /></label
                ><button class="primary" [disabled]="busy()">
                  Create collection
                </button>
              </form>
            }
            <section class="deck-grid">
              @for (deck of decks(); track deck.id) {
                <button class="deck panel" (click)="open(deck)">
                  <div class="deck-top">
                    <span class="deck-icon">▤</span
                    ><span class="badge">{{
                      deck.due ? deck.due + " ready" : "All caught up"
                    }}</span>
                  </div>
                  <h3>{{ deck.name }}</h3>
                  <p>
                    {{ deck.total }}
                    {{ deck.total === 1 ? "card" : "cards" }} in this collection
                  </p>
                  <div class="deck-footer">
                    {{ deck.due ? "Start a review" : "Open collection" }}
                    <span>+</span>
                  </div>
                </button>
              } @empty {
                <div class="empty panel">
                  <span class="empty-icon">✧</span>
                  <h3>Big ideas start with one card.</h3>
                  <p>
                    Create your first collection. Add a question and an answer,
                    then put your memory to work.
                  </p>
                </div>
              }
            </section>
            <section class="tip">
              <span>+</span>
              <div>
                <h3>Small sessions. Lasting knowledge.</h3>
                <p>
                  Try answering before revealing. The effort of remembering is
                  part of learning.
                </p>
              </div>
            </section>
          } @else {
            <section class="section-heading">
              <button class="text" (click)="home()">← All collections</button
              ><button class="primary" (click)="adding.set(!adding())">
                + Add card
              </button>
            </section>
            @if (adding()) {
              <form class="panel card-form" (submit)="addCard($event)">
                <h2>A new piece of knowledge</h2>
                <label
                  >Question<textarea
                    name="front"
                    required
                    maxlength="500"
                    placeholder="What do you want to remember?"
                  ></textarea></label
                ><label
                  >Answer<textarea
                    name="back"
                    required
                    maxlength="2000"
                    placeholder="Keep it clear and focused."
                  ></textarea></label
                ><button class="primary" [disabled]="busy()">Save card</button>
              </form>
            }
            @if (current(); as card) {
              <section class="review panel">
                <div class="eyebrow">
                  REVIEW QUEUE · {{ queue().length }} READY
                </div>
                <h2>{{ card.front }}</h2>
                @if (revealed()) {
                  <div class="answer">{{ card.back }}</div>
                  <p class="fine">How well did you remember?</p>
                  <div class="grades">
                    <button (click)="review('again')" [disabled]="busy()">
                      Again<small>10 minutes</small></button
                    ><button (click)="review('good')" [disabled]="busy()">
                      Good<small
                        >{{
                          Math.min(365, Math.max(1, card.interval * 2))
                        }}
                        days</small
                      ></button
                    ><button (click)="review('easy')" [disabled]="busy()">
                      Easy<small
                        >{{
                          Math.min(365, Math.max(3, card.interval * 3))
                        }}
                        days</small
                      >
                    </button>
                  </div>
                } @else {
                  <p>Take a moment. Try to recall the answer.</p>
                  <button class="primary" (click)="revealed.set(true)">
                    Reveal answer
                  </button>
                }
              </section>
            } @else {
              <section class="empty panel">
                <span class="empty-icon">✓</span>
                <h2>
                  {{
                    cards().length
                      ? "You’re all caught up."
                      : "Your first card is waiting to happen."
                  }}
                </h2>
                <p>
                  {{
                    cards().length
                      ? "Come back when your next review is due."
                      : "Add a question and answer to begin."
                  }}
                </p>
              </section>
            }
            <h2 class="library-title">
              Card library <span>{{ cards().length }}</span>
            </h2>
            <div class="card-library">
              @for (card of cards(); track card.id) {
                <details class="panel">
                  <summary>
                    {{ card.front
                    }}<small>{{
                      card.due <= now()
                        ? "Ready now"
                        : "Next: " + date(card.due)
                    }}</small>
                  </summary>
                  <p>{{ card.back }}</p>
                </details>
              }
            </div>
          }
          <footer>
            Made for curiosity. Built for consistency.
            <span>RecallDeck / 01</span>
          </footer>
        </main>
      </div>
    }
    @if (error()) {
      <div class="toast error" role="alert">
        {{ error()
        }}<button aria-label="Dismiss error" (click)="error.set('')">×</button>
      </div>
    }
    @if (notice()) {
      <div class="toast" role="status">{{ notice() }}</div>
    }
  `,
})
class App {
  Math = Math;
  user = signal<any>(null);
  signup = signal(true);
  busy = signal(false);
  error = signal("");
  notice = signal("");
  decks = signal<Deck[]>([]);
  stats = signal({ reviews: 0, recalled: 0 });
  selected = signal<Deck | null>(null);
  cards = signal<Card[]>([]);
  newDeck = signal(false);
  adding = signal(false);
  revealed = signal(false);
  now = signal(Date.now());
  dueCount = computed(() => this.decks().reduce((s, d) => s + d.due, 0));
  queue = computed(() => this.cards().filter((c) => c.due <= this.now()));
  current = computed(() => this.queue()[0]);
  constructor() {
    this.api("/me")
      .then((u) => {
        this.user.set(u);
        this.refresh();
      })
      .catch(() => {});
    setInterval(() => this.now.set(Date.now()), 30000);
  }
  async api(path: string, body?: any) {
    const r = await fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) this.user.set(null);
      throw new Error(data.message || "Request failed.");
    }
    return data;
  }
  async task(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  form(e: Event) {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.target as HTMLFormElement));
  }
  authenticate(e: Event) {
    const b = this.form(e);
    this.task(async () => {
      this.user.set(
        await this.api("/auth/" + (this.signup() ? "signup" : "login"), b),
      );
      await this.refresh();
    });
  }
  async refresh() {
    const [decks, stats] = await Promise.all([
      this.api("/decks"),
      this.api("/stats"),
    ]);
    this.decks.set(decks);
    this.stats.set(stats);
    this.now.set(Date.now());
  }
  home() {
    this.selected.set(null);
    this.adding.set(false);
    this.task(() => this.refresh());
  }
  async open(d: Deck) {
    await this.task(async () => {
      const cards = await this.api("/decks/" + d.id + "/cards");
      this.cards.set(cards);
      this.selected.set(d);
      this.revealed.set(false);
      this.adding.set(false);
      this.now.set(Date.now());
    });
  }
  addDeck(e: Event) {
    const b = this.form(e);
    this.task(async () => {
      await this.api("/decks", b);
      this.newDeck.set(false);
      await this.refresh();
    });
  }
  addCard(e: Event) {
    const b = this.form(e);
    this.task(async () => {
      await this.api("/decks/" + this.selected()!.id + "/cards", b);
      this.cards.set(
        await this.api("/decks/" + this.selected()!.id + "/cards"),
      );
      this.adding.set(false);
      await this.refresh();
    });
  }
  review(grade: string) {
    const card = this.current();
    if (!card) return;
    this.task(async () => {
      await this.api("/cards/" + card.id + "/reviews", {
        grade,
        version: card.version,
        requestId: crypto.randomUUID(),
      });
      this.cards.set(
        await this.api("/decks/" + this.selected()!.id + "/cards"),
      );
      this.revealed.set(false);
      await this.refresh();
      this.notice.set("Review saved. A little progress, every day.");
      setTimeout(() => this.notice.set(""), 2500);
    });
  }
  logout() {
    this.task(async () => {
      await this.api("/logout", {});
      this.user.set(null);
      this.selected.set(null);
      this.cards.set([]);
      this.decks.set([]);
    });
  }
  date(n: number) {
    return new Date(n).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
}
bootstrapApplication(App).catch(console.error);
