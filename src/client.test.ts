import assert from "node:assert/strict";
import test from "node:test";

import {
  assertActiveSchoolYear,
  buildUpdateLessonPayload,
  comparableLessonText,
  lessonFormattingIssues,
  savedLessonMatches,
} from "./client.js";
import type { LessonRecord } from "./types.js";

test("uses Planbook's first-party field set when creating an empty lesson", () => {
  const payload = buildUpdateLessonPayload({
    classId: "class-6",
    date: "08/13/2026",
    title: "First Day",
    lessonText: '<div style="font-family: Arial, sans-serif;">Lesson</div>',
  });

  assert.equal(payload.lessonTitle, "First Day");
  assert.equal(payload.lessonText, '<div style="font-family: Arial, sans-serif;">Lesson</div>');
  assert.equal(payload.extraLesson, "0");
  assert.equal("lessonId" in payload, false);
  assert.equal("oldLesson" in payload, false);
  assert.equal("fetchDay" in payload, false);
  assert.equal("linkedLessonId" in payload, false);
  assert.equal("isEditingALinkedLesson" in payload, false);
});

test("preserves untouched lesson tabs when updating an existing lesson", () => {
  const existing: LessonRecord = {
    id: "lesson-1",
    classId: "class-6",
    date: "08/13/2026",
    title: "Old title",
    lessonText: "<p>Old lesson</p>",
    homeworkText: "<p>Homework</p>",
    notesText: "",
    tab4Text: "",
    tab5Text: "",
    tab6Text: "",
    raw: {},
  };
  const payload = buildUpdateLessonPayload({
    classId: "class-6",
    date: "08/13/2026",
    title: "New title",
    lessonText: "<p>New lesson</p>",
    existing,
  });

  assert.equal(payload.lessonTitle, "New title");
  assert.equal(payload.lessonText, "<p>New lesson</p>");
  assert.equal(payload.homeworkText, "<p>Homework</p>");
});

test("compares Planbook HTML entities with their formatted source text", () => {
  const source = "First Day of ELA – Building Community & Collaboration";
  const saved = "<p>First Day of ELA &ndash; Building Community &amp; Collaboration</p>";

  assert.equal(comparableLessonText(saved), comparableLessonText(source));
});

test("rejects a save that preserves text but leaks Markdown and loses formatting", () => {
  const expected = '<div style="font-family: Arial, sans-serif;"><p><strong>Standards</strong></p><ul><li>ELA.9.R.1.1 – Analyze a text.</li></ul><p><strong>Reading (0:05–0:20)</strong><br></p></div>';
  const leaked = '<div style="font-family: Arial, sans-serif;"><p>## Standards</p><p>**ELA.9.R.1.1 – Analyze a text.**</p><p>### Reading (0:05&ndash;0:20)</p></div>';

  assert.equal(comparableLessonText(leaked), comparableLessonText(expected));
  assert.equal(savedLessonMatches(leaked, expected), false);
  assert.deepEqual(lessonFormattingIssues(leaked), [
    "Markdown heading marker is visible",
    "Markdown emphasis or escape marker is visible",
    "timed header is not bold",
    "timed header has no soft break",
  ]);
});

test("accepts an entity-normalized save with the complete expected structure", () => {
  const expected = '<div style="font-family: Arial, sans-serif;"><p><strong>Reading (0:05–0:20)</strong><br></p><ul><li>Text &amp; evidence → response</li></ul></div>';
  const saved = '<div style="font-family: Arial, sans-serif;"><p><strong>Reading (0:05&ndash;0:20)</strong><br></p><ul><li>Text &amp; evidence &rightarrow; response</li></ul></div>';

  assert.equal(savedLessonMatches(saved, expected), true);
  assert.equal(savedLessonMatches(saved.replace("Text &amp; evidence", "Text and evidence"), expected), false);
});

test("accepts Planbook directional-arrow entities without weakening structure checks", () => {
  const expected = '<div style="font-family: Arial, sans-serif;"><p><strong>Plot Sequence</strong></p><p>PLOT EVENT ↓ CHARACTER INTERACTION → PLOT DEVELOPMENT</p></div>';
  const saved = '<div style="font-family: Arial, sans-serif;"><p><strong>Plot Sequence</strong></p><p>PLOT EVENT &darr; CHARACTER INTERACTION &rarr; PLOT DEVELOPMENT</p></div>';

  assert.equal(savedLessonMatches(saved, expected), true);
  assert.equal(savedLessonMatches(saved.replace("<strong>Plot Sequence</strong>", "Plot Sequence"), expected), false);
});

test("accepts Planbook typographic quote entities without changing lesson text", () => {
  const expected = '<div style="font-family: Arial, sans-serif;"><p><strong>Bell Ringer</strong></p><p>Ask: “Whose pencil is this?” It is Ana’s notebook.</p></div>';
  const saved = '<div style="font-family: Arial, sans-serif;"><p><strong>Bell Ringer</strong></p><p>Ask: &ldquo;Whose pencil is this?&rdquo; It is Ana&rsquo;s notebook.</p></div>';

  assert.equal(savedLessonMatches(saved, expected), true);
  assert.equal(savedLessonMatches(saved.replace("pencil", "notebook"), expected), false);
});

test("rejects visible pasted whitespace entities and hard-break markers", () => {
  const leaked = '<div style="font-family: Arial, sans-serif;"><p>Use vocabulary &amp;#x20;\\</p></div>';

  assert.deepEqual(lessonFormattingIssues(leaked), [
    "pasted whitespace entity is visible",
    "Markdown hard-break marker is visible",
  ]);
});

test("requires bold and soft-break formatting for minute-range headers", () => {
  const formatted = '<div style="font-family: Arial, sans-serif;"><p><strong>0–5 min | Bell Ringer</strong><br>Students respond.</p></div>';
  const plain = '<div style="font-family: Arial, sans-serif;"><p>0–5 min | Bell Ringer Students respond.</p></div>';

  assert.deepEqual(lessonFormattingIssues(formatted), []);
  assert.deepEqual(lessonFormattingIssues(plain), [
    "timed header is not bold",
    "timed header has no soft break",
  ]);
});

test("fails closed when Planbook has a different school year active", () => {
  assert.doesNotThrow(() =>
    assertActiveSchoolYear("year-2026", "year-2026", "MBA 2026-2027", "08/13/2026"),
  );
  assert.throws(
    () => assertActiveSchoolYear("year-2025", "year-2026", "MBA 2026-2027", "08/13/2026"),
    /Switch the Planbook year selector to MBA 2026-2027 in Chrome/,
  );
});

test("bulk reads each class feed once and each required event date once", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.PLANBOOK_ID_TOKEN;
  const calls: string[] = [];
  process.env.PLANBOOK_ID_TOKEN = "test-token";

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/getSettings") {
      return jsonResponse({
        currentYearId: "year-1",
        userData: { teacherId: "teacher-1" },
        years: [{
          yearId: "year-1",
          yearName: "2026-2027",
          firstDay: "08/01/2026",
          lastDay: "06/30/2027",
        }],
      });
    }
    if (url.pathname === "/getClassLessons" && url.searchParams.get("classId") === "class-1") {
      return jsonResponse({
        classId: "class-1",
        lessons: [
          { classId: "class-1", date: "08/31/2026", lessonId: "lesson-1", lessonTitle: "One", lessonText: "<p>One</p>" },
          { classId: "class-1", date: "09/01/2026", lessonId: "0", lessonTitle: "", lessonText: "" },
        ],
      });
    }
    if (url.pathname === "/getClassLessons" && url.searchParams.get("classId") === "class-2") {
      return jsonResponse({
        classId: "class-2",
        lessons: [
          { classId: "class-2", date: "08/31/2026", lessonId: "0", lessonTitle: "", lessonText: "" },
        ],
      });
    }
    if (url.pathname === "/getLessonsEvents" && url.searchParams.get("date") === "09/01/2026") {
      return jsonResponse({
        day: {
          date: "09/01/2026",
          objects: [{ classId: "class-2", lessonId: "lesson-2", lessonTitle: "Two", lessonText: "<p>Two</p>" }],
        },
      });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const client = new (await import("./client.js")).PlanbookClient();
    const slots = await client.getLessonsForClasses(
      ["08/31/2026", "09/01/2026"],
      [
        { id: "class-1", name: "Class - P1", yearId: "year-1" },
        { id: "class-2", name: "Class - P2", yearId: "year-1" },
      ],
    );
    assert.equal(slots.length, 4);
    assert.equal(slots.find((slot) => slot.classId === "class-1" && slot.date === "08/31/2026")?.lesson?.title, "One");
    assert.equal(slots.find((slot) => slot.classId === "class-2" && slot.date === "09/01/2026")?.lesson?.title, "Two");
    assert.equal(calls.filter((call) => call.startsWith("/getClassLessons")).length, 2);
    assert.equal(calls.filter((call) => call.startsWith("/getLessonsEvents")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.PLANBOOK_ID_TOKEN;
    else process.env.PLANBOOK_ID_TOKEN = originalToken;
  }
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
