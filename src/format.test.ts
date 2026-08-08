import assert from "node:assert/strict";
import test from "node:test";

import { formatLessonPlan, normalizeDate } from "./format.js";

const SAMPLE = `Lesson Title
Poetry Assessment and Rhythm Analysis: Scansion and Meter

⸻

Standards
ELA.8.R.1.1 - Analyze how text structures contribute to meaning
ELA.8.R.3.1 – Explain how literary elements impact meaning

Essential Question
How does rhythm affect meaning?

Objectives
* Identify stressed and unstressed syllables
* Apply scansion symbols

Lesson (90 Minutes)

Bell Ringer (0:00-0:10)
Students read aloud.

Guided Practice (0:10-0:25)
Steps:
1. Break into syllables
2. Identify stress

Assessment
Exit Ticket - Formative
Quiz – Summative

🔔 Why This Lesson Works
* Ends with reflection`;

test("formats a raw lesson deterministically", () => {
  const result = formatLessonPlan(SAMPLE);

  assert.equal(result.title, "Poetry Assessment and Rhythm Analysis: Scansion and Meter");
  assert.match(result.html, /^<div style="font-family: Arial, sans-serif;">/);
  assert.doesNotMatch(result.html, /Impact/);
  assert.doesNotMatch(result.html, /🔔/u);
  assert.match(result.html, /<p><strong>Standards<\/strong><\/p>/);
  assert.match(result.html, /<li>ELA\.8\.R\.1\.1 – Analyze how text structures contribute to meaning<\/li>/);
  assert.match(result.html, /Bell Ringer \(0:00–0:10\)/);
  assert.match(result.html, /<ol><li>Break into syllables<\/li><li>Identify stress<\/li><\/ol>/);
  assert.match(result.html, /<p><strong>Assessment<\/strong><\/p><ul>/);
  assert.doesNotMatch(result.html, /Essential Question:\s*Bellringer:/);
  assert.equal(result.bulletCount, 9);
});

test("normalizes supported dates", () => {
  assert.equal(normalizeDate("2026-05-11"), "05/11/2026");
  assert.equal(normalizeDate("5/1/2026"), "05/01/2026");
  assert.throws(() => normalizeDate("2026-02-30"), /Invalid calendar date/);
  assert.throws(() => normalizeDate("Monday May 11"), /Use YYYY-MM-DD/);
});
