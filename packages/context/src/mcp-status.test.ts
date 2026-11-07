import assert from "node:assert/strict";
import { test } from "node:test";

import { shortError } from "./mcp-status.ts";

test("a plain error stays, on one line", () => {
  assert.equal(
    shortError("Error POSTing to endpoint: no available server\n"),
    "Error POSTing to endpoint: no available server",
  );
});

test("an HTML page is named by its title", () => {
  const page = "<!DOCTYPE html>\n<html><head><title>Not Found</title></head><body>…</body></html>";
  assert.equal(
    shortError(`Error POSTing to endpoint: ${page}`),
    'Error POSTing to endpoint: an HTML page, "Not Found"',
  );
});

test("a long error is cut", () => {
  assert.equal(shortError("x".repeat(500))?.length, 240);
  assert.equal(shortError(undefined), undefined);
});
