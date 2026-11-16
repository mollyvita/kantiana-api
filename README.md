# kantiana-api

TypeScript API client for BFU Kantiana (Балтийский федеральный университет им. И. Канта):

- **lk.kantiana.ru** — personal account: profile, schedule (personal / group / teacher), notices, news, service SSO links
- **eios.kantiana.ru** — Moodle 4.5 (ЭИОС) where courses live: courses, materials, files, assignments + submissions, grades, deadlines, calendar, messages, forums, quizzes
- **lms.kantiana.ru** — Moodle 5.2 online-learning platform (password login)

Runs anywhere with `fetch`: Node 18+, Cloudflare Workers, Deno, Bun. No runtime dependencies.

> MCP server: [mollyvita/kantiana-mcp](https://github.com/mollyvita/kantiana-mcp) · iOS app: [mollyvita/kantiana-ios](https://github.com/mollyvita/kantiana-ios)

## Install

```bash
npm install github:mollyvita/kantiana-api
```

## Quick start

```ts
import { KantianaClient } from "kantiana-api";

const c = new KantianaClient();
await c.login("ivanov", "password"); // or "ivanov@stud.kantiana.ru"; employees: login(..., "employee")

// LK
const profile = await c.lk.profile();
const today = await c.lk.schedule();              // one day, defaults to today
const week = await c.lk.scheduleRange(new Date(), 7);
const group = await c.lk.groupSchedule("03_ФИИТ_26_1", "2026-11-17");
const teachers = await c.lk.searchTeachers("Белова");
const notices = await c.lk.notices({ count: 20, active: true });
await c.lk.dismissNotice(notices.items[0].id);
const news = await c.lk.news({ count: 10 });

// eios Moodle (SSO through LK)
await c.connectEios();
const courses = await c.eios.courses();
const sections = await c.eios.courseContents(courses[0].id);
const file = await c.eios.download(sections[0].modules[0].contents![0].fileurl!);
const { courses: withAssignments } = await c.eios.assignments();
const deadlines = await c.eios.actionEvents();
const grades = await c.eios.gradesOverview();

// Submit an assignment
const itemid = await c.eios.uploadFile("report.pdf", await readFile("report.pdf"));
await c.eios.saveSubmission(assignId, { text: "<p>Done</p>", fileItemId: itemid });
await c.eios.submitForGrading(assignId);

// Any of the ~440 Moodle web-service functions
await c.eios.call("core_course_get_updates_since", { courseid: 517, since: 0 });
```

## Sessions

```ts
const saved = c.exportSession();          // cookies + Moodle tokens, JSON-serialisable
const c2 = KantianaClient.fromSession(saved);
```

The LK cookie lives ~24h. Moodle tokens last much longer.

## How it works

| Service | Auth |
|---|---|
| LK | `GET /` (WAF cookie), `POST /backend/login {login, password}` → `LK` cookie |
| eios | `GET /backend/profile/refresh` → `eios` SSO URL → `MoodleSession` → `admin/tool/mobile/launch.php` → `moodlemobile://token=…` → WS token |
| lms | `login/token.php` with full e-mail + password |

Gotchas:
- The WAF in front of `*.kantiana.ru` returns 403 to non-browser User-Agents; the client sends a Chrome UA.
- The WAF also blocks `urlscheme=moodlemobile` on `launch.php`; the client omits it (Moodle's default is the same).
- LK `/schedule*` endpoints return `400 Invalid request headers` when the `date` param is missing.

## Development

```bash
npm install
npm run build && npm test
LK_LOGIN=... LK_PASSWORD=... npm run smoke   # live check against real services
```

## License

MIT
