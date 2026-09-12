// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Validates bundled examples against the canonical JSON Schema (schema/**).
// Run: bun run validate
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../../..", import.meta.url).pathname;
const schema = await Bun.file(`${root}schema/addonium.schema.json`).json();
const entrySchema = await Bun.file(`${root}schema/registry-entry.schema.json`).json();

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validate = ajv.compile(schema);
const files = ["open-addon.json", "locked-url-token.json", "locked-module.json", "locked-community.json"];
let failed = false;
for (const f of files) {
  const data = await Bun.file(`${root}packages/addonium/examples/${f}`).json();
  const ok = validate(data);
  console.log(`${ok ? "PASS" : "FAIL"} examples/${f}`);
  if (!ok) {
    failed = true;
    for (const e of validate.errors ?? []) console.log(`  ${e.instancePath || "/"} ${e.message}`);
  }
}

// Registry entry smoke check (§12.4).
const validateEntry = ajv.compile(entrySchema);
const entry = {
  id: "club.example.openradio",
  name: "Open Radio",
  manifestUrl: "https://openradio.example.com/manifest.json",
  type: "open",
};
console.log(`${validateEntry(entry) ? "PASS" : "FAIL"} registry-entry smoke`);
if (!validateEntry(entry)) {
  failed = true;
  console.log(validateEntry.errors);
}
process.exit(failed ? 1 : 0);
