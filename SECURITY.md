# Security Policy

## Scope

Addonium is a specification plus small reference helpers — there is no
central Addonium server, account system, or gatekeeper (spec §1, §12.4).

- **Spec text** (`schema/**`): CC0-1.0, see `LICENSE-CC0`.
- **Code** (helpers, tests, homepage): Apache-2.0, see `LICENSE`.

Security reports are welcome for:

1. The reference helpers in `packages/addonium/src/` (e.g. auth handling
   that leaks tokens, validation bypass, unsafe URL joining).
2. Spec-level guidance that, if followed literally, creates a vulnerability
   (e.g. ambiguous sandboxing, token-handling, or DRM-boundary language).

Out of scope: individual third-party addons/servers built with the spec,
and hosting infrastructure you run yourself.

## Rules for implementers (normative summary of spec §13–§14)

- **HTTPS required** for all HTTP addons except `localhost`/LAN development.
- **Never log or forward tokenized URLs/keys.** `url-token` credentials live
  in the URL path (§7); hosts must not include them in analytics, crash
  reports, or requests to any other addon (§13). Use `redactUrl()` from
  `@addonium/helpers` before logging.
- **Sandbox compiled modules** (§9.3, §9.5). A module is arbitrary code:
  run it in an isolated context with no ambient filesystem/storage access,
  grant a network binding only after showing the user its declared `id`,
  `author`, and `version`, and always call `unlock(key)` first — falsy/throw
  means "not installed", never partial access.
- **Allowlist is courtesy, not crypto** (§14). `clients.allowlist` relies on
  honest `clientId`s; authors needing a hard guarantee must combine it with
  `auth` (§6), never `clients` alone.
- **Never invent data.** `resolve` / `resolve-isrc` answers are trusted
  blindly — return `null`/`404` instead of guessing (§14).
- **DRM license endpoints are a separate trust boundary** (§14). Do not
  forward addon credentials to `drm.licenseUrl` unless the addon explicitly
  lists them in `drm.headers`; never cache license responses across users.
- **CORS:** web-facing addons should send `Access-Control-Allow-Origin` only
  for expected origins.

## Reporting a vulnerability

- **Do not open a public issue** for anything that could harm live addons.
- Contact: open a **private security advisory** on GitHub, or email the
  maintainer listed in `package.json` / repo profile.
- Include: affected file(s) and version/commit, redacted repro (use
  `{token}` placeholders — never send real tokens/keys), impact assessment.
- Response target: acknowledgement within 72 hours; fix or mitigation plan
  within 14 days for confirmed High/Critical issues.

## Supported versions

| Component        | Supported           |
| ---------------- | ------------------- |
| Spec `1.0.x-draft`| Yes (current draft) |
| `@addonium/helpers` latest | Yes          |
| Older prereleases| Best-effort         |

## Disclosure

We follow coordinated disclosure: fix first, then publish an advisory and
credit the reporter (unless anonymity is requested). Spec-language fixes
land as a spec patch plus updated helpers/tests demonstrating the safe
pattern.
