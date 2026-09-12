# `@addonium/helpers`

Runtime-agnostic TypeScript helpers for the [Addonium spec](../../schema/SCHEMA.md).
Zero runtime dependencies. Works under Bun, Node 18+, and browsers.

## Install

```bash
bun add @addonium/helpers
```

## Use

```ts
import {
  parseManifest, supportsResource,      // manifest (§5)
  joinBase, withSettings, redactUrl,    // urls (§7, §8.8)
  authForRequest,                       // auth (§6.2)
  isClientAllowed,                      // allowlist (§10)
  errorFromStatus,                      // errors (§15)
  shouldCheckForUpdate,                 // updates (§12)
  unlockModule,                         // modules (§9)
} from "@addonium/helpers";
```

## Notes

- Stream `codec`/`container`/`manifest`/`format` are free-text hints (§8.2.1), never enums.
- Tokenized `baseUrl`s are opaque — helpers prepend, never parse (§7).
- `signed` auth is author-defined; helpers attach nothing (pass secrets out-of-band).
- Module sandboxing is host-specific (§9.5) — helpers only validate shape and enforce `unlock()`-first order.
- Never log raw tokenized URLs — use `redactUrl()` (§13–§14).
- Authors may demand *anything* out-of-band (Discord membership, supporter
  role, purchase) via `auth.requirements` — use `accessRequirements()` to
  display it; hosts never enforce it (§6.2–§6.3).

License: Apache-2.0 (code). The spec text it mirrors is CC0-1.0.
