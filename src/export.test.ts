import assert from "node:assert/strict";
import test from "node:test";

import { buildDateRange, extractLesson, parseLessonHtml } from "./export.js";

const savedHtml = `
<div style="font-family: Arial, sans-serif;">
  <p><strong>Standards</strong></p>
  <ul><li>ELA.9.R.1.1 &ndash; Analyze text &amp; evidence.</li><li>ELA.K12.EE.4.1 &ndash; Collaborate.</li></ul>
  <p><strong>Bell Ringer (0:00&ndash;0:05)</strong><br>Answer: &ldquo;What do you notice?&rdquo;</p>
  <p><strong>Guided Practice (0:05&ndash;0:20)</strong><br></p>
  <ol><li>Read the text.</li><li>Cite evidence &darr; explain.</li></ol>
  <table><tr><th>Term</th><th>Meaning</th></tr><tr><td>Theme</td><td>Message | lesson</td></tr></table>
</div>`;

test("parses Planbook HTML into ordered sections, lists, paragraphs, and tables", () => {
  assert.deepEqual(parseLessonHtml(savedHtml), [
    {
      heading: "Standards",
      blocks: [{
        type: "list",
        ordered: false,
        items: [
          "ELA.9.R.1.1 – Analyze text & evidence.",
          "ELA.K12.EE.4.1 – Collaborate.",
        ],
      }],
    },
    {
      heading: "Bell Ringer (0:00–0:05)",
      blocks: [{ type: "paragraph", text: "Answer: “What do you notice?”" }],
    },
    {
      heading: "Guided Practice (0:05–0:20)",
      blocks: [
        { type: "list", ordered: true, items: ["Read the text.", "Cite evidence ↓ explain."] },
        { type: "table", rows: [["Term", "Meaning"], ["Theme", "Message | lesson"]] },
      ],
    },
  ]);
});

test("exports one saved lesson as structured JSON without duplicating full HTML", () => {
  const result = extractLesson(
    "08/31/2026",
    { id: "class-1", name: "ESOL 1-2 - HS - P1", yearId: "year-1" },
    {
      id: "lesson-1",
      classId: "class-1",
      date: "08/31/2026",
      title: "Grammar Review",
      lessonText: savedHtml,
      homeworkText: "",
      notesText: "",
      tab4Text: "",
      tab5Text: "",
      tab6Text: "",
      raw: {},
    },
    "json",
  );

  assert.equal(result.found, true);
  assert.equal(result.period, "P1");
  assert.equal(result.title, "Grammar Review");
  assert.equal(result.content, undefined);
  assert.equal(result.sections?.length, 3);
});

test("renders Markdown and text while preserving list and table structure", () => {
  const lesson = {
    id: "lesson-1",
    title: "Grammar Review",
    lessonText: savedHtml,
    homeworkText: "",
    notesText: "",
    tab4Text: "",
    tab5Text: "",
    tab6Text: "",
    raw: {},
  };
  const targetClass = { id: "class-1", name: "ESOL - P1" };
  const markdown = extractLesson("08/31/2026", targetClass, lesson, "markdown").content ?? "";
  const text = extractLesson("08/31/2026", targetClass, lesson, "text").content ?? "";

  assert.match(markdown, /^# Grammar Review/m);
  assert.match(markdown, /^## Standards/m);
  assert.match(markdown, /^- ELA\.9\.R\.1\.1 – Analyze text & evidence\./m);
  assert.match(markdown, /^1\. Read the text\./m);
  assert.match(markdown, /^\| Term \| Meaning \|$/m);
  assert.match(markdown, /Message \\| lesson/);
  assert.match(text, /^Standards$/m);
  assert.match(text, /^- ELA\.K12\.EE\.4\.1 – Collaborate\./m);
  assert.match(text, /Term\tMeaning/);
});

test("returns exact saved HTML only when html format is requested", () => {
  const result = extractLesson(
    "08/31/2026",
    { id: "class-1", name: "ESOL - P1" },
    {
      id: "lesson-1",
      title: "Grammar Review",
      lessonText: savedHtml,
      homeworkText: "",
      notesText: "",
      tab4Text: "",
      tab5Text: "",
      tab6Text: "",
      raw: {},
    },
    "html",
  );
  assert.equal(result.content, savedHtml);
  assert.equal(result.sections, undefined);
});

test("builds bounded weekday ranges and rejects reversed or oversized ranges", () => {
  assert.deepEqual(buildDateRange("08/28/2026", "09/01/2026", false), [
    "08/28/2026",
    "08/31/2026",
    "09/01/2026",
  ]);
  assert.equal(buildDateRange("08/28/2026", "09/01/2026", true).length, 5);
  assert.throws(() => buildDateRange("09/02/2026", "09/01/2026", false), /on or after/);
  assert.throws(() => buildDateRange("08/01/2026", "09/01/2026", false), /31 calendar days/);
});
