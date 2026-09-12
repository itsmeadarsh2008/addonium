// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Spec text (§5, §8) is CC0-1.0 (see LICENSE-CC0); these types mirror it.

/** Spec version string, e.g. "1.0" (§5.1 `addonium`). */
export type AddoniumSpecVersion = string;

export type AddonType = "open" | "locked";

export type AuthMethod = "bearer" | "url-token" | "api-key" | "signed" | "module-key";

export type TokenGrant = "manual" | "self-serve" | "none";

export interface AuthConfig {
  method: AuthMethod;
  header?: string;
  scheme?: string;
  paramName?: string;
  tokenGrant?: TokenGrant;
  grantUrl?: string;
  required?: boolean;
  /**
   * Author-defined, out-of-band conditions for getting access (§6.2).
   * Free-text for humans only — hosts display, never enforce. E.g. a
   * Discord invite, a supporter role, a purchase receipt. Anything goes;
   * Addonium never prescribes an identity provider (§6.3).
   */
  requirements?: Array<string | AuthRequirement>;
}

/** One human-readable access condition. Display-only, never enforced. */
export interface AuthRequirement {
  /** Short label, e.g. "Join the Example Discord". */
  label: string;
  /** Optional link, e.g. an invite URL. */
  url?: string;
  /** Optional longer explanation. */
  detail?: string;
}

export type ClientIdentify = "header" | "userAgent" | "queryParam";

export interface ClientsConfig {
  enforced?: boolean;
  allow?: string[];
  identify?: ClientIdentify;
  header?: string;
  onDeny?: { status?: number; message?: string };
}

export interface AddonAuthor {
  name?: string;
  url?: string;
  contact?: string;
}

export type ContentType = "music" | "audiobook" | "podcast" | "video" | "generic";

export type ContentKind = "track" | "album" | "artist" | "playlist" | "episode" | "file";

export type Resource =
  | "search"
  | "stream"
  | "catalog"
  | "lyrics"
  | "library"
  | "isrc"
  | "resolve"
  | "settings"
  | "video";

export type SettingType = "select" | "toggle" | "text" | "number";

export interface SettingOption {
  value: unknown;
  label?: string;
}

export interface SettingDef {
  key: string;
  type: SettingType;
  label: string;
  help?: string;
  default?: unknown;
  perNetwork?: boolean;
  options?: SettingOption[];
  maxLength?: number;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface CatalogDef {
  id: string;
  type: "track" | "album" | "artist" | "playlist";
  name: string;
}

export interface UpdatePointer {
  manifestUrl?: string;
  checkInterval?: number;
}

/** Canonical manifest shape (§5). */
export interface Manifest {
  addonium: AddoniumSpecVersion;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: AddonAuthor | string;
  icon?: string;
  contentType?: ContentType;
  types?: ContentKind[];
  resources?: Resource[];
  /** Required unless distribution is ["module"] only. May embed a token segment (§7). */
  baseUrl?: string;
  distribution?: Array<"manifest" | "module">;
  type: AddonType;
  /** Required non-null when type is "locked" (§6.2, §16 allOf). */
  auth?: AuthConfig | null;
  clients?: ClientsConfig | null;
  /** Defaults to false (§11). */
  storesData?: boolean;
  update?: UpdatePointer;
  settings?: SettingDef[];
  catalogs?: CatalogDef[];
  repository?: string;
  homepage?: string;
  license?: string;
}

// --- HTTP API shapes (§8) ---

export interface TrackItem {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  artworkURL?: string;
  isrc?: string;
  format?: string;
  streamURL?: string | null;
}

export interface SearchResponse {
  tracks?: TrackItem[];
  albums?: unknown[];
  artists?: unknown[];
  playlists?: unknown[];
}

export interface StreamDrm {
  system: string;
  licenseUrl?: string;
  headers?: Record<string, string>;
}

export interface StreamVideo {
  url?: string;
  mimeType?: string;
  muxed?: boolean;
  width?: number;
  height?: number;
  renditions?: unknown[];
}

/**
 * §8.2 + §8.2.1: only `url` is load-bearing. format/codec/container/manifest
 * are intentionally free-text hints, never closed enums.
 */
export interface StreamResponse {
  url: string;
  format?: string;
  quality?: string;
  codec?: string;
  container?: string;
  manifest?: string;
  expiresAt?: number;
  encrypted?: boolean;
  chapters?: Array<{ title?: string; startTime?: number }>;
  drm?: StreamDrm;
  video?: StreamVideo;
}

export interface ResolveItem {
  id: string;
  type: string;
  title?: string;
  artist?: string;
}

export type SettingsValues = Record<string, string | number | boolean>;

// --- Compiled module shapes (§9.2) ---

export interface ModuleManifest {
  addonium: AddoniumSpecVersion;
  id: string;
  name: string;
  version: string;
  type: "locked";
  resources?: Resource[];
  auth?: AuthConfig;
}

export interface ModuleUnlockContext {
  clientId?: string;
  [key: string]: unknown;
}

export interface AddoniumModule {
  manifest: ModuleManifest;
  unlock: (key: string, context?: ModuleUnlockContext) => boolean | Promise<boolean>;
  searchTracks?: (query: string, limit?: number, settings?: SettingsValues) => Promise<unknown>;
  getTrackStreamUrl?: (
    id: string,
    quality?: string,
    settings?: SettingsValues,
  ) => Promise<StreamResponse | string>;
  getAlbum?: (id: string) => Promise<unknown>;
  getArtist?: (id: string) => Promise<unknown>;
  getPlaylist?: (id: string) => Promise<unknown>;
  resolve?: (q: {
    isrc?: string;
    title?: string;
    artist?: string;
    durationMs?: number;
  }) => Promise<unknown>;
  [method: string]: unknown;
}

export interface RegistryEntry {
  id: string;
  name: string;
  manifestUrl: string;
  type: AddonType;
}
