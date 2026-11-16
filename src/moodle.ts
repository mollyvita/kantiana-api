import { Http, KantianaError } from "./http.js";
import type {
  MoodleAssignment,
  MoodleCourse,
  MoodleEvent,
  MoodleSection,
  MoodleSiteInfo,
} from "./types.js";

export const EIOS_BASE_URL = "https://eios.kantiana.ru";
export const LMS_BASE_URL = "https://lms.kantiana.ru";

export type MoodleArgs = Record<string, unknown>;

/** Flattens nested args into Moodle REST form encoding: a[0][b]=c. */
export function encodeMoodleArgs(args: MoodleArgs, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") encodeMoodleArgs(v as MoodleArgs, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(typeof v === "boolean" ? Number(v) : v));
      });
    } else if (typeof value === "object") {
      encodeMoodleArgs(value as MoodleArgs, name, out);
    } else {
      out.append(name, String(typeof value === "boolean" ? Number(value) : value));
    }
  }
  return out;
}

function b64decode(s: string): string {
  if (typeof atob === "function") return atob(s);
  return Buffer.from(s, "base64").toString("utf8");
}

/**
 * Moodle web-service client (REST protocol, `moodle_mobile_app` service).
 * Works for both eios.kantiana.ru (SSO) and lms.kantiana.ru (password).
 */
export class MoodleApi {
  token: string | null = null;
  privateToken: string | null = null;
  private site: MoodleSiteInfo | null = null;

  constructor(
    private readonly http: Http,
    readonly baseUrl: string = EIOS_BASE_URL,
  ) {}

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** Password login via /login/token.php (works on lms.kantiana.ru with the full e-mail). */
  async loginWithPassword(username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username, password, service: "moodle_mobile_app" });
    const res = await this.http.request(`${this.baseUrl}/login/token.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { token?: string; privatetoken?: string; error?: string; errorcode?: string };
    if (!data.token) throw new KantianaError(`Moodle login failed: ${data.error ?? res.status}`, 401, data.errorcode);
    this.token = data.token;
    this.privateToken = data.privatetoken ?? null;
    return data.token;
  }

  /**
   * SSO login: open an already-authenticated launch URL (e.g. the LK `eios` service URL) to get a
   * MoodleSession, then exchange it for a mobile web-service token via tool_mobile/launch.php.
   */
  async loginWithSsoUrl(ssoUrl: string): Promise<string> {
    await this.http.request(ssoUrl);
    if (!this.http.jar.has(new URL(this.baseUrl).host, "MoodleSession")) {
      throw new KantianaError("Moodle SSO failed: no MoodleSession cookie", 401);
    }
    const passport = Math.random().toString(36).slice(2, 12);
    // NB: the WAF in front of eios rejects requests carrying `urlscheme=moodlemobile`; the default scheme is used then.
    const launch = `${this.baseUrl}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}`;
    const res = await this.http.request(launch, { followRedirects: false });
    const location = res.headers.get("location") ?? "";
    const match = location.match(/token=([A-Za-z0-9+/=]+)/);
    if (!match) throw new KantianaError(`Moodle SSO launch failed (HTTP ${res.status})`, res.status);
    const [, token, privateToken] = b64decode(match[1]).split(":::");
    if (!token) throw new KantianaError("Moodle SSO launch returned an empty token", 401);
    this.token = token;
    this.privateToken = privateToken ?? null;
    return token;
  }

  /** Calls any Moodle web-service function. */
  async call<T = unknown>(wsfunction: string, args: MoodleArgs = {}): Promise<T> {
    if (!this.token) throw new KantianaError("Moodle: not authenticated", 401);
    const body = encodeMoodleArgs(args);
    body.set("wstoken", this.token);
    body.set("wsfunction", wsfunction);
    body.set("moodlewsrestformat", "json");
    const res = await this.http.request(`${this.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new KantianaError(`Moodle ${wsfunction} -> HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    if (data && typeof data === "object" && "exception" in data) {
      const err = data as { message?: string; errorcode?: string };
      throw new KantianaError(`Moodle ${wsfunction}: ${err.message}`, res.status, err.errorcode);
    }
    return data as T;
  }

  /** Appends the token so pluginfile.php URLs can be downloaded directly. */
  fileUrl(url: string): string {
    if (!this.token) return url;
    const u = new URL(url.includes("/webservice/pluginfile.php/") ? url : url.replace("/pluginfile.php/", "/webservice/pluginfile.php/"));
    u.searchParams.set("token", this.token);
    return u.toString();
  }

  async download(url: string): Promise<Response> {
    return this.http.request(this.fileUrl(url));
  }

  /** Uploads a file to the user's draft area; returns the draft itemid for use in submissions. */
  async uploadFile(filename: string, data: Blob | ArrayBuffer | Uint8Array, itemid = 0): Promise<number> {
    if (!this.token) throw new KantianaError("Moodle: not authenticated", 401);
    const form = new FormData();
    form.set("token", this.token);
    form.set("filearea", "draft");
    form.set("itemid", String(itemid));
    const blob = data instanceof Blob ? data : new Blob([data as ArrayBuffer]);
    form.set("file_1", blob, filename);
    const res = await this.http.request(`${this.baseUrl}/webservice/upload.php`, { method: "POST", body: form });
    const json = (await res.json()) as { itemid?: number; error?: string }[] | { error?: string };
    if (!Array.isArray(json) || json[0]?.itemid === undefined) {
      throw new KantianaError(`Moodle upload failed: ${JSON.stringify(json).slice(0, 200)}`, res.status);
    }
    return json[0].itemid;
  }

  // ---- Convenience wrappers -------------------------------------------------

  async siteInfo(refresh = false): Promise<MoodleSiteInfo> {
    if (!this.site || refresh) this.site = await this.call<MoodleSiteInfo>("core_webservice_get_site_info");
    return this.site;
  }

  async userId(): Promise<number> {
    return (await this.siteInfo()).userid;
  }

  async courses(): Promise<MoodleCourse[]> {
    return this.call<MoodleCourse[]>("core_enrol_get_users_courses", { userid: await this.userId(), returnusercount: 0 });
  }

  async recentCourses(limit = 10): Promise<MoodleCourse[]> {
    return this.call<MoodleCourse[]>("core_course_get_recent_courses", { limit });
  }

  async courseContents(courseid: number): Promise<MoodleSection[]> {
    return this.call<MoodleSection[]>("core_course_get_contents", { courseid });
  }

  async assignments(courseids: number[] = []): Promise<{ courses: { id: number; fullname: string; assignments: MoodleAssignment[] }[] }> {
    return this.call("mod_assign_get_assignments", { courseids });
  }

  async submissionStatus(assignid: number): Promise<unknown> {
    return this.call("mod_assign_get_submission_status", { assignid });
  }

  /** Saves (draft) an assignment submission with online text and/or a draft file area. */
  async saveSubmission(assignmentid: number, plugindata: { text?: string; fileItemId?: number }): Promise<unknown> {
    const data: MoodleArgs = {};
    if (plugindata.text !== undefined) {
      data.onlinetext_editor = { text: plugindata.text, format: 1, itemid: 0 };
    }
    if (plugindata.fileItemId !== undefined) data.files_filemanager = plugindata.fileItemId;
    return this.call("mod_assign_save_submission", { assignmentid, plugindata: data });
  }

  async submitForGrading(assignmentid: number, acceptsubmissionstatement = true): Promise<unknown> {
    return this.call("mod_assign_submit_for_grading", { assignmentid, acceptsubmissionstatement });
  }

  async gradesOverview(): Promise<{ grades: { courseid: number; grade: string; rawgrade: string | null; rank?: number }[] }> {
    return this.call("gradereport_overview_get_course_grades", { userid: await this.userId() });
  }

  async courseGrades(courseid: number): Promise<unknown> {
    return this.call("gradereport_user_get_grade_items", { courseid, userid: await this.userId() });
  }

  async upcomingEvents(): Promise<{ events: MoodleEvent[] }> {
    return this.call("core_calendar_get_calendar_upcoming_view");
  }

  /** Deadlines / to-do items ("Timeline" block). */
  async actionEvents(opts: { from?: number; to?: number; limit?: number } = {}): Promise<{ events: MoodleEvent[] }> {
    const now = Math.floor(Date.now() / 1000);
    return this.call("core_calendar_get_action_events_by_timesort", {
      timesortfrom: opts.from ?? now - 14 * 86400,
      timesortto: opts.to,
      limitnum: opts.limit ?? 50,
    });
  }

  async monthEvents(year: number, month: number): Promise<unknown> {
    return this.call("core_calendar_get_calendar_monthly_view", { year, month });
  }

  async conversations(limit = 20, offset = 0): Promise<unknown> {
    return this.call("core_message_get_conversations", { userid: await this.userId(), limitfrom: offset, limitnum: limit });
  }

  async conversationMessages(convid: number, limit = 50, offset = 0): Promise<unknown> {
    return this.call("core_message_get_conversation_messages", {
      currentuserid: await this.userId(),
      convid,
      limitfrom: offset,
      limitnum: limit,
      newest: 1,
    });
  }

  async sendMessage(touserid: number, text: string): Promise<unknown> {
    return this.call("core_message_send_instant_messages", { messages: [{ touserid, text, textformat: 2 }] });
  }

  async notifications(limit = 20, offset = 0): Promise<unknown> {
    return this.call("message_popup_get_popup_notifications", { useridto: await this.userId(), limit, offset });
  }

  async forumDiscussions(forumid: number, page = 0, perpage = 20): Promise<unknown> {
    return this.call("mod_forum_get_forum_discussions", { forumid, page, perpage });
  }

  async discussionPosts(discussionid: number): Promise<unknown> {
    return this.call("mod_forum_get_discussion_posts", { discussionid });
  }

  async quizzes(courseids: number[] = []): Promise<unknown> {
    return this.call("mod_quiz_get_quizzes_by_courses", { courseids });
  }

  async quizAttempts(quizid: number): Promise<unknown> {
    return this.call("mod_quiz_get_user_attempts", { quizid, status: "all" });
  }

  async markModuleComplete(cmid: number, completed = true): Promise<unknown> {
    return this.call("core_completion_update_activity_completion_status_manually", { cmid, completed });
  }

  async viewCourse(courseid: number): Promise<unknown> {
    return this.call("core_course_view_course", { courseid });
  }

  async searchCourses(query: string, page = 0, perpage = 20): Promise<unknown> {
    return this.call("core_course_search_courses", { criterianame: "search", criteriavalue: query, page, perpage });
  }

  async courseParticipants(courseid: number): Promise<unknown> {
    return this.call("core_enrol_get_enrolled_users", { courseid });
  }
}
