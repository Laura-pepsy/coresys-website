// Reads settings from .env.local (Vite exposes only variables that start with VITE_).
// Nothing here is secret: the Cognito app client is public and has no client secret.
const env = import.meta.env;

export const config = {
  apiBase: env.VITE_API_BASE_URL,
  cognitoDomain: env.VITE_COGNITO_DOMAIN,
  clientId: env.VITE_COGNITO_CLIENT_ID,
  scopes: env.VITE_COGNITO_SCOPES || "openid email profile",
  redirectUri: env.VITE_REDIRECT_URI,
  logoutUri: env.VITE_LOGOUT_URI,
  defaultLang: env.VITE_DEFAULT_LANGUAGE || "en",
  maxQueryLength: Number(env.VITE_MAX_QUERY_LENGTH) || 1000,
  // Which Cognito token is sent to /restricted. Use whichever your API Gateway
  // JWT authorizer accepts: "id_token" or "access_token".
  tokenType: env.VITE_TOKEN_TYPE || "id_token",
};