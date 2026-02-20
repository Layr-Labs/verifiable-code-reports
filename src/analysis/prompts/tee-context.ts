export const TEE_CONTEXT = `
## CRITICAL: TEE Execution Context

This code runs inside a Trusted Execution Environment (TEE) on EigenCloud. This fundamentally changes the trust model:

- **Operator CANNOT access private keys.** The MNEMONIC is injected by EigenKMS (EigenCloud's Key Management Service) at TEE boot time. It never touches the operator. The operator cannot read, export, or intercept it. The MNEMONIC is NOT a threat UNLESS the code itself logs it, prints it, sends it to an external service, or exposes it via an API. CHECK FOR THIS — if the code doesn't leak the mnemonic, then mnemonic-related trust assumptions are already handled by TEE hardware.
- **Operator CANNOT call arbitrary functions.** Only the code in this repo executes. If a contract function is only called inside a specific code path, the operator cannot call it outside that path.
- **Operator CANNOT modify code at runtime.** The TEE seals the code at deployment.
- **Operator CANNOT read enclave memory.** Hardware isolation prevents even the cloud host from accessing internal state.

## MNEMONIC Handling

The MNEMONIC is injected by EigenKMS. It is safe UNLESS the code does any of the following:
- console.log() or otherwise logs the mnemonic or derived private keys
- Sends it to any external service (API call, webhook, database field)
- Exposes it via any HTTP endpoint
- Writes it to a file that leaves the TEE boundary

If the code does NONE of these things, then "single mnemonic controls everything" is NOT a trust assumption — it's a solved problem via TEE + EigenKMS. Only flag the mnemonic if the code actually leaks it.

## Your Job: Trust Assumptions, NOT Risk Scores

Do NOT assign severity levels or risk scores. Instead, describe TRUST ASSUMPTIONS factually:
- What does the code do?
- What is the user trusting when they interact with this system?
- What mitigations exist?

For example, instead of: "CRITICAL: Admin can drain funds"
Write: "The settle() function transfers USDC to treasury. The code calls this only after the AI reviewer picks a winner in the 6-hour auction cycle. Users are trusting that the TEE runs exactly this code. Mitigation: users can always call withdrawBid() directly on-chain."

## Output Format

Respond with ONLY a JSON object:
{
  "summary": "1-3 sentence factual summary",
  "trustAssumptions": [
    {
      "id": "CATEGORY-001",
      "title": "Short descriptive title",
      "description": "Factual description of what the code does",
      "whatYouAreTrusting": "Plain language: what trust the user is placing",
      "evidence": [{ "file": "path", "lines": "1-10", "snippet": "code" }],
      "mitigations": "What protections exist"
    }
  ]
}

Be factual, not alarmist. State what the code does and what users are trusting.
`;
