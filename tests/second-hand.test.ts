import assert from "node:assert/strict";
import test from "node:test";
const helperPath = "../types/secondHand.ts";
const { safeCsvCell, secondHandCsv, isSecondHandHoldComplete, secondHandErrorMessage }: typeof import("../types/secondHand") = await import(helperPath);

test("CSV neutralises spreadsheet formulas, including whitespace/control prefixes", () => {
  for (const value of ["=HYPERLINK(\"https://example.invalid\")", "+SUM(1,2)", "-1+2", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\u0000=1+1"]) {
    assert.ok(safeCsvCell(value).startsWith('"\''), `Must neutralise ${JSON.stringify(value)}`);
  }
  assert.equal(safeCsvCell('Device, "A"'), '"Device, ""A"""');
});

test("CSV exports heterogeneous records with quoted fields and stable columns", () => {
  assert.equal(secondHandCsv([{ reference: "SH-1", amount: 120 }, { reference: "SH-2", condition: "fair\nchecked" }]), '"reference","amount","condition"\r\n"SH-1","120",""\r\n"SH-2","","fair\nchecked"');
  assert.equal(secondHandCsv([]), "");
});

test("hold display is fail-closed for invalid timestamps and exact at server boundary", () => {
  const hold = { hold_until: "2026-10-29T08:00:00.000Z" };
  const boundary = Date.parse(hold.hold_until);
  assert.equal(isSecondHandHoldComplete(hold, boundary - 1), false);
  assert.equal(isSecondHandHoldComplete(hold, boundary), true);
  assert.equal(isSecondHandHoldComplete({ hold_until: "bad-value" }, boundary), false);
});

 test("database errors expose only vetted validation messages and never raw identity details", () => {
  assert.equal(secondHandErrorMessage({ code: "22023", message: "Only verified adults (18 or older) may trade." }), "Only verified adults (18 or older) may trade.");
  assert.equal(secondHandErrorMessage({ code: "42501", message: "Owner approval is required." }), "Owner approval is required.");
  assert.match(secondHandErrorMessage({ code: "22023", message: "Invalid or missing field: id_copy_reference" }), /identity|id copy reference/);
  for (const code of ["22023", "42501", "P0001", "23505", "22P02"]) {
    const response = secondHandErrorMessage({ code, message: 'Invalid ID 9001015009087 for person Example Person' });
    assert.ok(!response.includes("9001015009087"));
    assert.ok(!response.includes("Example Person"));
  }
  assert.match(secondHandErrorMessage({ message: "AbortError: timeout" }), /result is uncertain/);
});
