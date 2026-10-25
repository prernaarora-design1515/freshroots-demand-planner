// Local stand-in for Zoho accounts + Inventory API, for end-to-end tests only.
// Run: node scripts/mock-zoho.mjs  (port 4010). Inspect state at GET /__state.
import http from "node:http";

const PORT = Number(process.env.MOCK_ZOHO_PORT || 4010);
const ORG = "60000000001";
const state = { contacts: [], items: [], purchaseorders: [], tokens: new Set(), refreshes: 0, errors: [] };
let seq = 1000;
const id = () => String(++seq);

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};
const readBody = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    const body = await readBody(req);

    // --- accounts ---
    if (p === "/oauth/v2/auth") {
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", "mock-grant-code");
      back.searchParams.set("state", url.searchParams.get("state"));
      back.searchParams.set("accounts-server", "https://evil.example.com"); // must be ignored
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (p === "/oauth/v2/token" && req.method === "POST") {
      const f = new URLSearchParams(body);
      if (f.get("client_id") !== "test-client" || f.get("client_secret") !== "test-secret")
        return send(res, 200, { error: "invalid_client" });
      const access = `mock-access-${id()}`;
      state.tokens.add(access);
      if (f.get("grant_type") === "authorization_code") {
        if (f.get("code") !== "mock-grant-code") return send(res, 200, { error: "invalid_code" });
        return send(res, 200, { access_token: access, refresh_token: "mock-refresh", expires_in: 3600, api_domain: "https://www.zohoapis.in" });
      }
      if (f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "mock-refresh") {
        state.refreshes++;
        return send(res, 200, { access_token: access, expires_in: 3600, api_domain: "https://www.zohoapis.in" });
      }
      return send(res, 200, { error: "invalid_grant" });
    }
    if (p === "/oauth/v2/token/revoke") return send(res, 200, { status: "success" });
    if (p === "/__state") return send(res, 200, { ...state, tokens: state.tokens.size });
    // Test helpers: mark a PO line partly received, or set a PO's status.
    if (p === "/__receive") {
      const po = state.purchaseorders.find((x) => x.purchaseorder_number === url.searchParams.get("po"));
      if (!po) return send(res, 404, { error: "no po" });
      po.line_items[0].quantity_received = Number(url.searchParams.get("qty"));
      po.status = "open";
      po.received_status = "partially_received";
      return send(res, 200, po);
    }
    if (p === "/__status") {
      const po = state.purchaseorders.find((x) => x.purchaseorder_number === url.searchParams.get("po"));
      if (!po) return send(res, 404, { error: "no po" });
      po.status = url.searchParams.get("status");
      return send(res, 200, po);
    }

    // --- inventory API ---
    if (!p.startsWith("/inventory/v1/")) return send(res, 404, { code: 5, message: "Invalid URL" });
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Zoho-oauthtoken /, "");
    if (!auth.startsWith("Zoho-oauthtoken ") || !state.tokens.has(token))
      return send(res, 401, { code: 57, message: "You are not authorized to perform this operation" });
    const path = p.slice("/inventory/v1".length);
    if (path === "/organizations") return send(res, 200, { code: 0, message: "success", organizations: [{ organization_id: ORG, name: "Freshroots (Test)" }] });
    if (url.searchParams.get("organization_id") !== ORG) return send(res, 400, { code: 6041, message: "organization_id missing or wrong" });

    let json = {};
    if (body) {
      if (!String(req.headers["content-type"]).includes("application/json")) return send(res, 400, { code: 4, message: "Expected JSON" });
      json = JSON.parse(body);
    }
    const page = { page: 1, per_page: 200, has_more_page: false };

    if (path === "/contacts" && req.method === "GET")
      return send(res, 200, { code: 0, contacts: state.contacts.filter((c) => !url.searchParams.get("contact_type") || c.contact_type === url.searchParams.get("contact_type")), page_context: page });
    if (path === "/contacts" && req.method === "POST") {
      if (!json.contact_name) return send(res, 400, { code: 2, message: "contact_name required" });
      const c = { contact_id: id(), contact_name: json.contact_name, contact_type: json.contact_type };
      state.contacts.push(c);
      return send(res, 201, { code: 0, message: "The contact has been added.", contact: c });
    }
    if (path === "/items" && req.method === "GET") return send(res, 200, { code: 0, items: state.items, page_context: page });
    if (path === "/items" && req.method === "POST") {
      for (const k of ["name", "sku", "rate", "purchase_rate", "item_type"]) if (json[k] === undefined) return send(res, 400, { code: 2, message: `${k} required` });
      if (state.items.some((i) => i.sku === json.sku)) return send(res, 400, { code: 1001, message: "SKU already exists" });
      const it = { item_id: id(), ...json };
      state.items.push(it);
      return send(res, 201, { code: 0, message: "The item has been added.", item: it });
    }
    if (path === "/purchaseorders" && req.method === "GET")
      return send(res, 200, {
        code: 0,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        purchaseorders: state.purchaseorders.map(({ line_items, ...po }) => ({ ...po, vendor_name: state.contacts.find((c) => c.contact_id === po.vendor_id)?.contact_name })),
        page_context: page,
      });
    if (path.startsWith("/purchaseorders/") && req.method === "GET") {
      const po = state.purchaseorders.find((x) => x.purchaseorder_id === path.split("/")[2]);
      if (!po) return send(res, 404, { code: 1004, message: "PO not found" });
      return send(res, 200, {
        code: 0,
        purchaseorder: { ...po, line_items: po.line_items.map((li) => ({ ...li, sku: state.items.find((i) => i.item_id === li.item_id)?.sku })) },
      });
    }
    if (path === "/purchaseorders" && req.method === "POST") {
      if (!state.contacts.some((c) => c.contact_id === json.vendor_id && c.contact_type === "vendor"))
        return send(res, 400, { code: 1002, message: "Vendor does not exist" });
      if (!Array.isArray(json.line_items) || !json.line_items.length) return send(res, 400, { code: 2, message: "line_items required" });
      for (const li of json.line_items) {
        if (!state.items.some((i) => i.item_id === li.item_id)) return send(res, 400, { code: 1003, message: `Item ${li.item_id} does not exist` });
        if (!(li.quantity > 0) || !(li.rate > 0)) return send(res, 400, { code: 2, message: "quantity and rate must be positive" });
      }
      const po = { purchaseorder_id: id(), purchaseorder_number: `PO-${String(state.purchaseorders.length + 1).padStart(5, "0")}`, status: "draft", ...json };
      state.purchaseorders.push(po);
      return send(res, 201, { code: 0, message: "The purchase order has been created.", purchaseorder: po });
    }
    return send(res, 404, { code: 5, message: `No mock for ${req.method} ${path}` });
  })
  .listen(PORT, () => console.log(`mock zoho on :${PORT}`));
