export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class KantianaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "KantianaError";
  }
}

/** Minimal per-host cookie jar; works in Node, browsers-like runtimes and Cloudflare Workers. */
export class CookieJar {
  private jar = new Map<string, Map<string, string>>();

  set(host: string, setCookieHeaders: string[]): void {
    let hostJar = this.jar.get(host);
    if (!hostJar) {
      hostJar = new Map();
      this.jar.set(host, hostJar);
    }
    for (const header of setCookieHeaders) {
      const [pair, ...attrs] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = value === "deleted" || attrs.some(isExpiredAttr);
      if (expired) hostJar.delete(name);
      else hostJar.set(name, value);
    }
  }

  header(host: string): string | undefined {
    const hostJar = this.jar.get(host);
    if (!hostJar || hostJar.size === 0) return undefined;
    return [...hostJar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(host: string, name: string): boolean {
    return this.jar.get(host)?.has(name) ?? false;
  }

  clear(host?: string): void {
    if (host) this.jar.delete(host);
    else this.jar.clear();
  }

  toJSON(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [host, cookies] of this.jar) out[host] = Object.fromEntries(cookies);
    return out;
  }

  static fromJSON(data: Record<string, Record<string, string>>): CookieJar {
    const jar = new CookieJar();
    for (const [host, cookies] of Object.entries(data)) jar.jar.set(host, new Map(Object.entries(cookies)));
    return jar;
  }
}

function isExpiredAttr(attr: string): boolean {
  const [k, ...rest] = attr.split("=");
  const key = k.trim().toLowerCase();
  const v = rest.join("=").trim();
  if (key === "max-age") return Number(v) <= 0;
  if (key === "expires") {
    const t = Date.parse(v);
    return !Number.isNaN(t) && t <= Date.now();
  }
  return false;
}

function getSetCookies(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/) : [];
}

export interface HttpOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  jar?: CookieJar;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  /** Follow redirects manually (keeps cookies across hops). Default true. */
  followRedirects?: boolean;
  maxRedirects?: number;
}

/** fetch wrapper that keeps cookies across hosts and redirects. */
export class Http {
  readonly jar: CookieJar;
  private readonly fetchImpl: typeof fetch;
  readonly userAgent: string;

  constructor(opts: HttpOptions = {}) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.jar = opts.jar ?? new CookieJar();
  }

  async request(url: string, opts: RequestOptions = {}): Promise<Response> {
    const follow = opts.followRedirects ?? true;
    let remaining = opts.maxRedirects ?? 10;
    let current = new URL(url);
    let method = opts.method ?? "GET";
    let body = opts.body;

    for (;;) {
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        ...opts.headers,
      };
      const cookie = this.jar.header(current.host);
      if (cookie) headers.Cookie = cookie;

      const res = await this.fetchImpl(current.toString(), { method, headers, body, redirect: "manual" });
      this.jar.set(current.host, getSetCookies(res.headers));

      const location = res.headers.get("location");
      if (!follow || res.status < 300 || res.status >= 400 || !location) return res;
      if (!/^https?:/i.test(new URL(location, current).protocol)) return res;
      if (remaining-- <= 0) throw new KantianaError(`Too many redirects for ${url}`);
      current = new URL(location, current);
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = undefined;
      }
    }
  }
}
