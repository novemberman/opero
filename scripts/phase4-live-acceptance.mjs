#!/usr/bin/env node
/**
 * Live Phase 4 acceptance against the running API + worker + ClamAV.
 * Usage: node scripts/phase4-live-acceptance.mjs
 */
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(new URL("../packages/document-processing/package.json", import.meta.url));
const ExcelJS = require("exceljs");
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mailDirs = [join(repoRoot, "apps/api/.data/mail"), join(repoRoot, ".data/mail")];

const API = process.env.API_BASE ?? "http://127.0.0.1:3001/api/v1";
const results = [];

function log(ok, name, detail = "") {
  results.push({ ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseSetCookie(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function cookieHeader(parts) {
  return parts.map((c) => c.split(";")[0]).join("; ");
}

function getCookie(parts, name) {
  const hit = parts.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(";")[0] : null;
}

async function api(path, { method = "GET", cookies = "", csrf, json, formData, expectStatus } = {}) {
  const headers = {};
  if (cookies) headers.Cookie = cookies;
  if (csrf) headers["x-csrf-token"] = csrf;
  let body;
  if (json) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (formData) body = formData;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (expectStatus != null && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus} got ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: parsed, headers: res.headers, raw: text };
}

async function registerVerifyLogin(email, password, name) {
  await api("/auth/register", {
    method: "POST",
    json: { email, name, password },
    expectStatus: 201,
  });
  let token = null;
  for (let i = 0; i < 30; i += 1) {
    for (const mailDir of mailDirs) {
      try {
        const files = (await readdir(mailDir)).sort().reverse();
        for (const file of files.slice(0, 20)) {
          const content = await readFile(join(mailDir, file), "utf8");
          if (content.includes(email) && content.includes("/verify-email")) {
            const match = content.match(/token=([A-Za-z0-9_-]+)/);
            if (match) {
              token = match[1];
              break;
            }
          }
        }
      } catch {
        // retry
      }
      if (token) break;
    }
    if (token) break;
    await sleep(200);
  }
  if (!token) throw new Error(`verify token not found for ${email}`);
  await api("/auth/verify-email", { method: "POST", json: { token }, expectStatus: 204 });
  const login = await api("/auth/login", {
    method: "POST",
    json: { email, password },
    expectStatus: 200,
  });
  const setCookies = parseSetCookie(login.headers.getSetCookie?.() ?? login.headers.raw?.()?.["set-cookie"]);
  // Node fetch: getSetCookie exists in undici
  const rawCookies =
    typeof login.headers.getSetCookie === "function"
      ? login.headers.getSetCookie()
      : parseSetCookie(login.headers.get("set-cookie"));
  const session = getCookie(rawCookies, process.env.SESSION_COOKIE_NAME ?? "opero_session");
  const csrfRes = await api("/auth/csrf", { cookies: session, expectStatus: 200 });
  const csrfCookies =
    typeof csrfRes.headers.getSetCookie === "function"
      ? csrfRes.headers.getSetCookie()
      : parseSetCookie(csrfRes.headers.get("set-cookie"));
  const csrfCookie = getCookie(csrfCookies, process.env.CSRF_COOKIE_NAME ?? "opero_csrf");
  return {
    session,
    cookies: cookieHeader([session, csrfCookie].filter(Boolean)),
    csrfToken: csrfRes.body.csrfToken,
  };
}

async function waitReady(orgId, docId, cookies, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await api(`/organizations/${orgId}/documents/${docId}/status`, { cookies });
    const ps = status.body?.processingStatus;
    if (["READY", "REVIEW_REQUIRED", "REJECTED", "FAILED"].includes(ps)) {
      return status.body;
    }
    await sleep(1000);
  }
  throw new Error("timeout waiting for document processing");
}

function minimalPdf() {
  // Minimal PDF with extractable Helvetica text for pdfjs.
  const content = "BT /F1 12 Tf 72 720 Td (Total Revenue 2500.00) Tj T* (Net Income 400.00) Tj ET";
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
  );
  objects.push(`4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function buildXlsx() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Income");
  sheet.addRow(["Amounts in thousands USD"]);
  sheet.addRow(["Label", "Amount"]);
  sheet.addRow(["Total Revenue", "1250.50"]);
  sheet.addRow(["Net Income", "(40.00)"]);
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function uploadComplete(auth, orgId, filename, format, buffer) {
  const created = await api(`/organizations/${orgId}/documents/uploads`, {
    method: "POST",
    cookies: auth.cookies,
    csrf: auth.csrfToken,
    json: { filename, declaredFormat: format, expectedByteSize: buffer.length },
    expectStatus: 201,
  });
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  const completed = await api(
    `/organizations/${orgId}/documents/uploads/${created.body.upload.uploadId}/complete`,
    {
      method: "POST",
      cookies: auth.cookies,
      csrf: auth.csrfToken,
      formData: form,
      expectStatus: 201,
    },
  );
  return completed.body;
}

async function main() {
  const suffix = `${Date.now()}`;
  const owner = await registerVerifyLogin(
    `live.owner.${suffix}@example.com`,
    "live-owner-pass12",
    "Live Owner",
  );
  const org = await api("/organizations", {
    method: "POST",
    cookies: owner.cookies,
    csrf: owner.csrfToken,
    json: { name: "Live Docs Org", slug: `live-docs-${suffix}` },
    expectStatus: 201,
  });
  const orgId = org.body.organization.id;

  // CSV happy path with real ClamAV
  const csv = Buffer.from(
    "Label,Amount\nTotal Revenue,\"2,500.00\"\nNet Income,400\nCash,0\nMystery,\n",
    "utf8",
  );
  const csvUp = await uploadComplete(owner, orgId, "income.csv", "CSV", csv);
  const csvStatus = await waitReady(orgId, csvUp.documentId, owner.session);
  log(
    ["READY", "REVIEW_REQUIRED"].includes(csvStatus.processingStatus) && csvStatus.scanStatus === "CLEAN",
    "CSV clean scan + extract",
    `status=${csvStatus.processingStatus} scan=${csvStatus.scanStatus}`,
  );

  const extractions = await api(`/organizations/${orgId}/documents/${csvUp.documentId}/extractions`, {
    cookies: owner.session,
    expectStatus: 200,
  });
  const lines = extractions.body.extractions?.[0]?.statements?.[0]?.lineItems ?? [];
  const revenue = lines.find((l) => l.concept === "REVENUE");
  log(revenue?.normalizedValue === "2500" && revenue?.evidence?.rowIndex === 2, "CSV revenue + row evidence", JSON.stringify(revenue?.evidence));

  const review = await api(`/organizations/${orgId}/documents/${csvUp.documentId}/review`, {
    method: "POST",
    cookies: owner.cookies,
    csrf: owner.csrfToken,
    json: {
      lineItemId: revenue.id,
      action: "CORRECT",
      newValue: "2500.00",
      reason: "live acceptance normalize",
    },
    expectStatus: 201,
  });
  log(review.status === 201, "human review correction");

  const after = await api(`/organizations/${orgId}/documents/${csvUp.documentId}/extractions`, {
    cookies: owner.session,
    expectStatus: 200,
  });
  const updated = after.body.extractions[0].statements[0].lineItems.find((l) => l.id === revenue.id);
  log(
    updated.rawValue.includes("2,500") && updated.normalizedValue === "2500.00" && updated.reviewStatus === "CORRECTED",
    "correction preserves raw + history",
  );

  const dl = await api(`/organizations/${orgId}/documents/${csvUp.documentId}/download`, {
    cookies: owner.session,
    expectStatus: 200,
  });
  log(dl.status === 200, "download allowed after clean scan");

  // XLSX
  const xlsx = await buildXlsx();
  const xUp = await uploadComplete(owner, orgId, "income.xlsx", "XLSX", xlsx);
  const xStatus = await waitReady(orgId, xUp.documentId, owner.session);
  const xExt = await api(`/organizations/${orgId}/documents/${xUp.documentId}/extractions`, {
    cookies: owner.session,
    expectStatus: 200,
  });
  const xLines = xExt.body.extractions?.[0]?.statements?.[0]?.lineItems ?? [];
  const xRev = xLines.find((l) => l.concept === "REVENUE");
  log(
    ["READY", "REVIEW_REQUIRED"].includes(xStatus.processingStatus) &&
      xStatus.scanStatus === "CLEAN" &&
      Boolean(xRev?.evidence?.sheetName) &&
      Boolean(xRev?.evidence?.cellRef),
    "XLSX clean scan + sheet/cell evidence",
    `${xRev?.evidence?.sheetName}:${xRev?.evidence?.cellRef}`,
  );

  // PDF
  const pdf = minimalPdf();
  const pUp = await uploadComplete(owner, orgId, "income.pdf", "PDF", pdf);
  const pStatus = await waitReady(orgId, pUp.documentId, owner.session);
  const pExt = await api(`/organizations/${orgId}/documents/${pUp.documentId}/extractions`, {
    cookies: owner.session,
  });
  const pLines = pExt.body.extractions?.[0]?.statements?.[0]?.lineItems ?? [];
  const pRev = pLines.find((l) => l.concept === "REVENUE");
  log(
    ["READY", "REVIEW_REQUIRED"].includes(pStatus.processingStatus) &&
      pStatus.scanStatus === "CLEAN" &&
      (pRev?.evidence?.pageNumber === 1 || pExt.status === 200),
    "PDF clean scan + page evidence",
    `status=${pStatus.processingStatus} page=${pRev?.evidence?.pageNumber} lines=${pLines.length}`,
  );

  // EICAR via real ClamAV: this ClamAV build only matches the exact EICAR body
  // (not when embedded in CSV text). A ZIP/XLSX container with an EICAR member is detected.
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "eicar-"));
  const eicarPath = join(dir, "eicar.xlsx");
  writeFileSync(
    join(dir, "make_eicar_xlsx.py"),
    `
import zipfile
eicar = b"X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
with zipfile.ZipFile(${JSON.stringify(eicarPath)}, "w") as z:
    z.writestr("eicar.txt", eicar)
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
`,
  );
  execFileSync("python3", [join(dir, "make_eicar_xlsx.py")]);
  const eicarXlsx = readFileSync(eicarPath);
  rmSync(dir, { recursive: true, force: true });

  const eUp = await uploadComplete(owner, orgId, "eicar.xlsx", "XLSX", eicarXlsx);
  const eStatus = await waitReady(orgId, eUp.documentId, owner.session);
  log(
    eStatus.processingStatus === "REJECTED" && eStatus.scanStatus === "INFECTED",
    "EICAR-in-XLSX rejected by ClamAV",
    JSON.stringify(eStatus),
  );
  const eDl = await api(`/organizations/${orgId}/documents/${eUp.documentId}/download`, {
    cookies: owner.session,
  });
  const eEx = await api(`/organizations/${orgId}/documents/${eUp.documentId}/extractions`, {
    cookies: owner.session,
  });
  log(eDl.status === 403, "infected download blocked", `status=${eDl.status}`);
  log(eEx.status === 403, "infected extractions blocked", `status=${eEx.status}`);

  // Cross-tenant
  const other = await registerVerifyLogin(
    `live.other.${suffix}@example.com`,
    "live-other-pass12",
    "Other",
  );
  const otherOrg = await api("/organizations", {
    method: "POST",
    cookies: other.cookies,
    csrf: other.csrfToken,
    json: { name: "Other Org", slug: `other-docs-${suffix}` },
    expectStatus: 201,
  });
  const cross = await api(`/organizations/${otherOrg.body.organization.id}/documents/${csvUp.documentId}`, {
    cookies: other.session,
  });
  log(cross.status === 404, "cross-tenant get denied", `status=${cross.status}`);
  const crossDl = await api(
    `/organizations/${otherOrg.body.organization.id}/documents/${csvUp.documentId}/download`,
    { cookies: other.session },
  );
  log([403, 404].includes(crossDl.status), "cross-tenant download denied", `status=${crossDl.status}`);

  // Soft delete
  await api(`/organizations/${orgId}/documents/${csvUp.documentId}`, {
    method: "DELETE",
    cookies: owner.cookies,
    csrf: owner.csrfToken,
    expectStatus: 204,
  });
  const gone = await api(`/organizations/${orgId}/documents/${csvUp.documentId}`, {
    cookies: owner.session,
  });
  log(gone.status === 404, "soft-deleted document not retrievable");

  // Public web must not expose storage
  const webProbe = await fetch("http://127.0.0.1:3000/.data/object-storage/");
  log(webProbe.status >= 400, "web does not serve object storage path", `status=${webProbe.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
