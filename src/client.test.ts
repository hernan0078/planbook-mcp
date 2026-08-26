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

test("rejects visible pasted whitespace entities and hard-break markers", () => {
  const leaked = '<div style="font-family: Arial, sans-serif;"><p>Use vocabulary &amp;#x20;\\</p></div>';

  assert.deepEqual(lessonFormattingIssues(leaked), [
    "pasted whitespace entity is visible",
    "Markdown hard-break marker is visible",
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
