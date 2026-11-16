import assert from "node:assert/strict";
import test from "node:test";

import { formatLessonPlan } from "./format.js";

// Synthetic fixture only. Never replace with lesson text extracted from Planbook.
const PACKAGED_LESSON = `Word Worksheets
I created the student materials.
Download Student Worksheet
3 printable pages
Download Teacher Answer Key
2 pages

Lesson Title
Weather Words and Forecasts
Class: Example Course
Textbook: Example Text
90-Minute Lesson | Book, pp. 20-21

Standards
ELA.6.V.1.1 – Use academic vocabulary.

Materials
- Weather picture cards
- Audio Track 4.2

Lesson (90 Minutes)

Warm-Up (0:00-0:10)
Students make a choice between two weather pictures and explain it.
Play Track 2.14 while students listen for weather words.
Students practice active listening with a partner.
Partners compare forecasts (CD 1, Track 3) and circle the adjectives.
Possible answers: sunny, cloudy, windy

Mini Lesson (0:10-0:30)
Grammar Review
Reading the forecast aloud, students underline adjectives.
Focus questions include:
What is the weather today?
What will it be tomorrow?
Students watch the video clip about storms and take notes.
Extension practice: students add one additional example to their chart.
Sample answers:
- It is rainy.
- It will be windy.
Teacher circulates and checks charts.

Optional Extension:
- Write a forecast for another city.
- Draw a weather map.

Assessment
Exit Ticket – Formative

Follow-up (optional): Students interview a family member about the weather.

ESOL Strategies
ESOL.A1 – Visuals`;

const PROFILE = { cleanupProfile: "hernan-planbook" } as const;

test("cleanup profile removes export packaging and keeps the lesson title and body", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.equal(result.title, "Weather Words and Forecasts");
  assert.doesNotMatch(result.html, /Word Worksheets|student materials|Download|printable pages|<p>2 pages<\/p>/i);
  assert.match(result.html, /<p><strong>Standards<\/strong><\/p><ul><li>ELA\.6\.V\.1\.1 – Use academic vocabulary\.<\/li><\/ul>/);
  assert.equal(result.cleanup?.profile, "hernan-planbook");
  assert.equal(result.cleanup?.removed.packaging, 6);
});

test("cleanup profile removes redundant metadata and keeps a meaningful subtitle", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.doesNotMatch(result.html, /Class:|Textbook:|Example Course|Example Text/);
  assert.match(result.html, /<p>90-Minute Lesson \| Book, pp\. 20-21<\/p>/);
  assert.equal(result.cleanup?.removed.metadata, 2);
});

test("cleanup profile removes optional content but keeps required choice, extension, and additional work", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.doesNotMatch(result.html, /Optional Extension|another city|weather map|Follow-up|family member/i);
  assert.match(result.html, /<p>Students make a choice between two weather pictures and explain it\.<\/p>/);
  assert.match(result.html, /<p>Extension practice: students add one additional example to their chart\.<\/p>/);
  assert.match(result.html, /<p><strong>Assessment<\/strong><\/p><ul><li>Exit Ticket – Formative<\/li><\/ul>/);
  assert.match(result.html, /<p><strong>ESOL Strategies<\/strong><\/p><ul><li>ESOL\.A1 – Visuals<\/li><\/ul>/);
  assert.equal(result.cleanup?.removed.optional, 4);
});

test("cleanup profile omits audio-track references without touching listening or video work", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.doesNotMatch(result.html, /Track|Audio|CD 1/i);
  assert.match(result.html, /<p>Students practice active listening with a partner\.<\/p>/);
  assert.match(result.html, /<p>Partners compare forecasts and circle the adjectives\.<\/p>/);
  assert.match(result.html, /<p>Students watch the video clip about storms and take notes\.<\/p>/);
  assert.match(result.html, /<ul><li>Weather picture cards<\/li><\/ul>/);
  assert.equal(result.cleanup?.removed.audio, 3);
});

test("cleanup profile removes non-Expected answer scaffolds and their answer lists", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.doesNotMatch(result.html, /Possible answers|Sample answers|sunny, cloudy|It is rainy|It will be windy/);
  assert.match(result.html, /<p>Teacher circulates and checks charts\.<\/p>/);
  assert.equal(result.cleanup?.removed.answerScaffolds, 4);
});

test("cleanup profile keeps ordinary cues inside timed sections from becoming bold headings", () => {
  const result = formatLessonPlan(PACKAGED_LESSON, PROFILE);

  assert.match(result.html, /<p><strong>Mini Lesson \(0:10–0:30\)<\/strong><br><\/p><p>Grammar Review<\/p>/);
  assert.match(result.html, /<p>Reading the forecast aloud, students underline adjectives\.<\/p>/);
  assert.match(
    result.html,
    /<p>Focus questions include:<\/p><ul><li>What is the weather today\?<\/li><li>What will it be tomorrow\?<\/li><\/ul>/,
  );
  assert.ok(!result.headings.includes("Grammar Review"));
  assert.ok(result.headings.includes("Assessment"));
  assert.ok(result.headings.includes("ESOL Strategies"));
  assert.equal(result.cleanup?.demotedCues, 3);
});

test("cleanup profile keeps explicit Markdown subheadings inside timed sections bold", () => {
  const result = formatLessonPlan(`# Forecast Practice
Standards
ELA.6.V.1.1 – Use academic vocabulary.

Guided Practice (0:10-0:30)
### Grammar Review
Students sort adjectives.
Reading
Students read the forecast.`, PROFILE);

  assert.match(result.html, /<p><strong>Grammar Review<\/strong><\/p><p>Students sort adjectives\.<\/p><p>Reading<\/p>/);
});

test("cleanup profile keeps untimed structural activity headers bold", () => {
  const result = formatLessonPlan(`# Forecast Practice
Standards
ELA.6.V.1.1 – Use academic vocabulary.

Guided Practice (0:10-0:30)
Students sort adjectives.
Closure
Students share one forecast.`, PROFILE);

  assert.match(result.html, /<p><strong>Closure<\/strong><\/p><p>Students share one forecast\.<\/p>/);
  assert.equal(result.cleanup?.demotedCues, 0);
});

test("formatter without a cleanup profile keeps the v2.1.6 behavior", () => {
  const result = formatLessonPlan(PACKAGED_LESSON);

  assert.equal(result.cleanup, undefined);
  assert.match(result.html, /Download Student Worksheet/);
  assert.match(result.html, /Textbook: Example Text/);
  assert.match(result.html, /Play Track 2\.14/);
  assert.match(result.html, /Possible answers: sunny, cloudy, windy/);
  assert.match(result.html, /Optional Extension/);
  assert.match(result.html, /<p><strong>Grammar Review<\/strong><\/p>/);
});

test("rejects an unknown cleanup profile", () => {
  assert.throws(
    () => formatLessonPlan(PACKAGED_LESSON, { cleanupProfile: "unknown" as never }),
    /Unknown cleanup profile/,
  );
});
