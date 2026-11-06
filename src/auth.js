import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies the JWT that the client (BetterAuth jwt plugin) hands out.
// The keys are published by the client app at /api/auth/jwks, so only the client can sign valid tokens.
export function createAuth({ authUrl, jwksUrl, keyResolver } = {}) {
  const resolver =
    keyResolver ??
    createRemoteJWKSet(new URL(jwksUrl ?? `${String(authUrl).replace(/\/+$/, "")}/api/auth/jwks`), {
      cooldownDuration: 10_000,
    });

  async function requireAuth(req, res, next) {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ message: "Login required. Send a Bearer token." });
    }
    try {
      const { payload } = await jwtVerify(token, resolver);
      if (!payload.email) return res.status(401).json({ message: "Token has no email." });
      req.user = {
        id: String(payload.id ?? payload.sub ?? ""),
        email: String(payload.email).toLowerCase(),
        name: payload.name ? String(payload.name) : "",
        image: payload.image ? String(payload.image) : "",
      };
      next();
    } catch (error) {
      console.error("JWT check failed:", error.code ?? error.message);
      res.status(401).json({ message: "Invalid or expired token. Please log in again." });
    }
  }

  return { requireAuth };
}
