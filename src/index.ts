import { config } from "./config.js";
import { app } from "./server.js";

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Verifiable Code Reports running on port ${config.port}`);
  console.log(`Signer address: ${config.signerAddress}`);
});
