import { CookieJar, Http, KantianaError, type HttpOptions } from "./http.js";
import { LkApi, normalizeLogin, type AccountType } from "./lk.js";
import { EIOS_BASE_URL, LMS_BASE_URL, MoodleApi } from "./moodle.js";

export interface KantianaSession {
  cookies: Record<string, Record<string, string>>;
  eiosToken: string | null;
  lmsToken: string | null;
}

export interface KantianaClientOptions extends HttpOptions {
  lkBaseUrl?: string;
  eiosBaseUrl?: string;
  lmsBaseUrl?: string;
}

/**
 * Single entry point for BFU Kantiana services:
 *  - `lk`   — lk.kantiana.ru (profile, schedule, notices, news)
 *  - `eios` — eios.kantiana.ru Moodle (courses, assignments, grades, ...) via LK SSO
 *  - `lms`  — lms.kantiana.ru Moodle via password
 */
export class KantianaClient {
  readonly http: Http;
  readonly lk: LkApi;
  readonly eios: MoodleApi;
  readonly lms: MoodleApi;
  private credentials: { login: string; password: string; type: AccountType } | null = null;

  constructor(opts: KantianaClientOptions = {}) {
    this.http = new Http(opts);
    this.lk = new LkApi(this.http, opts.lkBaseUrl);
    this.eios = new MoodleApi(this.http, opts.eiosBaseUrl ?? EIOS_BASE_URL);
    this.lms = new MoodleApi(this.http, opts.lmsBaseUrl ?? LMS_BASE_URL);
  }

  /** Logs into LK; Moodle tokens are obtained lazily via `connectEios()` / `connectLms()`. */
  async login(login: string, password: string, type: AccountType = "student"): Promise<void> {
    this.http.jar.clear();
    this.eios.token = this.eios.privateToken = null;
    this.lms.token = this.lms.privateToken = null;
    this.credentials = null;
    await this.lk.login(login, password, type);
    this.credentials = { login, password, type };
  }

  /** Gets an eios.kantiana.ru web-service token through the LK SSO link. */
  async connectEios(): Promise<string> {
    if (this.eios.isAuthenticated) return this.eios.token!;
    if (!this.lk.isAuthenticated) throw new KantianaError("Log in to LK before connecting eios", 401);
    const { services } = await this.lk.services();
    const eios = services.find((s) => s.name === "eios" && s.url);
    if (!eios?.url) throw new KantianaError("eios service is not available for this account", 404);
    return this.eios.loginWithSsoUrl(eios.url);
  }

  /** Gets an lms.kantiana.ru token with the stored password. */
  async connectLms(): Promise<string> {
    if (this.lms.isAuthenticated) return this.lms.token!;
    if (!this.credentials) throw new KantianaError("Call login() before connectLms()", 401);
    return this.lms.loginWithPassword(normalizeLogin(this.credentials.login, this.credentials.type), this.credentials.password);
  }

  exportSession(): KantianaSession {
    return { cookies: this.http.jar.toJSON(), eiosToken: this.eios.token, lmsToken: this.lms.token };
  }

  static fromSession(session: KantianaSession, opts: KantianaClientOptions = {}): KantianaClient {
    const client = new KantianaClient({ ...opts, jar: CookieJar.fromJSON(session.cookies) });
    client.eios.token = session.eiosToken;
    client.lms.token = session.lmsToken;
    return client;
  }
}
