import { config } from "./config.js";
import { app } from "./server.js";
import { runMigrations } from "./db/client.js";
import { startPoller } from "./eigencloud/poller.js";
import { resumePendingBuilds } from "./eigencloud/pipeline.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

await runMigrations();
await resumePendingBuilds();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Verifiable Code Reports running on port ${config.port}`);
  console.log(`Signer address: ${config.signerAddress}`);
});

startPoller();
