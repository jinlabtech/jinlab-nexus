import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

// The runner transpiles the core modules; the real Supabase SDK is used.
const serverPath = "../lib/intelligence/server.ts";
const { authenticateCore, loadCoreSnapshot, johannesburgDate }: typeof import("../lib/intelligence/server") = await import(serverPath);
const httpPath = "../lib/intelligence/http.ts";
const { handleCoreRequest }: typeof import("../lib/intelligence/http") = await import(httpPath);

const ORIGIN = "https://nexus-core-test.supabase.co";
const COMPANY = "a1000000-0000-4000-8000-000000000001";
const OTHER_COMPANY = "b1000000-0000-4000-8000-000000000001";
const USER = "a0000000-0000-4000-8000-000000000001";
const TOKEN = "mock-owner-session";
const NOW = new Date("2026-09-15T22:30:00.000Z");
const ALL = ["inventory.view", "accounting.view", "quotation.view", "sales.view", "invoice.view", "purchasing.view", "repair.view", "company.view", "settings.finance.view"];
type Row = Record<string, unknown>;
type Call = { url: URL; method: string; headers: Headers; body: Record<string, unknown> | null };
type MockOptions = {
  permissions?: string[]; role?: string; invalidSession?: boolean;
  ambiguousProfile?: boolean; currentCompany?: string; financialCompany?: string;
  tables?: Record<string, Row[]>; failures?: string[]; badAgeing?: boolean;
  pageCap?: number;
};

function response(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function mockedNetwork(t: TestContext, options: MockOptions = {}) {
  const originalFetch = globalThis.fetch;
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: ORIGIN,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock-publishable-key",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
    SUPABASE_SECRET_KEY: "never-use-this-admin-key",
    OPENAI_API_KEY: "never-use-this-model-key",
  };
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const calls: Call[] = [];
  const tables: Record<string, Row[]> = {
    inventory_item: [{ id: "item-a", item_name: "Charging port", sku: "PORT-A", minimum_stock: "10" }],
    branch_stock: [{ id: "stock-a", inventory_item_id: "item-a", quantity: "3" }],
    purchase_order: [{ id: "po-a", purchase_order_number: "PO-1", status: "approved", expected_date: "2026-09-15" }],
    purchase_order_item: [{ id: "poi-a", purchase_order_id: "po-a", inventory_item_id: "item-a", quantity_ordered: "8", quantity_received: "2" }],
    quotation: [{ id: "quote-a", quotation_number: "Q-1", status: "accepted", quotation_date: "2026-09-10", valid_until: "2026-09-20", total_amount: "125.50" }],
    sales_order: [{ id: "so-a", quotation_id: "quote-a", status: "confirmed" }],
    invoice: [],
    service_job: [{ id: "repair-a", job_number: "J-1", status: "received", assigned_employee_id: null, created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z" }],
    ...options.tables,
  };
  const allowed = new Set(options.permissions ?? ALL);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
    const call: Call = { url, method: request.method, headers: request.headers, body: text ? JSON.parse(text) : null };
    calls.push(call);
    // Any unexpected origin fails locally; this mock never forwards network traffic.
    assert.equal(url.origin, ORIGIN, "Only the configured Supabase origin may be contacted");
    const name = url.pathname.split("/").at(-1)!;
    if (options.failures?.includes(name)) return response({ code: "XX000", message: "mock source unavailable" }, 400);
    if (url.pathname === "/auth/v1/user") {
      if (options.invalidSession) return response({ code: "bad_jwt", message: "Invalid session" }, 401);
      return response({ id: USER, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    }
    if (name === "user_profile") {
      if (options.ambiguousProfile) return response({ code: "PGRST116", message: "Cannot coerce multiple rows into one object", details: "The result contains 2 rows" }, 406);
      return response({ company_id: COMPANY, role: options.role ?? "owner" });
    }
    if (name === "current_company_id") return response(options.currentCompany ?? COMPANY);
    if (name === "current_settings_company_id") return response(options.financialCompany ?? COMPANY);
    if (name === "current_user_has_permission") return response(allowed.has(String(call.body?.requested_permission)));
    if (name === "company") return response({ company_name: "Mock Nexus Company" });
    if (name === "company_finance_settings") return response({ base_currency: "ZAR" });
    if (name === "get_accounting_exception_summary") return response({ ok: true, open_count: 2, oldest_open_date: "2026-09-13" });
    if (name === "get_debtor_ageing") return response({
      ok: true, currency: "ZAR", summary: { open_invoice_count: options.badAgeing ? 2 : 1 },
      invoices: [{ invoice_id: "invoice-a", invoice_number: "INV-1", customer_name: "Test Customer", outstanding: "100.50", days_overdue: 5, due_date: "2026-09-11" }],
    });
    if (name in tables) {
      const rows = tables[name];
      const range = request.headers.get("range")?.split("-").map(Number);
      const start = Number(url.searchParams.get("offset") ?? range?.[0] ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? (range ? range[1] - range[0] + 1 : 500));
      const page = rows.slice(start, start + Math.min(limit, options.pageCap ?? limit));
      const contentRange = page.length ? `${start}-${start + page.length - 1}/${rows.length}` : `*/${rows.length}`;
      return response(page, 200, { "Content-Range": contentRange, "Range-Unit": "items" });
    }
    throw new Error(`Unexpected mocked endpoint: ${url.pathname}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return calls;
}

function ownerRequest(authorization = `Bearer ${TOKEN}`) {
  return new Request("https://nexus.example/api/nexus-core", { headers: { Authorization: authorization } });
}
function hasStatus(status: number) {
  return (error: unknown) => !!error && typeof error === "object" && "status" in error && error.status === status;
}
function state(snapshot: Awaited<ReturnType<typeof loadCoreSnapshot>>, module: string) {
  return snapshot.coverage.find(item => item.module === module)?.state;
}

test("missing and malformed auth fail before data/network access", async t => {
  const calls = mockedNetwork(t);
  for (const request of [new Request("https://nexus.example"), ownerRequest("Basic abc"), ownerRequest("Bearer"), ownerRequest(`Bearer ${"x".repeat(10001)}`)]) {
    await assert.rejects(authenticateCore(request), hasStatus(401));
  }
  assert.equal(calls.length, 0);
});

test("a rejected session cannot read the profile or source records", async t => {
  const calls = mockedNetwork(t, { invalidSession: true });
  await assert.rejects(authenticateCore(ownerRequest("Bearer malformed-token")), hasStatus(401));
  assert.deepEqual(calls.map(call => call.url.pathname), ["/auth/v1/user"]);
});

test("non-owner access fails before permission or business queries", async t => {
  const calls = mockedNetwork(t, { role: "admin" });
  await assert.rejects(authenticateCore(ownerRequest()), hasStatus(403));
  assert.deepEqual(calls.map(call => call.url.pathname), ["/auth/v1/user", "/rest/v1/user_profile"]);
});

test("multiple profiles cannot choose an arbitrary company", async t => {
  const calls = mockedNetwork(t, { ambiguousProfile: true });
  await assert.rejects(authenticateCore(ownerRequest()), hasStatus(403));
  assert.equal(calls.some(call => call.url.pathname.includes("/rpc/")), false);
});

test("profile and database company must agree before any module is read", async t => {
  const calls = mockedNetwork(t, { currentCompany: OTHER_COMPANY });
  await assert.rejects(authenticateCore(ownerRequest()), hasStatus(403));
  assert.equal(calls.some(call => call.url.pathname.endsWith("current_user_has_permission")), false);
});

test("explicit module permission denials produce forbidden coverage and zero source reads", async t => {
  const calls = mockedNetwork(t, { permissions: [] });
  const actor = await authenticateCore(ownerRequest());
  const authCount = calls.length;
  const snapshot = await loadCoreSnapshot(actor, NOW);
  assert.equal(calls.length, authCount);
  assert.equal(snapshot.coverage.length, 6);
  assert.equal(snapshot.coverage.every(item => item.state === "forbidden" && item.records === null), true);
  for (const name of ["inventory", "receivables", "quotations", "purchasing", "repairs", "controls"] as const) assert.equal(snapshot[name], null);
});

test("allowed reads stay on Supabase with the user token and no admin/model keys or mutation RPCs", async t => {
  const calls = mockedNetwork(t);
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.coverage.every(item => item.state === "ready"), true);
  assert.deepEqual(snapshot.inventory?.[0], { id: "item-a", name: "Charging port", sku: "PORT-A", minimumStock: 10, quantity: 3, onOrder: 6 });
  assert.equal(snapshot.quotations?.[0].converted, true);
  assert.equal(snapshot.controls?.openCount, 2);
  assert.equal(snapshot.asOf, "2026-09-16");
  const readRpcs = new Set(["current_company_id", "current_settings_company_id", "current_user_has_permission", "get_debtor_ageing", "get_accounting_exception_summary"]);
  for (const call of calls) {
    assert.equal(call.url.origin, ORIGIN);
    assert.equal(call.headers.get("authorization"), `Bearer ${TOKEN}`);
    assert.equal(call.headers.get("apikey"), "mock-publishable-key");
    assert.equal(JSON.stringify({ url: call.url.href, headers: [...call.headers], body: call.body }).includes("never-use-this"), false);
    if (call.url.pathname.includes("/rpc/")) assert.equal(readRpcs.has(call.url.pathname.split("/").at(-1)!), true);
    else assert.equal(call.method, "GET");
    if (call.url.pathname.startsWith("/rest/v1/") && !call.url.pathname.includes("/rpc/") && !call.url.pathname.endsWith("user_profile") && !call.url.pathname.endsWith("company")) {
      assert.equal(call.url.searchParams.get("company_id"), `eq.${COMPANY}`);
    }
  }
  assert.equal(calls.find(call => call.url.pathname.endsWith("get_debtor_ageing"))?.body?.p_as_of_date, "2026-09-16");
});

test("source failure stays unavailable instead of becoming zero stock or healthy controls", async t => {
  mockedNetwork(t, { failures: ["branch_stock", "get_accounting_exception_summary"] });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.inventory, null);
  assert.equal(state(snapshot, "inventory"), "unavailable");
  assert.equal(snapshot.controls, null);
  assert.equal(state(snapshot, "controls"), "unavailable");
  assert.equal(snapshot.receivables?.[0].outstanding, 100.5);
  assert.equal(state(snapshot, "receivables"), "ready");
});

test("incomplete ageing counts cannot become authoritative totals", async t => {
  mockedNetwork(t, { permissions: ["accounting.view"], badAgeing: true });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.receivables, null);
  assert.equal(state(snapshot, "receivables"), "unavailable");
  assert.equal(snapshot.controls?.openCount, 2);
});

test("finance company mismatch prevents both company-sensitive accounting RPCs", async t => {
  const calls = mockedNetwork(t, { permissions: ["accounting.view"], financialCompany: OTHER_COMPANY });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.receivables, null);
  assert.equal(snapshot.controls, null);
  assert.equal(calls.some(call => /get_debtor_ageing|get_accounting_exception_summary/.test(call.url.pathname)), false);
});

test("unknown purchasing quantities are not treated as zero incoming stock", async t => {
  mockedNetwork(t, { permissions: ["inventory.view", "purchasing.view"], failures: ["purchase_order_item"] });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.inventory?.[0].quantity, 3);
  assert.equal(snapshot.inventory?.[0].onOrder, null);
  assert.equal(snapshot.purchasing, null);
  assert.equal(state(snapshot, "purchasing"), "unavailable");
});

test("an approved purchase order with missing lines leaves incoming quantities unknown", async t => {
  mockedNetwork(t, { permissions: ["inventory.view", "purchasing.view"], tables: { purchase_order_item: [] } });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.inventory?.[0].quantity, 3);
  assert.equal(snapshot.inventory?.[0].onOrder, null);
  assert.equal(snapshot.purchasing?.[0].outstandingUnits, null);
  assert.equal(state(snapshot, "purchasing"), "partial");
});

test("stock beyond the row limit is withheld rather than undercounted into a shortage", async t => {
  const stock = Array.from({ length: 10001 }, (_, index) => ({ id: `stock-${index}`, inventory_item_id: "item-a", quantity: 1 }));
  const calls = mockedNetwork(t, { permissions: ["inventory.view"], tables: { branch_stock: stock } });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.inventory, null);
  assert.equal(state(snapshot, "inventory"), "partial");
  assert.equal(calls.find(call => call.url.pathname.endsWith("branch_stock"))?.headers.get("prefer")?.includes("count=exact"), true);
});

test("a shorter provider page with a larger exact count is never accepted as complete stock", async t => {
  const stock = Array.from({ length: 700 }, (_, index) => ({ id: `stock-${index}`, inventory_item_id: "item-a", quantity: 1 }));
  mockedNetwork(t, { permissions: ["inventory.view"], tables: { branch_stock: stock }, pageCap: 100 });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  // Either finish pagination despite the server cap, or fail closed on incomplete stock.
  if (snapshot.inventory === null) assert.equal(state(snapshot, "inventory"), "partial");
  else assert.equal(snapshot.inventory[0].quantity, 700);
});

test("denied conversion permissions trigger no invoice/order reads and leave conversion unknown", async t => {
  const calls = mockedNetwork(t, { permissions: ["quotation.view"] });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.quotations?.[0].converted, null);
  assert.equal(calls.some(call => /\/(invoice|sales_order)$/.test(call.url.pathname)), false);
});

test("a permitted linked invoice proves quotation conversion even when sales orders are forbidden", async t => {
  const calls = mockedNetwork(t, {
    permissions: ["quotation.view", "invoice.view"],
    tables: { invoice: [{ id: "invoice-a", quotation_id: "quote-a", status: "issued" }] },
  });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.quotations?.[0].converted, true);
  assert.equal(calls.some(call => call.url.pathname.endsWith("sales_order")), false);
});

test("absence of invoice links alone cannot prove an accepted quotation is unconverted", async t => {
  mockedNetwork(t, { permissions: ["quotation.view", "invoice.view"], tables: { invoice: [] } });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.quotations?.[0].converted, null);
});

test("only complete invoice and sales-order reads can prove there is no live conversion", async t => {
  mockedNetwork(t, {
    permissions: ["quotation.view", "invoice.view", "sales.view"],
    tables: { invoice: [{ id: "invoice-a", quotation_id: "quote-a", status: "cancelled" }], sales_order: [] },
  });
  const snapshot = await loadCoreSnapshot(await authenticateCore(ownerRequest()), NOW);
  assert.equal(snapshot.quotations?.[0].converted, false);
});

test("Johannesburg business date rolls over at 22:00 UTC independently of host timezone", () => {
  assert.equal(johannesburgDate(new Date("2026-09-15T21:59:59.999Z")), "2026-09-15");
  assert.equal(johannesburgDate(new Date("2026-09-15T22:00:00.000Z")), "2026-09-16");
  assert.equal(johannesburgDate(new Date("2026-12-31T22:00:00.000Z")), "2027-01-01");
});

function questionRequest(input: unknown, headers: HeadersInit = {}) {
  return new Request("https://nexus.example/api/nexus-intelligence", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
}

function assertCoreHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-nexus-mode"), "nexus-core");
}

function assertAuthenticationOnly(calls: Call[]) {
  const allowed = new Set(["/auth/v1/user", "/rest/v1/user_profile", "/rest/v1/rpc/current_company_id", "/rest/v1/rpc/current_user_has_permission"]);
  for (const call of calls) assert.equal(allowed.has(call.url.pathname), true, `Validation must precede source read ${call.url.pathname}`);
}

test("HTTP GET returns structured core analysis without any model API key", async t => {
  const calls = mockedNetwork(t);
  delete process.env.OPENAI_API_KEY;
  const response = await handleCoreRequest(ownerRequest());
  assert.equal(response.status, 200);
  assertCoreHeaders(response);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const result = await response.json();
  assert.equal(result.analysis.engine, "nexus-core");
  assert.equal(result.analysis.companyName, "Mock Nexus Company");
  assert.equal(result.analysis.coverage.length, 6);
  assert.equal(Array.isArray(result.analysis.findings), true);
  assert.equal("answer" in result, false);
  assert.equal(calls.every(call => call.url.origin === ORIGIN), true);
});

test("HTTP POST answers a supported question with structured evidence and no model API key", async t => {
  const calls = mockedNetwork(t);
  delete process.env.OPENAI_API_KEY;
  const response = await handleCoreRequest(questionRequest({ question: "Review inventory", route: "/inventory", previousTopic: "inventory", attachments: [] }));
  assert.equal(response.status, 200);
  assertCoreHeaders(response);
  const result = await response.json();
  assert.equal(result.analysis.engine, "nexus-core");
  assert.equal(result.answer.topic, "inventory");
  assert.equal(typeof result.answer.text, "string");
  assert.ok(result.answer.text.length > 0);
  assert.equal(Array.isArray(result.answer.findings), true);
  assert.equal(calls.every(call => call.url.origin === ORIGIN), true);
});

test("legacy HTTP mode returns readable text instead of a JSON wrapper", async t => {
  mockedNetwork(t);
  delete process.env.OPENAI_API_KEY;
  const response = await handleCoreRequest(questionRequest({ question: "Review inventory" }), true);
  assert.equal(response.status, 200);
  assertCoreHeaders(response);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
  const text = await response.text();
  assert.ok(text.length > 0);
  assert.match(text, /inventory|stock/i);
  assert.equal(text.includes('"analysis":'), false);
});

test("HTTP unauthenticated failures return 401 and no-store without network access", async t => {
  const calls = mockedNetwork(t);
  const response = await handleCoreRequest(new Request("https://nexus.example/api/nexus-intelligence"));
  assert.equal(response.status, 401);
  assertCoreHeaders(response);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(calls.length, 0);
});

test("HTTP malformed JSON and non-object bodies fail before sources are read", async t => {
  const calls = mockedNetwork(t);
  for (const content of ["", "{", "[]", "null", '"question"']) {
    const response = await handleCoreRequest(new Request("https://nexus.example/api/nexus-intelligence", {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: content,
    }));
    assert.equal(response.status, 400, content);
    assertCoreHeaders(response);
  }
  assertAuthenticationOnly(calls);
});

test("HTTP rejects oversized declared and actual bodies before source reads", async t => {
  const calls = mockedNetwork(t);
  const declared = await handleCoreRequest(questionRequest({ question: "Stock" }, { "Content-Length": "20000" }));
  assert.equal(declared.status, 413);
  assertCoreHeaders(declared);
  const streamed = await handleCoreRequest(new Request("https://nexus.example/api/nexus-intelligence", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: " ".repeat(16385),
  }));
  assert.equal(streamed.status, 413);
  assertCoreHeaders(streamed);
  assertAuthenticationOnly(calls);
});

const invalidRequestGroups: Array<[string, unknown[]]> = [
  ["questions", [{}, { question: null }, { question: 42 }, { question: "   " }, { question: "x".repeat(1501) }]],
  ["attachments", [
    { question: "Stock", attachments: [{ name: "document.pdf", dataUrl: "test" }] },
    { question: "Stock", attachments: { name: "document.pdf" } },
    { question: "Stock", attachments: "document.pdf" },
  ]],
  ["topics", [{ question: "Stock", previousTopic: "unsupported" }, { question: "Stock", previousTopic: null }]],
  ["routes", [{ question: "Stock", route: 12 }, { question: "Stock", route: "https://outside.example" }, { question: "Stock", route: "/" + "x".repeat(200) }]],
];
for (const [field, invalidInputs] of invalidRequestGroups) {
  test(`HTTP invalid ${field} fail before sources are read`, async t => {
    const calls = mockedNetwork(t);
    for (const input of invalidInputs) {
      const response = await handleCoreRequest(questionRequest(input));
      assert.equal(response.status, 400, JSON.stringify(input));
      assertCoreHeaders(response);
    }
    assertAuthenticationOnly(calls);
  });
}

test("HTTP partial failures remain unavailable in analysis and never claim healthy controls", async t => {
  mockedNetwork(t, { failures: ["branch_stock", "get_accounting_exception_summary"] });
  const response = await handleCoreRequest(questionRequest({ question: "What needs attention?" }));
  assert.equal(response.status, 200);
  assertCoreHeaders(response);
  const result = await response.json();
  for (const area of ["inventory", "controls"]) {
    assert.equal(result.analysis.coverage.find((item: { module: string }) => item.module === area)?.state, "unavailable");
    assert.equal(result.analysis.metrics.some((item: { module: string }) => item.module === area), false);
  }
  assert.equal(result.analysis.coverage.find((item: { module: string }) => item.module === "receivables")?.state, "ready");
});
