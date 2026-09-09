import "dotenv/config";
import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);

const app = buildApp();

app
  .listen({ port, host: "127.0.0.1" })
  .then(() => {
    app.log.info(`API listening on http://127.0.0.1:${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
