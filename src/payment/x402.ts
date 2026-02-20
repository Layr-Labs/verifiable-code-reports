import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { config } from "../config.js";
import type { RequestHandler } from "express";

export function createX402Middleware(): RequestHandler {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });

  const server = new x402ResourceServer(facilitatorClient).register(
    config.network,
    new ExactEvmScheme()
  );

  return paymentMiddleware(
    {
      "POST /api/report": {
        accepts: [
          {
            scheme: "exact",
            price: config.price,
            network: config.network,
            payTo: config.signerAddress,
          },
        ],
        description: "Creator Control Report — Trust analysis of a code repository",
        mimeType: "application/json",
      },
    },
    server
  );
}
