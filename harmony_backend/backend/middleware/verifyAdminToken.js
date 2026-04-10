const { createRemoteJWKSet, jwtVerify } = require("jose");

async function verifyAdminToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        message: "Missing access token",
      });
    }

    const accessToken = authHeader.split(" ")[1];

    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const apiClientId = process.env.MICROSOFT_API_CLIENT_ID;

    if (!tenantId || !apiClientId) {
      return res.status(500).json({
        ok: false,
        message: "Microsoft environment variables are missing",
      });
    }

    const jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );

    let payload;

    try {
      ({ payload } = await jwtVerify(accessToken, jwks, {
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        audience: `api://${apiClientId}`,
      }));
    } catch (err) {
      ({ payload } = await jwtVerify(accessToken, jwks, {
        issuer: `https://sts.windows.net/${tenantId}/`,
        audience: `api://${apiClientId}`,
      }));
    }

    const scopes = (payload.scp || "").split(" ");
    if (!scopes.includes("access_as_user")) {
      return res.status(403).json({
        ok: false,
        message: "Required scope is missing",
      });
    }

    const email =
      payload.preferred_username ||
      payload.email ||
      payload.upn ||
      null;

    const name = payload.name || "";
    const providerUserId = payload.oid || payload.sub || "";

    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "No email claim found in token",
      });
    }

    req.adminAuth = {
      email,
      name,
      providerUserId,
      payload,
    };

    next();
  } catch (error) {
    console.error("Admin token verification error:");
    console.error(error);
    console.error("message:", error.message);

    return res.status(401).json({
      ok: false,
      message: "Invalid Microsoft access token",
    });
  }
}

module.exports = verifyAdminToken;