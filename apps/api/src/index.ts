import { env } from "./env";
import { openDb } from "./db";
import { createRateLimiter } from "./ratelimit";
import { createApp } from "./app";

const db = openDb(env.databasePath);
const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const app = createApp(db, rateLimiter, env.corsOrigin);

app.listen(env.port, () => {
  console.log(`Pac-Man API listening on http://localhost:${env.port}`);
  console.log(`CORS origin allowed: ${env.corsOrigin}`);
  console.log(`Database: ${env.databasePath}`);
});
