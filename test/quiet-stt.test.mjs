import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../web/app.js",import.meta.url),"utf8");
test("idle STT sleep and wake remain present",()=>{
  assert.ok(source.includes("const SLEEP_AFTER_MS=30000"));
  assert.ok(source.includes("const PRE_ROLL_CHUNKS=30"));
  assert.ok(source.includes("maybeWake()"));
  assert.ok(source.includes("isSleeping(){return cloudSleeping;}"));
});
