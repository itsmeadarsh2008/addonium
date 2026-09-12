# Addonium

**A freedom-first addon/module schema for content applications.**

`Version: 1.0.0-draft` · `Status: Draft` · `Spec text: CC0-1.0 (see LICENSE-CC0)` · `Code: Apache-2.0 (see LICENSE)`

Addonium is a specification for building, distributing, authenticating, and
updating **addons** - external content sources that a host application
(a music player, an audiobook app, a media browser, anything episodic) can
install and talk to over HTTP, or load in-process as a compiled module.

It borrows the endpoint shape of Eclipse Music and BeatBoss's addon
systems, and the "module object" contract of 8SPINE's module engine, and
merges them into one schema with a single governing idea:

> **The addon author is sovereign over their addon.** They decide who can run
> it, whether it needs a login, whether it remembers anyone, and how it is
> shaped. Nothing in this spec is designed to let a host app, a registry, or
> another user bypass an author's access controls. "Freedom" here means
> *freedom for the author to control distribution and access* - not freedom
> for a client to abuse, scrape, or unlock an addon against the author's
> wishes.

No Cloudflare Workers, no mandatory backend-as-a-service, no vendor lock-in.
An addon is either a normal HTTPS server you already know how to run, or a
single portable script file. That's it.

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Terminology](#2-terminology)
3. [Addon Types](#3-addon-types)
4. [Distribution Formats](#4-distribution-formats)
5. [The Manifest](#5-the-manifest)
6. [Authentication & Access Control](#6-authentication--access-control)
7. [Tokenized URLs](#7-tokenized-urls)
8. [HTTP API Reference](#8-http-api-reference)
9. [Compiled Module Contract](#9-compiled-module-contract-locked-addons-only)
10. [Client Allowlisting](#10-client-allowlisting)
11. [Optional Data Storage](#11-optional-data-storage)
12. [Updates, Versioning & CI](#12-updates-versioning--ci)
13. [Host Application Responsibilities](#13-host-application-responsibilities)
14. [Security Considerations](#14-security-considerations)
15. [Error Handling](#15-error-handling)
16. [JSON Schema](#16-json-schema)
17. [Example Manifests](#17-example-manifests)
18. [Capability Matrix](#18-capability-matrix)
19. [FAQ](#19-faq)

---

## 1. Philosophy

Addonium exists to make three things true at once:

| Principle | Meaning |
|---|---|
| **Author sovereignty** | The author who wrote the addon decides its access model: open to everyone, locked behind a token, restricted to specific client apps, or all three at once. The host app must respect this and must not offer a way to route around it (no "force unlock," no stripping auth headers, no re-hosting a locked addon's stream without the author's key). |
| **Zero mandatory infrastructure** | No addon needs Cloudflare Workers, no addon needs a database, no addon needs to talk to any Addonium-run server. A single static `manifest.json` file is a valid, complete Open Addon. |
| **Progressive trust** | Everything past the bare minimum (search + stream) is optional. An addon declares what it supports via `resources`; a host falls back gracefully when a capability is absent. Nothing is required beyond what the author chooses to implement. |

Addonium is a **specification**, not a service. There is no central
Addonium server that addons must register with, phone home to, or be
approved by. A registry/index (§12.4) is an *optional convenience*, not a
gatekeeper.

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Addon** | A content source implementing this spec - either an HTTP server or a compiled module. |
| **Host** | The application that installs and calls addons (player, reader, browser, etc.). |
| **Manifest** | The `manifest.json` describing an addon's identity and capabilities. |
| **Open Addon** | An addon with no authentication requirement. Anyone with the URL can use it. |
| **Locked Addon** | An addon that requires a token/key to be used. Distributed as a tokenized URL and/or a compiled module. |
| **Compiled Module** | A single-file, portable script implementing the Addonium module contract (§9), optionally encrypted/obfuscated, unlocked with a **key**. |
| **Base URL** | The root URL a host uses to reach an HTTP addon, which may itself embed a token segment. |
| **Client** | A specific host application, build, or installation attempting to use an addon. Identified by a `clientId` it presents. |
| **Allowlist** | An optional, author-controlled list of `clientId`s permitted to use a Locked Addon. |

---

## 3. Addon Types

Addonium defines exactly two addon types. Every addon is one or the other -
there is no third "partially locked" state; partial restriction is expressed
through `auth.required: false` + `allowlist` (§10), not through a new type.

### 3.1 Open Addon

- `auth.required` is `false` (or the `auth` block is absent entirely).
- No token, no key, no login. Anyone who has the addon's URL/manifest can
  use every resource it exposes.
- May still declare a `clients.allowlist` (§10) to restrict *which apps*
  (not which users) may call it - e.g. "only my own official client."
- Distributed as: **manifest.json only.**

### 3.2 Locked Addon

- `auth.required` is `true`.
- Requires proof of authorization on every call: a bearer token, a signed
  tokenized URL segment, and/or a decryption key for a compiled module.
- The author decides *what* "authorized" means - a paid license key, an
  invite code, a per-user token they issued manually, anything. Addonium
  does not prescribe an identity provider.
- Whether a Locked Addon persists any user data is **optional and defaults
  to `false`** (§11). When data is stored, correlating identifiers travel
  **encrypted inside the URL itself**, not in a server-side user table the
  spec mandates.
- Distributed as: **manifest.json with a tokenized `baseUrl`**, and/or a
  **compiled module + key**.

---

## 4. Distribution Formats

Addonium addons travel in exactly two file shapes:

| Format | Used by | Contains |
|---|---|---|
| `manifest.json` | Open **and** Locked addons | Identity, capabilities, and (for Locked) either an `auth` block describing how to obtain/attach a token, or a pre-tokenized `baseUrl`. |
| **Compiled module** (`.aium` file, or a `.js`/`.mjs` bundle) | **Locked addons only** | A single portable script implementing the module contract (§9), distributed alongside (never inside) a **key** the host uses to decrypt/authorize it at load time. |

A Locked Addon MAY offer both simultaneously - e.g. a hosted API for casual
use and a compiled module for offline/embedded use - as long as both honor
the same `auth`/`allowlist` rules.

An addon is installed by a host in one of these ways:

1. **URL install (HTTP addons):** user pastes a base URL or a
   `manifest.json` URL. Works for both Open and Locked (tokenized) addons.
2. **File install (compiled modules):** user imports a `.aium` file plus,
   for Locked modules, a separate key (pasted, scanned as QR, or imported
   as a small `.aiumkey` file). The key is **never bundled inside** the
   module file.
3. **Registry install (optional):** host resolves an `addonium://` URI or
   an entry from an index (§12.4) to one of the above.

---

## 5. The Manifest

Every addon - Open or Locked, HTTP or compiled - has exactly one canonical
manifest. For HTTP addons it is served at `GET /manifest.json` (or
`GET /{token}/manifest.json` for tokenized addons). For compiled modules it
is embedded as the `manifest` export (§9.2) and, ideally, also published
standalone so hosts can preview before importing the module file.

```json
{
  "addonium": "1.0",
  "id": "club.example.myaddon",
  "name": "My Content Source",
  "version": "1.4.2",
  "description": "Streams episodes from Example Network.",
  "author": {
    "name": "Jane Author",
    "url": "https://example.com",
    "contact": "jane@example.com"
  },
  "icon": "https://example.com/icon.png",
  "contentType": "music",
  "types": ["track", "album", "artist", "playlist"],
  "resources": ["search", "stream", "catalog", "lyrics", "settings", "resolve"],
  "baseUrl": "https://api.example.com/v1",
  "distribution": ["manifest", "module"],
  "type": "open",
  "auth": null,
  "clients": null,
  "storesData": false,
  "update": {
    "manifestUrl": "https://example.com/.well-known/addonium/manifest.json",
    "checkInterval": 86400
  },
  "repository": "https://github.com/example/myaddon",
  "license": "MIT"
}
```

### 5.1 Core fields

| Field | Type | Required | Description |
|---|---|---|---|
| `addonium` | String | **Yes** | Spec version this manifest targets, e.g. `"1.0"`. Hosts should reject manifests with a major version they don't understand. |
| `id` | String | **Yes** | Reverse-domain unique identifier, e.g. `com.example.myaddon`. Stable across versions - this is the addon's identity, not its display name. |
| `name` | String | **Yes** | Display name. |
| `version` | String | **Yes** | SemVer (`MAJOR.MINOR.PATCH`). |
| `description` | String | No | Short description. |
| `author` | Object \| String | No | `{ name, url, contact }` or a plain string. |
| `icon` | String | No | Square icon URL (PNG/JPEG/SVG), ≥128×128 recommended. |
| `contentType` | String | No | `"music"` (default), `"audiobook"`, `"podcast"`, `"video"`, `"generic"`. Drives host player-UI mode. |
| `types` | Array\<String\> | No | Content types the addon can return: `track`, `album`, `artist`, `playlist`, `episode`, `file`. |
| `resources` | Array\<String\> | No | Capabilities implemented - see [§8](#8-http-api-reference)/[§18](#18-capability-matrix). |
| `baseUrl` | String | Conditional | Root URL for HTTP addons. **Required** unless `distribution` is `["module"]` only. May include a token segment for Locked addons (§7) - either an already-tokenized URL or a URI template with a `{token}` placeholder (see §17.2). |
| `distribution` | Array\<String\> | No | Which formats this addon ships as: any of `"manifest"`, `"module"`. Defaults to `["manifest"]`. |
| `type` | String | **Yes** | `"open"` or `"locked"`. Determines whether `auth` is meaningful. |
| `auth` | Object \| `null` | Conditional | **Required** (non-null) when `type` is `"locked"`. See §6. |
| `clients` | Object \| `null` | No | Allowlist configuration. See §10. Optional for both addon types. |
| `storesData` | Boolean | No | Whether the addon persists any per-user data server-side. Defaults to **`false`**. |
| `update` | Object | No | `{ manifestUrl, checkInterval }` - where a host can re-fetch the latest manifest and how often (seconds). See §12. |
| `settings` | Array | No | User-configurable fields, forwarded as query params on every call. Same shape as Eclipse's `settings` (see §8.8). |
| `catalogs` | Array | No | Declared home/browse rows. See §8.9. |
| `repository` / `homepage` / `license` | String | No | Metadata for registries and humans. |

### 5.2 `resources` values

`search` · `stream` · `catalog` · `lyrics` · `library` · `isrc` ·
`resolve` · `settings` · `video` - see the full [capability matrix](#18-capability-matrix).
An addon implements only what it wants; unimplemented resources are simply
absent from the array, and hosts fall back to other installed addons or
built-in providers.

---

## 6. Authentication & Access Control

Authentication in Addonium is **transport-level and author-defined**.
There is no mandated identity provider, OAuth flow, or Addonium account
system. The spec only standardizes *how the token gets from the host to the
addon* and *how the addon states it needs one* - never *who* is allowed to
have one.

### 6.1 Open Addon (`type: "open"`)

`auth` is `null`. Every request the host makes is unauthenticated. This is
the BeatBoss/Eclipse default today, and remains the zero-friction path for
public content sources.

### 6.2 Locked Addon (`type: "locked"`)

`auth` describes how a client attaches proof of authorization. Exactly one
`method` is chosen per addon:

```json
{
  "auth": {
    "method": "bearer",
    "header": "Authorization",
    "scheme": "Bearer",
    "tokenGrant": "manual",
    "grantUrl": "https://example.com/get-token",
    "required": true
  }
}
```

| `method` | How it works |
|---|---|
| `"bearer"` | Host sends `Authorization: Bearer <token>` on every request. Token is obtained out-of-band (`grantUrl`, license purchase, invite, etc.) and pasted into the host once. |
| `"url-token"` | The token is embedded directly in the **base URL path** (§7), e.g. `https://api.example.com/{token}/search`. No special header handling needed by the host - the whole URL *is* the credential. This is the simplest option and matches BeatBoss's and Eclipse's existing convention. |
| `"api-key"` | Host sends the token as a query parameter or custom header named in `paramName`/`header`. |
| `"signed"` | Every request must be signed (e.g. HMAC over method+path+timestamp) using a secret the addon issued. For authors who want replay protection without running a session store. |
| `"module-key"` | Only applicable to compiled modules (§9) - the module itself won't execute/decrypt without the correct key. Not used for plain HTTP addons. |

`tokenGrant` documents (for humans, not enforced by the spec) how a user
gets a token in the first place: `"manual"` (author hands it out),
`"self-serve"` (a `grantUrl` the host can open), or `"none"` (pre-baked into
distributed URLs, e.g. a paid Gumroad download that already contains a
personal tokenized link).

`requirements` lists the author's own out-of-band conditions for granting
access - anything they choose, e.g. joining a Discord server, holding a
supporter role, or showing a purchase receipt. Each entry is a plain string
or a `{ label, url?, detail? }` object. It is **display-only**: hosts
surface it at install time (§13) and never enforce it. What "authorized"
means stays entirely between the author and the user:

```json
{
  "auth": {
    "method": "url-token",
    "tokenGrant": "manual",
    "requirements": [
      {
        "label": "Join the Example Discord to request a token",
        "url": "https://discord.gg/example",
        "detail": "Ask in #addon-access; the author issues personal tokenized links."
      }
    ]
  }
}
```

### 6.3 What the spec does **not** do

Addonium never specifies a canonical login screen, payment processor, or
account database. This is intentional - it's the part of "freedom" that
matters most: an author can gate their addon with a $2 Ko-fi supporter
role, a Discord invite check, a hardware dongle, or nothing weirder than a
password, and none of that needs to be legible to the spec.

---

## 7. Tokenized URLs

The `"url-token"` auth method is the recommended default for Locked HTTP
addons because it requires zero client-side auth logic - the base URL
already carries everything.

```
https://api.example.com/t/eyJhbGciOiJIUzI1NiJ9.eyJ1IjoiOTkyIn0.9f3a...
                            └──────────────── token segment ────────────┘
GET  /t/{token}/manifest.json
GET  /t/{token}/search?q=...
GET  /t/{token}/stream/abc123
```

- The host treats everything after the domain as an opaque prefix - it
  never parses or strips the token, it just always prepends the full
  `baseUrl` it was given.
- Tokens SHOULD be self-contained and verifiable server-side (e.g. a signed
  JWT or HMAC'd blob) so the addon's server needs **no session store** to
  validate them - consistent with "no Cloudflare Workers, no mandatory
  backend."
- If the addon optionally stores per-user data (§11), the same token
  segment doubles as the encrypted user-correlation key - see §11.2.
- Rotating/revoking access is just re-issuing a new token segment; old
  URLs stop resolving whenever the author's server chooses to reject them.

### 7.1 Compiled-module equivalent

For compiled modules, the analogous artifact is a small **key file**
(`.aiumkey`) or key string, distributed *separately* from the module
script:

```
my-addon.aium        ← the module code (safe to share publicly)
my-addon.aiumkey     ← per-user key (keep private; unlocks the module)
```

The module refuses to produce real results (or refuses to execute at all,
depending on the author's chosen strictness - see §9.4) without a valid
key supplied by the host at load time.

---

## 8. HTTP API Reference

All endpoints below apply to HTTP addons (Open or Locked). For Locked
addons, prefix every path with the token segment per §7, or send the
configured header/param per §6.2.

| Endpoint | Required | Resource flag | Purpose |
|---|---|---|---|
| `GET /manifest.json` | **Yes** | - | Addon identity & capabilities |
| `GET /search?q=` | recommended | `search` | Search results |
| `GET /stream/:id` | recommended | `stream` | Resolve a playable URL |
| `GET /album/:id` | No | `catalog` | Album detail + tracklist |
| `GET /artist/:id` | No | `catalog` | Artist detail + top tracks |
| `GET /playlist/:id` | No | `catalog` | Playlist detail + tracks |
| `GET /lyrics?artist=&title=` | No | `lyrics` | Lyrics (plain or LRC) |
| `GET /resolve-isrc?isrc=` | No | `isrc` | Exact id lookup by ISRC/UPC-equivalent |
| `GET /resolve?title=&artist=&durationMs=` | No | `resolve` | Best-match id for a generated queue item |
| `GET /catalog/:rowId?skip=` | No | `catalog` | A declared home/browse row, paged by 100 |
| `GET|POST|DELETE /libraries...` | No | `library` | Cross-device library sync |
| Settings values | - | `settings` | Appended as query params on **every** call |

Response shapes below mirror the Eclipse/BeatBoss conventions so existing
addon authors can port with near-zero changes.

### 8.1 `GET /search?q=&limit=`

```json
{
  "tracks": [
    {
      "id": "track_101",
      "title": "Starlight Harmony",
      "artist": "Echo Voyager",
      "album": "Celestial Echoes",
      "duration": 240,
      "artworkURL": "https://example.com/star.jpg",
      "isrc": "USRC12345678",
      "format": "mp3",
      "streamURL": null
    }
  ],
  "albums": [],
  "artists": [],
  "playlists": []
}
```

All four arrays are optional - return only what you have. `streamURL`, if
present, lets the host skip the `/stream/:id` round-trip entirely.

### 8.2 `GET /stream/:id`

```json
{
  "url": "https://cdn.example.com/audio/track_101.mp3",
  "format": "mp3",
  "quality": "320kbps",
  "codec": "mp3",
  "container": "mp3",
  "manifest": "none",
  "expiresAt": 1767225600,
  "encrypted": false
}
```

| Field | Notes |
|---|---|
| `url` | **Required.** Direct HTTP(S) link to the audio/video/manifest resource. No HTML pages, no login walls. |
| `format` | Free-text container/file hint, e.g. `mp3`, `flac`, `aac`, `m4a`, `opus`, `ogg`, `wav`, `m3u8`, `mpd`. |
| `codec` / `container` / `manifest` | Optional routing hints so the host doesn't have to probe the file - see [§8.2.1](#821-streaming-formats-are-open-ended) below. |
| `quality` | Free-text, e.g. `"320kbps"`, `"lossless"`, `"Dolby Atmos"` |
| `expiresAt` | Unix timestamp; host re-fetches `/stream/:id` after this. |
| `chapters` | Optional array of `{ title, startTime }` for audiobook/podcast content. |
| `drm` | Optional object describing content protection on the stream - see §8.2.1. Omit entirely for unprotected content. |
| `video` | Optional object per Eclipse's video model - `{ url, mimeType, muxed, width, height, renditions[] }` - for addons with visual content. |

#### 8.2.1 Streaming formats are open-ended

The `url` an addon returns is not limited to a flat audio file. Addonium
places **no ceiling** on what a stream can be - the fields below are
*hints*, not a whitelist. A host is expected to fall back to sniffing the
resource (by extension, `Content-Type`, or magic bytes) when it receives a
`codec`/`container`/`manifest` value it doesn't recognize, rather than
rejecting the stream outright.

Supported today, non-exhaustively:

- **Plain files**: `mp3`, `aac`, `flac`, `alac`, `wav`, `ogg`/`vorbis`, `opus`.
- **Adaptive manifests**: `manifest: "hls"` for an `.m3u8` (played via
  native `AVPlayer`/`ExoPlayer` support or `hls.js`), `manifest: "dash"`
  for an `.mpd` (played via `dash.js`, Shaka Player, etc.).
- **Multi-channel / spatial audio**: `codec` values like `eac3`,
  `eac3_joc` (Dolby Digital Plus / Dolby Atmos-in-JOC), `ac3`, `truehd`,
  `dts`. These typically ride inside an HLS or DASH manifest rather than a
  bare file - set `manifest` accordingly and let `codec` carry the
  finer-grained detail.
- **Low-latency / chunked-transfer live streams**: `manifest: "hls"` with
  a live (non-VOD) playlist, or a raw chunked `url` with no manifest at
  all - a host should treat an endless/growing response as valid.
- **DRM-protected streams** (optional, and orthogonal to §6's addon-level
  auth): when present, a `drm` object tells the host which system and key
  endpoint to use, e.g.:

  ```json
  {
    "url": "https://cdn.example.com/stream.mpd",
    "manifest": "dash",
    "drm": {
      "system": "widevine",
      "licenseUrl": "https://license.example.com/widevine",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
  ```
  `system` is free-text (`widevine`, `playready`, `fairplay`, `clearkey`,
  or anything a host's player happens to support); a host that can't
  fulfill the requested DRM system should skip the stream rather than
  attempt playback.
- **Anything else**: an addon may return a codec/container/manifest
  combination not listed here at all. The contract is only that `url`
  points at something a modern media pipeline (native player, `hls.js`,
  `dash.js`, Shaka Player, or similar) can be handed directly - Addonium
  itself has no opinion on which formats exist, only on how a stream
  response is shaped once you've picked one.

Because of this, `codec`, `container`, `manifest`, and `format` are
intentionally typed as free-text strings in the [JSON Schema](#16-json-schema)
rather than closed enums - new formats (a future codec, a new manifest
type) are automatically valid without a spec revision.

### 8.3 `GET /album/:id` · `GET /artist/:id` · `GET /playlist/:id`

Same detail-object shapes as Eclipse's catalog endpoints: an entity object
plus a `tracks` (or `topTracks`/`albums`) array of the same track shape
used in `/search`.

### 8.4 `GET /lyrics?artist=&title=`

Returns either a raw string (LRC recommended) or `{ "lyrics": "..." }`.

### 8.5 `GET /resolve-isrc?isrc=`

```json
{ "trackId": "track_101" }
```
Return `404` or `{ "trackId": null }` if unknown. Never guess - a wrong
answer here is treated as authoritative by the host.

### 8.6 `GET /resolve?title=&artist=&durationMs=&isrc=`

```json
{ "item": { "id": "track_101", "type": "track", "title": "...", "artist": "..." } }
```
Return `{ "item": null }` with `200` when there's no confident match.

### 8.7 Library Sync (`resources: ["library"]`)

| Method | Path | Body |
|---|---|---|
| GET | `/libraries` | - |
| POST | `/libraries` | `{ "name": "..." }` |
| GET | `/libraries/:id` | - |
| POST | `/libraries/:id/sync` | `{ "tracks": [...] }` |
| POST | `/libraries/:id/remove` | `{ "trackId": "..." }` |
| POST | `/libraries/:id/update` | `{ "name": "..." }` |
| DELETE | `/libraries/:id` | - |

Library ID `1` is reserved for Favourites and cannot be renamed/deleted.
Library sync is inherently a "stores data" feature - an addon exposing it
SHOULD set `"storesData": true` (§11) so hosts can disclose that to users.

### 8.8 Settings (`resources: ["settings"]`)

Declared in the manifest:

```json
{
  "settings": [
    {
      "key": "quality",
      "type": "select",
      "label": "Audio quality",
      "default": "high",
      "options": [
        { "value": "high", "label": "High (320kbps)" },
        { "value": "low", "label": "Low (96kbps)" }
      ]
    },
    { "key": "preferOpus", "type": "toggle", "label": "Prefer Opus", "default": true }
  ]
}
```

Field types: `select` (with `options`), `toggle`, `text` (`maxLength`,
`placeholder`), `number` (`min`, `max`, `step`). Values are appended as
query parameters, using the `key` verbatim, on **every** request:

```
GET /t/{token}/stream/abc123?quality=high&preferOpus=true
```

### 8.9 Catalogs (`resources: ["catalog"]`, `catalogs` in manifest)

```json
{ "catalogs": [ { "id": "top", "type": "track", "name": "Top Tracks" } ] }
```
```
GET /catalog/top?skip=0
{ "items": [ { "id": "...", "type": "track", "title": "...", "artist": "..." } ] }
```
`skip` is always a multiple of 100; returning fewer than 100 items signals
the end of that row.

---

## 9. Compiled Module Contract (Locked addons only)

A compiled module is a single script - plain JS, or a bundled/minified/
lightly-obfuscated variant - that a host loads **in-process** instead of
calling over HTTP. This is the shape 8SPINE popularized. In Addonium it is
reserved for Locked Addons because it's the distribution format best
suited to shipping something a bare URL can't casually leak: the code can
require a key before it will do anything useful.

### 9.1 File layout

```
myaddon.aium         # the module - plain text, may be minified. Safe to share.
myaddon.aiumkey      # the unlock key - one per license/user. Keep private.
myaddon.manifest.json  # OPTIONAL standalone copy of the manifest for preview
```

`.aium` files are just JavaScript with a documented export shape (below).
The extension exists purely so hosts and file pickers recognize them; a
host MAY equally accept a plain `.js`/`.mjs` file.

### 9.2 Module shape

```javascript
export const ADDONIUM_MODULE = {
  // -- Identity (mirrors manifest.json; used if no standalone manifest ships) --
  manifest: {
    addonium: "1.0",
    id: "com.example.locked-source",
    name: "Example Locked Source",
    version: "2.0.0",
    type: "locked",
    resources: ["search", "stream"],
    auth: { method: "module-key" }
  },

  // -- Lifecycle --
  // Called once at load time with the key the host obtained from the user
  // (pasted string, .aiumkey file contents, or QR-scanned payload).
  // Must return true/false (or throw) - this is the module's own gate,
  // not something the host can bypass.
  async unlock(key, context) {
    return verifyKeyAgainstSelf(key); // author-defined; opaque to host
  },

  // -- Core methods (same semantics as the HTTP endpoints in §8) --
  async searchTracks(query, limit, settings) { /* ... */ },
  async getTrackStreamUrl(id, quality, settings) { /* ... */ },

  // -- Optional methods --
  async getAlbum(id) { /* ... */ },
  async getArtist(id) { /* ... */ },
  async getPlaylist(id) { /* ... */ },
  async resolve({ isrc, title, artist, durationMs }) { /* ... */ },
};

export default ADDONIUM_MODULE;
```

### 9.3 Loading procedure (host-side)

1. Host reads the `.aium` file as text.
2. Host reads/asks for the corresponding key (paste, file import, or QR).
3. Host evaluates the module in an **isolated/sandboxed context** (a
   `Worker`, a `vm` context, a `new Function` with no ambient host
   globals - implementation is host-specific, but it MUST NOT be run with
   full app privileges).
4. Host calls `unlock(key, context)`. If it resolves falsy or throws, the
   module is treated as **not installed** - no further methods are called,
   and no partial functionality is granted.
5. Once unlocked, the host proxies calls the same way it would to an HTTP
   addon: `searchTracks` ≈ `/search`, `getTrackStreamUrl` ≈ `/stream/:id`.

### 9.4 Author's discretion on strictness

The author decides how the module behaves without a valid key. Options
include (non-exhaustive, and entirely up to the author's own code):

- Refuse to execute at all (`unlock` throws).
- Execute but return empty/degraded results (a "demo mode").
- Execute fully for a trial window embedded in the module's own logic.

Addonium does not mandate any of these - it only guarantees that `unlock`
is always called first and that a host must not skip it.

### 9.5 Integrity & trust

Because a compiled module runs host-side code rather than being called
over the network, hosts SHOULD:

- Sandbox execution (no filesystem, no arbitrary network beyond what a
  `fetch`-like binding explicitly allows).
- Surface the module's declared `id`, `author`, and `version` to the user
  before granting the sandbox a network binding.
- Treat a module's self-reported `manifest` as informational, not a
  security boundary - sandboxing is what actually protects the host, the
  manifest is just what the user is told.

---

## 10. Client Allowlisting

**Optional. Defaults to off** for both Open and Locked addons. When set,
an author restricts *which client applications* may call their addon,
independent of *which users* may (that's `auth`, §6).

```json
{
  "clients": {
    "enforced": true,
    "allow": ["com.myplayer.official", "com.myplayer.beta"],
    "identify": "header",
    "header": "X-Addonium-Client",
    "onDeny": { "status": 403, "message": "This client is not permitted to use this addon." }
  }
}
```

| Field | Description |
|---|---|
| `enforced` | `false` by default. When `true`, requests without a recognized `clientId` are rejected. |
| `allow` | Array of permitted `clientId` strings the author has chosen to trust (e.g. their own official app's id, plus any third-party host they've explicitly approved). |
| `identify` | How the client presents its id: `"header"` (custom header), `"userAgent"` (parsed from `User-Agent`), or `"queryParam"`. |
| `onDeny` | What the server should be documented as returning on rejection, so third-party hosts can detect it cleanly (`403` + a machine-checkable body is recommended over a silent empty response). |

This is enforced **entirely on the addon's own server or module code** -
Addonium doesn't provide a shared enforcement service, a CAPTCHA, or a
central clientId registry. A `clientId` is just a string the author decides
to trust or not; issuing/rotating them is the author's business.

Hosts, in turn, SHOULD send a stable, honestly-identifying `clientId` for
every addon call so that authors *can* allowlist them if they choose to -
spoofing it defeats the purpose of an opt-in mechanism the author is
relying on in good faith.

---

## 11. Optional Data Storage

By default, **no Addonium addon stores anything about who called it.**
`storesData` in the manifest defaults to `false`.

### 11.1 When `storesData: true`

Set this when an addon implements `library` sync, per-user settings
persistence, or anything else that survives across requests. It's purely a
disclosure flag for hosts to show the user ("this addon remembers your
library") - it does not change wire behavior.

### 11.2 Encrypted-in-URL correlation (recommended default)

Rather than requiring a server-side user database, a Locked Addon that
wants to remember a user is encouraged to fold the correlation identifier
into the same tokenized URL segment described in §7:

```
token = base64url( AES-GCM_encrypt(secret_key, { uid, iat }) )
```

The addon's server decrypts the token on each request to recover `uid` and
looks up/updates that user's rows - but the *addon itself* never needs a
separate login step, session cookie, or exposed user-id in cleartext. Lose
the URL, lose access to that data; that's an acceptable, author-chosen
trade-off, and matches how BeatBoss/Eclipse already suggest handling
addon auth via URL tokens.

This is a **pattern recommendation**, not a mandated algorithm - an author
is free to store data any way they like, including plaintext, a real
OAuth login, or nothing at all.

---

## 12. Updates, Versioning & CI

### 12.1 Manifest versioning

- `version` follows SemVer. Hosts MAY warn (never silently block) on a
  downgrade or a skipped major version.
- `addonium` (the spec version) follows its own major.minor; a host should
  refuse manifests whose major spec version it doesn't implement.

### 12.2 Self-describing update pointer

```json
{
  "update": {
    "manifestUrl": "https://example.com/.well-known/addonium/manifest.json",
    "checkInterval": 86400
  }
}
```

A host periodically re-fetches `manifestUrl` (default: once every
`checkInterval` seconds, or on next app launch if omitted) and diffs
`version`. No addon needs to "push" anything - this is a plain polling
pointer, deliberately boring and infrastructure-free.

### 12.3 GitHub Actions: auto-updating manifest.json

A common author setup is: source of truth lives in a small `addon.yaml` or
`package.json`, and a workflow regenerates and republishes `manifest.json`
(e.g. to GitHub Pages or a `gh-pages`/`dist` branch) on every push, keeping
`version` and `update.manifestUrl` in sync automatically.

```yaml
# .github/workflows/addonium-publish.yml
name: Addonium: Build & Publish Manifest

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Bump patch version
        id: bump
        run: |
          CURRENT=$(jq -r .version manifest.source.json)
          NEXT=$(node -e "const [M,m,p]=process.argv[1].split('.').map(Number);console.log(\`\${M}.\${m}.\${p+1}\`)" "$CURRENT")
          echo "version=$NEXT" >> "$GITHUB_OUTPUT"

      - name: Render manifest.json
        run: |
          jq --arg v "${{ steps.bump.outputs.version }}" \
             '.version = $v' manifest.source.json > manifest.json

      - name: Validate against Addonium schema
        run: npx ajv-cli validate -s addonium.schema.json -d manifest.json

      - name: Commit updated manifest
        run: |
          git config user.name "addonium-bot"
          git config user.email "bot@users.noreply.github.com"
          git add manifest.json
          git commit -m "chore: publish manifest v${{ steps.bump.outputs.version }}" || echo "nothing to commit"
          git push

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

This gives an author, for free:

- Auto version bumping on every merge to `main`.
- Schema validation before publish, so a broken manifest never goes live.
- A stable `manifestUrl` (GitHub Pages / raw.githubusercontent.com) hosts
  can poll - no server required at all for Open Addons that are purely
  static.

### 12.4 Optional registry / index

Addonium does not require centralized discovery, but authors who want to
be listed somewhere can publish an `index.json` entry to a community
registry repo (à la a package registry's PR-based index), containing just
`{ id, name, manifestUrl, type }`. A registry is a **directory**, not an
authority - it never gates whether an addon works, only whether it's easy
to find. A second workflow can validate/lint such submissions:

```yaml
# .github/workflows/addonium-registry-check.yml
name: Addonium: Registry Submission Check
on:
  pull_request:
    paths: ["registry/**.json"]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate submitted entries
        run: |
          for f in registry/*.json; do
            npx ajv-cli validate -s registry-entry.schema.json -d "$f"
            curl -fsSL "$(jq -r .manifestUrl "$f")" | npx ajv-cli validate -s addonium.schema.json -d /dev/stdin
          done
```

---

## 13. Host Application Responsibilities

A conforming host MUST:

- Respect `type`, `auth`, and `clients` exactly as declared - never strip
  auth requirements, never call a Locked Addon without the credential the
  author asked for, never fabricate a `clientId`.
- Fail gracefully when an addon (or a specific resource) is unavailable -
  fall back to another installed addon or a built-in provider, never crash
  the surrounding UI.
- Sandbox compiled modules (§9.5) and never execute one with more
  privilege than the manifest's declared `resources` imply.
- Surface `storesData: true`, `clients.enforced: true`, the `auth`
  method, and any `auth.requirements` to the user at install time, so
  nothing about an addon's access model is hidden.
- Never send the same tokenized URL/key to a different addon or log it in
  a way the addon's author didn't opt into (e.g. shipping analytics that
  include a Locked Addon's token is a spec violation of the "no abuse"
  principle in §1).

A conforming host SHOULD:

- Send a stable, honest `clientId` on every request so allowlisting is
  actually usable by authors who want it.
- Support both distribution formats (§4) where feasible, defaulting to
  HTTP addons and treating compiled modules as an enhancement.

---

## 14. Security Considerations

- **HTTPS is required** for all HTTP addons except `localhost`/LAN
  addresses used for local development.
- **CORS**: addons intended for web-based hosts should send
  `Access-Control-Allow-Origin` for their expected origins.
- **Token leakage**: because `url-token` auth puts the credential in the
  URL, authors should treat tokens as bearer secrets - short expirable
  tokens for shareable/demo links, long-lived ones only for private,
  non-logged contexts. Hosts must not log full addon URLs in crash
  reports/analytics.
- **Sandboxing compiled modules** is the single most important host-side
  security control in this spec - a module is arbitrary code, not a data
  payload, and must never run with ambient access to the host's storage,
  other addons' credentials, or the filesystem beyond what it's
  explicitly given.
- **Allowlist spoofing**: `clients.allowlist` is a courtesy contract
  between author and well-behaved hosts, not a cryptographic guarantee
  (nothing stops a hostile client from lying about its `clientId`). Authors
  who need a hard guarantee should combine it with `auth` (§6), not rely on
  `clients` alone.
- **Never invent data**: `resolve` and `resolve-isrc` responses are trusted
  blindly by hosts once returned - an addon that guesses instead of
  returning `null` actively harms the user's queue/library integrity.
- **DRM license endpoints** (`drm.licenseUrl`) are a separate trust boundary
  from addon `auth` (§6) - a host should not forward its own addon
  credentials to a license server unless the addon explicitly says to via
  `drm.headers`, and should never cache license responses across users.

---

## 15. Error Handling

| Status | Meaning |
|---|---|
| `200` | Success (including "confirmed no match," e.g. `{"item": null}`) |
| `400` | Malformed request (host bug or bad query) |
| `401` | Missing/invalid auth credential (Locked Addon) |
| `403` | Valid credential, but access denied - e.g. `clients.enforced` rejection, or a used-up/expired license |
| `404` | Resource/id not found |
| `410` | Addon permanently discontinued (hosts should uninstall/hide it) |
| `429` | Rate limited - `Retry-After` header recommended |
| `5xx` | Server error - host should fail over to fallback sources |

Compiled modules should throw a typed error (e.g.
`{ code: "UNLOCK_FAILED" | "NOT_FOUND" | "RATE_LIMITED", message }`) rather
than a bare string, so hosts can branch the same way they would on an HTTP
status.

---

## 16. JSON Schema

> This schema validates `manifest.json` only. The `/stream/:id` **response**
> is intentionally left unschematized beyond `url` being required - see
> [§8.2.1](#821-streaming-formats-are-open-ended) for why `format`, `codec`,
> `container`, `manifest`, and `drm` are treated as open hints rather than
> constrained fields.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://addonium.dev/schema/manifest.schema.json",
  "title": "Addonium Manifest",
  "type": "object",
  "required": ["addonium", "id", "name", "version", "type"],
  "properties": {
    "addonium": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" },
    "id": { "type": "string", "pattern": "^[a-z0-9.-]+$" },
    "name": { "type": "string", "minLength": 1, "maxLength": 80 },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+" },
    "description": { "type": "string", "maxLength": 300 },
    "author": {
      "oneOf": [
        { "type": "string" },
        {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "url": { "type": "string", "format": "uri" },
            "contact": { "type": "string" }
          }
        }
      ]
    },
    "icon": { "type": "string", "format": "uri" },
    "contentType": {
      "type": "string",
      "enum": ["music", "audiobook", "podcast", "video", "generic"]
    },
    "types": {
      "type": "array",
      "items": { "enum": ["track", "album", "artist", "playlist", "episode", "file"] }
    },
    "resources": {
      "type": "array",
      "items": {
        "enum": ["search", "stream", "catalog", "lyrics", "library", "isrc", "resolve", "settings", "video"]
      }
    },
    "baseUrl": {
      "type": "string",
      "description": "Root URL for HTTP addons. For Locked addons using url-token auth it MAY be a URI template containing a {token} placeholder (see §17.2) or an already-tokenized URL (§7), so plain `format: uri` is intentionally not enforced here.",
      "minLength": 1
    },
    "distribution": {
      "type": "array",
      "items": { "enum": ["manifest", "module"] },
      "minItems": 1
    },
    "type": { "type": "string", "enum": ["open", "locked"] },
    "auth": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "required": ["method"],
          "properties": {
            "method": { "enum": ["bearer", "url-token", "api-key", "signed", "module-key"] },
            "header": { "type": "string" },
            "scheme": { "type": "string" },
            "paramName": { "type": "string" },
            "tokenGrant": { "enum": ["manual", "self-serve", "none"] },
            "grantUrl": { "type": "string", "format": "uri" },
            "required": { "type": "boolean" },
            "requirements": {
              "type": "array",
              "description": "Author-defined, out-of-band access conditions (§6.2). Display-only, never enforced.",
              "items": {
                "oneOf": [
                  { "type": "string" },
                  {
                    "type": "object",
                    "required": ["label"],
                    "properties": {
                      "label": { "type": "string", "minLength": 1 },
                      "url": { "type": "string" },
                      "detail": { "type": "string" }
                    },
                    "additionalProperties": false
                  }
                ]
              }
            }
          }
        }
      ]
    },
    "clients": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "properties": {
            "enforced": { "type": "boolean", "default": false },
            "allow": { "type": "array", "items": { "type": "string" } },
            "identify": { "enum": ["header", "userAgent", "queryParam"] },
            "header": { "type": "string" },
            "onDeny": {
              "type": "object",
              "properties": {
                "status": { "type": "integer" },
                "message": { "type": "string" }
              }
            }
          }
        }
      ]
    },
    "storesData": { "type": "boolean", "default": false },
    "update": {
      "type": "object",
      "properties": {
        "manifestUrl": { "type": "string", "format": "uri" },
        "checkInterval": { "type": "integer", "minimum": 60 }
      }
    },
    "settings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "type", "label"],
        "properties": {
          "key": { "type": "string" },
          "type": { "enum": ["select", "toggle", "text", "number"] },
          "label": { "type": "string" },
          "help": { "type": "string" },
          "default": {},
          "perNetwork": { "type": "boolean" },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": { "value": {}, "label": { "type": "string" } }
            }
          },
          "maxLength": { "type": "integer" },
          "placeholder": { "type": "string" },
          "min": { "type": "number" },
          "max": { "type": "number" },
          "step": { "type": "number" }
        }
      }
    },
    "catalogs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "name"],
        "properties": {
          "id": { "type": "string" },
          "type": { "enum": ["track", "album", "artist", "playlist"] },
          "name": { "type": "string" }
        }
      }
    },
    "repository": { "type": "string", "format": "uri" },
    "homepage": { "type": "string", "format": "uri" },
    "license": { "type": "string" }
  },
  "allOf": [
    {
      "if": { "properties": { "type": { "const": "locked" } } },
      "then": { "required": ["auth"], "properties": { "auth": { "not": { "type": "null" } } } }
    },
    {
      "if": { "properties": { "type": { "const": "open" } } },
      "then": { "properties": { "auth": { "type": "null" } } }
    }
  ]
}
```

Save this as `addonium.schema.json` and validate any manifest with, e.g.:

```bash
npx ajv-cli validate -s addonium.schema.json -d manifest.json
```

---

## 17. Example Manifests

### 17.1 Open Addon: plain, public, no auth

```json
{
  "addonium": "1.0",
  "id": "club.example.openradio",
  "name": "Open Radio",
  "version": "1.0.0",
  "description": "A public collection of Creative Commons tracks.",
  "type": "open",
  "auth": null,
  "baseUrl": "https://openradio.example.com",
  "distribution": ["manifest"],
  "resources": ["search", "stream"],
  "types": ["track"],
  "storesData": false
}
```

### 17.2 Locked Addon: tokenized URL, no client restriction

```json
{
  "addonium": "1.0",
  "id": "com.example.premiumsource",
  "name": "Premium Source",
  "version": "3.2.0",
  "type": "locked",
  "auth": {
    "method": "url-token",
    "tokenGrant": "self-serve",
    "grantUrl": "https://example.com/account/addon-token"
  },
  "baseUrl": "https://api.example.com/t/{token}",
  "distribution": ["manifest"],
  "resources": ["search", "stream", "library"],
  "storesData": true
}
```

### 17.3 Locked Addon: compiled module + strict client allowlist

```json
{
  "addonium": "1.0",
  "id": "com.example.walledgarden",
  "name": "Walled Garden Source",
  "version": "0.9.1",
  "type": "locked",
  "auth": { "method": "module-key" },
  "distribution": ["module"],
  "resources": ["search", "stream"],
  "clients": {
    "enforced": true,
    "allow": ["com.myplayer.official"],
    "identify": "header",
    "header": "X-Addonium-Client",
    "onDeny": { "status": 403, "message": "Only the official client may use this addon." }
  },
  "storesData": false
}
```

---

## 18. Capability Matrix

| `resources` value | HTTP endpoint(s) | Module method(s) | Notes |
|---|---|---|---|
| `search` | `GET /search` | `searchTracks` | Recommended baseline |
| `stream` | `GET /stream/:id` | `getTrackStreamUrl` | Recommended baseline |
| `catalog` | `/album/:id`, `/artist/:id`, `/playlist/:id`, `/catalog/:id` | `getAlbum`, `getArtist`, `getPlaylist` | Enables browsing + home rows |
| `lyrics` | `GET /lyrics` | `getLyrics` | Plain text or LRC |
| `library` | `/libraries...` | `syncLibrary` | Implies `storesData: true` |
| `isrc` | `GET /resolve-isrc` | `resolveByIsrc` | Exact-match lookup |
| `resolve` | `GET /resolve` | `resolve` | Fuzzy-but-strict match for generated queues |
| `settings` | query params on all calls | 3rd arg on all methods | User-configurable behavior |
| `video` | `video` object in `/stream` response | `video` field in stream result | Optional visual playback |
| *(implicit)* | `manifest`/`codec`/`container`/`drm` on any `/stream` response | same fields on any stream result | HLS, DASH, multi-channel/Dolby codecs, DRM - open-ended, see §8.2.1 |

---

## 19. FAQ

**Does an addon have to run anywhere special?**
No. Any HTTPS-capable server (a $5 VPS, a Raspberry Pi, a static host for
Open Addons with pre-baked data, or nothing at all for a pure compiled
module) works. Addonium has no relationship with Cloudflare Workers or any
other specific platform - that's a choice some *other* addon ecosystems
make, not this one.

**Can I make my addon both Open and restricted to my own app?**
Yes - set `type: "open"`, `auth: null`, and still set `clients.enforced:
true` with your own `clientId` in `allow`. No login required, but only
your official client (or ones you've explicitly trusted) will be honored.

**Do I have to store any user data?**
No. `storesData` defaults to `false`. Even Locked Addons can be entirely
stateless - the token just proves authorization, it doesn't have to
correlate to a stored record at all.

**What stops a host from ignoring my `auth`/`clients` config?**
Nothing prevents a malicious host from trying to call your server directly
without the header you asked for - that's true of any HTTP API. Your own
server is the enforcement point: reject requests that don't carry what
`auth` and `clients` describe. The spec's job is to give well-behaved hosts
an unambiguous, shared way to *comply* with what you've declared; it isn't
a DRM system.

**Can I update my addon without users reinstalling?**
Yes. For HTTP addons, just update your server - hosts re-fetch
`manifest.json` per your `update.checkInterval`. For compiled modules,
publish a new `.aium` file at the same `manifestUrl`/download location;
users only need to re-import if the key itself changes.

**What if I want a community index of addons?**
Optional and separate from the core spec - see §12.4. Nothing about
discovery is required for an addon to be fully functional.

**Can I mix Open and Locked resources in one addon?**
Not within a single manifest - `type` is addon-wide. If you want a public
search tier and a paid streaming tier, ship two addons (or one Open addon
for `search` plus one Locked addon/module for `stream`) so the access
model of each installable unit stays unambiguous to hosts and users.