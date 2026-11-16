import { test } from "node:test";
import assert from "node:assert/strict";
import { CookieJar, encodeMoodleArgs, normalizeLogin, MoodleApi, Http } from "../dist/index.js";

test("normalizeLogin", () => {
  assert.equal(normalizeLogin("ivanov"), "ivanov@stud.kantiana.ru");
  assert.equal(normalizeLogin(" ivanov ", "employee"), "ivanov@kantiana.ru");
  assert.equal(normalizeLogin("a@stud.kantiana.ru"), "a@stud.kantiana.ru");
});

test("encodeMoodleArgs flattens nested arrays/objects", () => {
  const p = encodeMoodleArgs({
    courseids: [1, 2],
    messages: [{ touserid: 5, text: "hi" }],
    plugindata: { onlinetext_editor: { text: "x", format: 1 } },
    flag: true,
    skip: undefined,
  });
  assert.equal(
    p.toString(),
    new URLSearchParams([
      ["courseids[0]", "1"],
      ["courseids[1]", "2"],
      ["messages[0][touserid]", "5"],
      ["messages[0][text]", "hi"],
      ["plugindata[onlinetext_editor][text]", "x"],
      ["plugindata[onlinetext_editor][format]", "1"],
      ["flag", "1"],
    ]).toString(),
  );
});

test("CookieJar set/expire/serialize", () => {
  const jar = new CookieJar();
  jar.set("a.ru", ["LK=1; Path=/; HttpOnly", "x=2"]);
  assert.equal(jar.header("a.ru"), "LK=1; x=2");
  jar.set("a.ru", ["x=; Max-Age=0"]);
  assert.equal(jar.header("a.ru"), "LK=1");
  assert.deepEqual(CookieJar.fromJSON(jar.toJSON()).toJSON(), { "a.ru": { LK: "1" } });
});

test("MoodleApi.fileUrl handles both pluginfile forms", () => {
  const m = new MoodleApi(new Http(), "https://eios.kantiana.ru");
  m.token = "T";
  assert.equal(m.fileUrl("https://eios.kantiana.ru/pluginfile.php/1/a.pdf"), "https://eios.kantiana.ru/webservice/pluginfile.php/1/a.pdf?token=T");
  assert.equal(
    m.fileUrl("https://eios.kantiana.ru/webservice/pluginfile.php/1/a.pdf?forcedownload=1"),
    "https://eios.kantiana.ru/webservice/pluginfile.php/1/a.pdf?forcedownload=1&token=T",
  );
});

test("fileUrl never sends the token to other origins", () => {
  const m = new MoodleApi(new Http(), "https://eios.kantiana.ru");
  m.token = "T";
  assert.equal(m.fileUrl("https://evil.example/pluginfile.php/1/a.pdf"), "https://evil.example/pluginfile.php/1/a.pdf");
});

test("CookieJar drops cookies expired via Expires or negative Max-Age", () => {
  const jar = new CookieJar();
  jar.set("h", ["a=1", "b=2", "c=3"]);
  jar.set("h", ["a=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "b=x; Max-Age=-1", "c=4; Expires=Fri, 01 Jan 2100 00:00:00 GMT"]);
  assert.equal(jar.header("h"), "c=4");
});

test("CookieJar: positive Max-Age wins over past Expires", () => {
  const jar = new CookieJar();
  jar.set("h", ["a=1; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
  assert.equal(jar.header("h"), "a=1");
});

test("CookieJar: invalid Max-Age is ignored in favour of Expires", () => {
  const jar = new CookieJar();
  jar.set("h", ["a=1", "a=1; Max-Age=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
  assert.equal(jar.header("h"), undefined);
});
