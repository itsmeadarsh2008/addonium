# addonium

An open-source standard addon-module schema for all music clients. Gives more power and control to the community addon author.

- **Spec:** `schema/SCHEMA.md` (v1.0.0-draft) + machine-readable `schema/addonium.schema.json`
- **Helpers:** `packages/addonium/` — runtime-agnostic TypeScript (`@addonium/helpers`)
- **Homepage:** `homepage/` — Bun server that renders the full spec text plus an interactive playground (React optional, static fallback included)
- **Security:** see `SECURITY.md`

## Quickstart

```bash
bun install
bun test          # helpers (bun:test)
bun run check     # typecheck all workspaces
bun run validate  # examples vs JSON Schema
bun run build     # build helpers + homepage bundle
bun run dev       # homepage with hot reload → http://localhost:3000
bun run clean     # remove build output
```

Rebuild the homepage React bundle as you edit (`dev:client` watches `src/`):

```bash
bun run --filter 'addonium-homepage' dev:client
```

Validate a manifest against the schema:

```bash
bunx ajv-cli validate -s schema/addonium.schema.json -d packages/addonium/examples/open-addon.json
```

Use the helpers:

```ts
import { parseManifest, joinBase, authForRequest, redactUrl } from "@addonium/helpers";

const manifest = parseManifest(await Bun.file("manifest.json").json());
const url = joinBase(manifest.baseUrl!, "/search?q=starlight");
const { headers } = authForRequest(manifest, process.env["ADDON_TOKEN"]);
console.log("fetching", redactUrl(url)); // never log raw tokenized URLs
```

## License

Dual-licensed, split by path:

- `schema/**` (spec text, schemas, spec examples): **CC0-1.0**, see `LICENSE-CC0`.
- Everything else (code, helpers, tests, homepage): **Apache-2.0**, see `LICENSE`.
