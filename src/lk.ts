import { Http, KantianaError } from "./http.js";
import type {
  LkNewsItem,
  LkNotice,
  LkPaged,
  LkProfile,
  LkScheduleDay,
  LkService,
  LkTeacher,
} from "./types.js";

export const LK_BASE_URL = "https://lk.kantiana.ru";

export type AccountType = "student" | "employee";

/** Normalises "ivanov", "ivanov@stud.kantiana.ru" or "ivanov@kantiana.ru" to a full LK login. */
export function normalizeLogin(login: string, type: AccountType = "student"): string {
  const trimmed = login.trim();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@${type === "student" ? "stud.kantiana.ru" : "kantiana.ru"}`;
}

function isoDate(date?: Date | string): string {
  if (typeof date === "string") return date;
  // LK dates are in university local time (Kaliningrad), not UTC.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kaliningrad" }).format(date ?? new Date());
}

interface Envelope<T> {
  response?: { status: number; message?: string };
  additional?: { count: number; offset: number; total: number };
  payload: T;
}

/** Client for the lk.kantiana.ru JSON backend (`/backend/*`). */
export class LkApi {
  constructor(
    private readonly http: Http,
    readonly baseUrl: string = LK_BASE_URL,
  ) {}

  private get host(): string {
    return new URL(this.baseUrl).host;
  }

  get isAuthenticated(): boolean {
    return this.http.jar.has(this.host, "LK");
  }

  private async raw<T>(
    method: string,
    path: string,
    opts: { params?: Record<string, string | number | undefined | null>; json?: unknown } = {},
  ): Promise<Envelope<T>> {
    const url = new URL(`${this.baseUrl}/backend${path}`);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    if (!this.http.jar.has(this.host, "session-cookie")) await this.http.request(`${this.baseUrl}/`);
    const res = await this.http.request(url.toString(), {
      method,
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    });
    const text = await res.text();
    let data: Envelope<T> & { response?: { status: number; message?: string } };
    try {
      data = JSON.parse(text);
    } catch {
      throw new KantianaError(`LK ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok || (data.response && data.response.status >= 400)) {
      const msg = data.response?.message ?? text.slice(0, 200);
      throw new KantianaError(`LK ${method} ${path} -> ${res.status}: ${msg}`, res.status, String(data.response?.status ?? ""));
    }
    return data;
  }

  private async paged<T>(path: string, params: Record<string, string | number | undefined>): Promise<LkPaged<T>> {
    const data = await this.raw<T[]>("GET", path, { params });
    return {
      items: data.payload ?? [],
      count: data.additional?.count ?? data.payload?.length ?? 0,
      offset: data.additional?.offset ?? 0,
      total: data.additional?.total ?? data.payload?.length ?? 0,
    };
  }

  async login(login: string, password: string, type: AccountType = "student"): Promise<{ ldap_id: string; root_id: number }> {
    await this.http.request(`${this.baseUrl}/`);
    const data = await this.raw<{ ldap_id: string; root_id: number }>("POST", "/login", {
      json: { login: normalizeLogin(login, type), password },
    });
    if (!this.isAuthenticated) throw new KantianaError("LK login failed: no session cookie returned", 401);
    return data.payload;
  }

  async profile(): Promise<LkProfile> {
    return (await this.raw<LkProfile>("GET", "/profile")).payload;
  }

  /** Returns the SSO launch URLs for linked services (eios, mfc, communities, ...). */
  async services(): Promise<{ token: string; services: LkService[] }> {
    return (await this.raw<{ token: string; services: LkService[] }>("GET", "/profile/refresh")).payload;
  }

  async notices(opts: { count?: number; offset?: number; active?: boolean } = {}): Promise<LkPaged<LkNotice>> {
    return this.paged<LkNotice>("/notices", {
      count: opts.count ?? 20,
      offset: opts.offset ?? 0,
      active: opts.active === undefined ? undefined : opts.active ? "1" : "0",
    });
  }

  async dismissNotice(id: string): Promise<void> {
    await this.raw("PUT", "/notices", { json: { id } });
  }

  async news(opts: { count?: number; offset?: number } = {}): Promise<LkPaged<LkNewsItem>> {
    return this.paged<LkNewsItem>("/news", { count: opts.count ?? 20, offset: opts.offset ?? 0 });
  }

  /** Personal schedule for a single day (defaults to today). */
  async schedule(date?: Date | string): Promise<LkScheduleDay[]> {
    return (await this.raw<LkScheduleDay[]>("GET", "/schedule", { params: { date: isoDate(date) } })).payload;
  }

  /** Personal schedule for `days` consecutive days starting at `from`. */
  async scheduleRange(from: Date | string = new Date(), days = 7): Promise<LkScheduleDay[]> {
    const start = new Date(isoDate(from) + "T00:00:00Z");
    const dates = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86400000));
    const results = await Promise.all(dates.map((d) => this.schedule(d)));
    return results.flat();
  }

  async groups(): Promise<string[]> {
    return (await this.raw<string[]>("GET", "/schedule/group/list")).payload;
  }

  async groupSchedule(group: string, date?: Date | string): Promise<LkScheduleDay[]> {
    return (await this.raw<LkScheduleDay[]>("GET", "/schedule/group", { params: { group_id: group, date: isoDate(date) } }))
      .payload;
  }

  async searchTeachers(query: string | null): Promise<LkPaged<LkTeacher>> {
    const data = await this.raw<LkTeacher[]>("POST", "/schedule/teachers", { json: { query } });
    return {
      items: data.payload ?? [],
      count: data.additional?.count ?? 0,
      offset: data.additional?.offset ?? 0,
      total: data.additional?.total ?? data.payload?.length ?? 0,
    };
  }

  async teacherSchedule(teacherId: string, date?: Date | string): Promise<LkScheduleDay[]> {
    return (
      await this.raw<LkScheduleDay[]>("GET", "/schedule/teachers", {
        params: { onec_univer_id: teacherId, date: isoDate(date) },
      })
    ).payload;
  }
}
