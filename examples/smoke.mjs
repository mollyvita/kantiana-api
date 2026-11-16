// Live smoke test: LK_LOGIN=... LK_PASSWORD=... npm run build && npm run smoke
import { KantianaClient } from "../dist/index.js";

const c = new KantianaClient();
await c.login(process.env.LK_LOGIN, process.env.LK_PASSWORD);
const p = await c.lk.profile();
console.log("profile:", p.people.type, p.people.main_onec_univer_data?.group ?? "");
const week = await c.lk.scheduleRange(undefined, 7);
console.log("schedule days:", week.length, "classes this week:", week.reduce((n, d) => n + d.classes.length, 0));
const notices = await c.lk.notices({ count: 5 });
console.log("notices:", notices.items.length, "/", notices.total);
const news = await c.lk.news({ count: 3 });
console.log("news:", news.items.length, "/", news.total);
const groups = await c.lk.groups();
console.log("groups:", groups.length);
const teachers = await c.lk.searchTeachers("Белова");
console.log("teachers:", teachers.items.length);
if (teachers.items[0]) console.log("teacher days:", (await c.lk.teacherSchedule(teachers.items[0].onec_univer_id)).length);

await c.connectEios();
const si = await c.eios.siteInfo();
console.log("eios:", si.release, "functions:", si.functions.length);
const courses = await c.eios.courses();
console.log("courses:", courses.map((x) => x.fullname));
if (courses[0]) {
  const sections = await c.eios.courseContents(courses[0].id);
  console.log("sections:", sections.length, "modules:", sections.reduce((n, s) => n + s.modules.length, 0));
  const file = sections.flatMap((s) => s.modules).flatMap((m) => m.contents ?? []).find((f) => f.fileurl);
  if (file) {
    const r = await c.eios.download(file.fileurl);
    console.log("download:", r.status, r.headers.get("content-type"), file.filename);
  }
}
console.log("grades:", (await c.eios.gradesOverview()).grades.length);
console.log("deadlines:", (await c.eios.actionEvents()).events.length);
console.log("upcoming:", (await c.eios.upcomingEvents()).events.length);
console.log("assignments courses:", (await c.eios.assignments()).courses.length);
console.log("conversations:", JSON.stringify(await c.eios.conversations()).slice(0, 80));

await c.connectLms();
console.log("lms:", (await c.lms.siteInfo()).release, "courses:", (await c.lms.courses()).length);

const restored = KantianaClient.fromSession(JSON.parse(JSON.stringify(c.exportSession())));
console.log("restored session profile ok:", (await restored.lk.profile()).people.root_id === p.people.root_id);
console.log("restored eios ok:", (await restored.eios.siteInfo()).userid === si.userid);
