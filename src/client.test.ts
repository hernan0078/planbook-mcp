import assert from "node:assert/strict";
import test from "node:test";

import { buildUpdateLessonPayload, comparableLessonText } from "./client.js";
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
