import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Controller,
  Module,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  Injectable,
  CanActivate,
  ExecutionContext,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import { Store } from "./store";
const store = new Store();
const attempts = new Map<string, { count: number; until: number }>();
function token(req: Request) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("session="))
      ?.slice(8) || ""
  );
}
@Injectable()
class Guard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = store.user(token(req));
    return true;
  }
}
@Controller("api")
class Api {
  @Get("health") health() {
    return { status: "ok" };
  }
  @Post("auth/:action") auth(
    @Param("action") action: string,
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!["signup", "login"].includes(action))
      throw new BadRequestException("Invalid action.");
    const result = store.auth(body || {}, action === "signup");
    res.cookie("session", result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
      path: "/",
    });
    return result.user;
  }
  @Post("logout") @UseGuards(Guard) logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    store.db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(store.digest(token(req)));
    res.clearCookie("session", { path: "/" });
    return { ok: true };
  }
  @Get("me") @UseGuards(Guard) me(@Req() r: any) {
    return r.user;
  }
  @Get("decks") @UseGuards(Guard) decks(@Req() r: any) {
    return store.list(r.user.id);
  }
  @Post("decks") @UseGuards(Guard) create(@Req() r: any, @Body() b: any) {
    return store.createDeck(r.user.id, b || {});
  }
  @Get("decks/:id/cards") @UseGuards(Guard) cards(
    @Req() r: any,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return store.cards(r.user.id, Number(id));
  }
  @Post("decks/:id/cards") @UseGuards(Guard) card(
    @Req() r: any,
    @Param("id", ParseIntPipe) id: number,
    @Body() b: any,
  ) {
    return store.createCard(r.user.id, Number(id), b || {});
  }
  @Post("cards/:id/reviews") @UseGuards(Guard) review(
    @Req() r: any,
    @Param("id", ParseIntPipe) id: number,
    @Body() b: any,
  ) {
    return store.review(r.user.id, Number(id), b || {});
  }
  @Get("stats") @UseGuards(Guard) stats(@Req() r: any) {
    return store.stats(r.user.id);
  }
}
@Module({ controllers: [Api], providers: [Guard] })
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api/auth/") && req.method === "POST") {
      const now = Date.now();
      for (const [key, value] of attempts)
        if (value.until < now) attempts.delete(key);
      const key = req.ip || "unknown";
      const entry = attempts.get(key) || { count: 0, until: now + 900000 };
      entry.count++;
      attempts.set(key, entry);
      if (entry.count > 30) {
        res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000));
        return res
          .status(429)
          .json({ message: "Too many attempts. Try again later." });
      }
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin &&
          req.headers.origin !==
            (process.env.APP_ORIGIN || "http://localhost:8000")))
    )
      return res.status(403).json({ message: "Origin not allowed." });
    next();
  });
  app.useStaticAssets(join(process.cwd(), "dist/web/browser"));
  await app.listen(Number(process.env.PORT || 8000), "0.0.0.0");
}
bootstrap();
