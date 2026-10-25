import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { zohoConnection } from "@/db/schema";

/**
 * Zoho Inventory API client.
 *
 * Auth: OAuth 2.0 "server-based application". Raghav clicks Connect, approves in
 * Zoho, and the refresh token is stored in Neon (zoho_connection). Access tokens
 * last ~1 hour and are refreshed automatically.
 *
 * Env (set in Vercel by the project owner):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET   from api-console.zoho.in (server-based app)
 *   ZOHO_DC                              data centre suffix, default "in" (India)
 *   ZOHO_ORG_ID                          optional: pick a specific organization
 *   ZOHO_ACCOUNTS_URL, ZOHO_API_BASE     optional overrides (used by local tests)
 */

export const ZOHO_SCOPES = [
  "ZohoInventory.settings.READ",
  "ZohoInventory.contacts.CREATE",
  "ZohoInventory.contacts.READ",
  "ZohoInventory.items.CREATE",
  "ZohoInventory.items.READ",
  "ZohoInventory.purchaseorders.CREATE",
  "ZohoInventory.purchaseorders.READ",
].join(",");

const ACCOUNTS_HOST = /^accounts\.zoho(cloud)?\.(com|eu|in|com\.au|jp|ca|com\.cn|sa)$/;
const API_HOST = /^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|com\.cn|sa)$/;

export class ZohoError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message);
    this.name = "ZohoError";
  }
}

export function zohoConfig() {
  const dc = process.env.ZOHO_DC || "in";
  return {
    clientId: process.env.ZOHO_CLIENT_ID || "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET || "",
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || `https://accounts.zoho.${dc}`,
    apiBase: process.env.ZOHO_API_BASE || `https://www.zohoapis.${dc}/inventory/v1`,
    orgId: process.env.ZOHO_ORG_ID || "",
    overridden: Boolean(process.env.ZOHO_ACCOUNTS_URL || process.env.ZOHO_API_BASE),
  };
}

export const isZohoConfigured = () => {
  const c = zohoConfig();
  return Boolean(c.clientId && c.clientSecret);
};

/** Only trust Zoho's own domains when Zoho tells us which data centre to use. */
export function safeAccountsUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "https:" && ACCOUNTS_HOST.test(u.hostname) ? `https://${u.hostname}` : null;
  } catch {
    return null;
  }
}

export function safeApiBase(apiDomain: string | null | undefined): string | null {
  if (!apiDomain) return null;
  try {
    const u = new URL(apiDomain);
    return u.protocol === "https:" && API_HOST.test(u.hostname) ? `https://${u.hostname}/inventory/v1` : null;
  } catch {
    return null;
  }
}

export function redirectUri(origin: string) {
  return `${origin}/api/zoho/callback`;
}

export function authorizeUrl(origin: string, state: string) {
  const c = zohoConfig();
  const q = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: c.clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${c.accountsUrl}/oauth/v2/auth?${q}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  api_domain?: string;
  error?: string;
};

async function tokenRequest(accountsUrl: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error || !json.access_token)
    throw new ZohoError(`Zoho token request failed: ${json.error ?? `HTTP ${res.status}`}`, undefined, res.status);
  return json;
}

/** OAuth callback: swap the one-time code for tokens, find the organization, store the connection. */
export async function completeConnection(db: DB, opts: { code: string; origin: string; accountsServer?: string | null }) {
  const c = zohoConfig();
  const accountsUrl = (!c.overridden && safeAccountsUrl(opts.accountsServer)) || c.accountsUrl;
  const tok = await tokenRequest(accountsUrl, {
    code: opts.code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: redirectUri(opts.origin),
    grant_type: "authorization_code",
  });
  if (!tok.refresh_token)
    throw new ZohoError("Zoho did not return a refresh token. Remove the app's access in Zoho and connect again.");
  const apiBase = (!c.overridden && safeApiBase(tok.api_domain)) || c.apiBase;

  const orgRes = await rawRequest(apiBase, tok.access_token!, "GET", "/organizations");
  const orgs = (orgRes.organizations ?? []) as { organization_id: string; name: string }[];
  if (!orgs.length) throw new ZohoError("No Zoho Inventory organization found on this account. Create one in Zoho Inventory first.");
  const org = (c.orgId && orgs.find((o) => String(o.organization_id) === c.orgId)) || orgs[0];

  const values = {
    id: 1,
    refreshToken: tok.refresh_token,
    accessToken: tok.access_token!,
    accessExpiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
    accountsUrl,
    apiBase,
    orgId: String(org.organization_id),
    orgName: org.name,
    connectedAt: new Date(),
  };
  await db.insert(zohoConnection).values(values).onConflictDoUpdate({ target: zohoConnection.id, set: values });
  return { orgName: org.name, orgId: values.orgId, orgCount: orgs.length };
}

export async function getConnection(db: DB) {
  const [row] = await db.select().from(zohoConnection).where(eq(zohoConnection.id, 1));
  return row ?? null;
}

export async function disconnect(db: DB) {
  const conn = await getConnection(db);
  if (!conn) return;
  // Best effort: revoke the refresh token at Zoho, then forget it locally.
  await fetch(`${conn.accountsUrl}/oauth/v2/token/revoke?${new URLSearchParams({ token: conn.refreshToken })}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  await db.delete(zohoConnection).where(eq(zohoConnection.id, 1));
}

async function accessToken(db: DB, force = false) {
  const conn = await getConnection(db);
  if (!conn) throw new ZohoError("Zoho is not connected. Open the Zoho page and click Connect.");
  const fresh = conn.accessToken && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh && !force) return { conn, token: conn.accessToken! };
  const c = zohoConfig();
  const tok = await tokenRequest(conn.accountsUrl, {
    refresh_token: conn.refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
  });
  const accessExpiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000);
  await db.update(zohoConnection).set({ accessToken: tok.access_token!, accessExpiresAt }).where(eq(zohoConnection.id, 1));
  return { conn: { ...conn, accessToken: tok.access_token!, accessExpiresAt }, token: tok.access_token! };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function rawRequest(
  apiBase: string,
  token: string,
  method: "GET" | "POST",
  path: string,
  query: Record<string, string> = {},
  body?: Json,
): Promise<Json> {
  const url = `${apiBase}${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  // Zoho returns { code: 0, message: "success", ... } on success.
  if (!res.ok || (typeof json.code === "number" && json.code !== 0))
    throw new ZohoError(json.message || `Zoho API HTTP ${res.status}`, json.code, res.status);
  return json;
}

/** Authenticated call scoped to the connected organization; refreshes the token once on 401. */
export async function zoho(
  db: DB,
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; body?: Json } = {},
): Promise<Json> {
  let { conn, token } = await accessToken(db);
  const query = { organization_id: conn.orgId, ...(opts.query ?? {}) };
  try {
    return await rawRequest(conn.apiBase, token, method, path, query, opts.body);
  } catch (e) {
    if (!(e instanceof ZohoError) || e.status !== 401) throw e;
    ({ conn, token } = await accessToken(db, true));
    return rawRequest(conn.apiBase, token, method, path, query, opts.body);
  }
}
