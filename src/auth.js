import { config } from "./config";

// Tokens are kept in memory only. A page refresh signs the user out, which is the
// safer default. Only the short-lived PKCE values live in sessionStorage during the
// redirect to and from the Cognito login page.
let session = null; // { idToken, accessToken, expiresAt }

const base64Url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomString = (length) =>
  base64Url(crypto.getRandomValues(new Uint8Array(length)));

async function sha256(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

export async function login() {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    state,
    code_challenge: base64Url(await sha256(verifier)),
    code_challenge_method: "S256",
  });
  window.location.assign(`${config.cognitoDomain}/oauth2/authorize?${params}`);
}

async function exchangeCode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error")) throw new Error("Sign-in was cancelled or refused");

  const code = params.get("code");
  const state = params.get("state");
  const verifier = sessionStorage.getItem("pkce_verifier");
  const savedState = sessionStorage.getItem("oauth_state");
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");

  if (!code || !verifier || !state || state !== savedState) {
    throw new Error("Invalid sign-in response");
  }

  const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Token exchange failed");

  const data = await res.json();
  session = {
    idToken: data.id_token,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// React StrictMode runs effects twice in development. An authorization code can be
// used only once, so both calls share the same promise.
let callbackPromise = null;
export function handleCallbackOnce() {
  if (!callbackPromise) callbackPromise = exchangeCode();
  return callbackPromise;
}

// Returns the token to send to /restricted, or null if signed out or expired.
export function getToken() {
  if (!session || Date.now() >= session.expiresAt) {
    session = null;
    return null;
  }
  return config.tokenType === "access_token"
    ? session.accessToken
    : session.idToken;
}

export function logout() {
  session = null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  window.location.assign(`${config.cognitoDomain}/logout?${params}`);
}