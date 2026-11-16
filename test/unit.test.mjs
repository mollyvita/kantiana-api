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
