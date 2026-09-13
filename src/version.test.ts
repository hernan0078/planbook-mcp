import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERVER_VERSION } from "./version.js";

test("matches the MCP server version to the package version", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };

  assert.equal(SERVER_VERSION, packageJson.version);
});
