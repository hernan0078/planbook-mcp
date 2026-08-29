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
  assert.match(
    result.html,
    /<ul><li>ELA\.8\.R\.1\.1 - Analyze how text structures contribute to meaning<\/li><li>ELA\.8\.R\.3\.1 – Explain how literary elements impact meaning<\/li><\/ul>/,
  );
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

test("bolds and separates every timed header style", () => {
  const result = formatLessonPlan(`Lesson Title
Timing

Lesson - 90 Minutes
Bell Ringer - 0:00-0:10
Students respond.
Guided Practice (0:10-0:25)
Students practice.`);

  assert.match(result.html, /<p><strong>Lesson - 90 Minutes<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Bell Ringer \(0:00–0:10\)<\/strong><br><\/p>/);
  assert.match(result.html, /<p><strong>Guided Practice \(0:10–0:25\)<\/strong><br><\/p>/);
});

test("formats semantic sections and preserves explicit list markers", () => {
  const result = formatLessonPlan(`Lesson Title
Community

Objectives
Students will be able to:
Ask questions.
Answer questions.

Materials
Sticky notes
Course syllabus

Assessment
Exit Ticket - Formative

ESOL Strategies
ESOL.A2 - Modeling
ESOL.C56 - Collaborative Groups

Teacher reviews:
Respect others.
Follow directions.

Steps:
1. Read the prompt
2. Share an answer

Choices:
* Beach
* Pool`);

  assert.match(result.html, /<p><strong>ESOL Strategies<\/strong><\/p><ul>/);
  assert.match(result.html, /<li>ESOL\.A2 - Modeling<\/li>/);
  assert.match(result.html, /<p><strong>Materials<\/strong><\/p><ul>/);
  assert.match(result.html, /<p>Teacher reviews:<\/p><ul><li>Respect others\.<\/li>/);
  assert.match(result.html, /<ol><li>Read the prompt<\/li><li>Share an answer<\/li><\/ol>/);
  assert.match(result.html, /<ul><li>Beach<\/li><li>Pool<\/li><\/ul>/);
});

test("accepts Markdown lesson plans without leaking markup into Planbook", () => {
  const result = formatLessonPlan(`# Community Vocabulary

## Standards
**ELA.8.V.1.1** - Use academic vocabulary.

## Essential Question
**How do words build community?**

# Lesson - 50 Minutes
### Word Warm-Up (0:00-0:05)
- A new word is \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_.

## Pages / Materials
- **Vocabulary cards**

## ESOL Strategies
- **ESOL.A2 - Modeling**`);

  assert.equal(result.title, "Community Vocabulary");
  assert.doesNotMatch(result.html, /(?:##|\*\*|\\_)/);
  assert.match(result.html, /<p><strong>Standards<\/strong><\/p><ul>/);
  assert.match(result.html, /<li>ELA\.8\.V\.1\.1 - Use academic vocabulary\.<\/li>/);
  assert.match(result.html, /<p>How do words build community\?<\/p>/);
  assert.match(result.html, /<p><strong>Word Warm-Up \(0:00–0:05\)<\/strong><br><\/p>/);
  assert.match(result.html, /<li>A new word is __________\.<\/li>/);
  assert.match(result.html, /<p><strong>ESOL Strategies<\/strong><\/p><ul><li>ESOL\.A2 - Modeling<\/li>/);
});

test("removes nested Markdown emphasis without consuming source bullets", () => {
  const result = formatLessonPlan(`# Lesson Title

**Point of View - Seeing *Thank You, Ma'am* Through Roger's Eyes**

## Standards
- **ELA.6.R.1.3** - Explain point of view.

### Reading - *Thank You, Ma'am* (0:05-0:20)
- **Use *text evidence* in the response.**`);

  assert.equal(result.title, "Point of View - Seeing Thank You, Ma'am Through Roger's Eyes");
  assert.doesNotMatch(result.html, /(?:\*\*|##|`)/);
  assert.match(result.html, /<li>ELA\.6\.R\.1\.3 - Explain point of view\.<\/li>/);
  assert.match(result.html, /<p><strong>Reading - Thank You, Ma&#39;am \(0:05–0:20\)<\/strong><br><\/p>/);
  assert.match(result.html, /<li>Use text evidence in the response\.<\/li>/);
});

test("extracts an unlabeled leading title when Standards follows", () => {
  const result = formatLessonPlan(`Unit 1 - My Life: The Verb Be and Uncover the Story
Standards
ELA.9.C.3.1 - Follow standard English grammar.

Essential Question
How can we use the verb be?`);

  assert.equal(result.title, "Unit 1 - My Life: The Verb Be and Uncover the Story");
  assert.match(result.html, /^<div style="font-family: Arial, sans-serif;"><p><strong>Standards<\/strong><\/p>/);
  assert.doesNotMatch(result.html, /Verb Be and Uncover the Story/);
});

test("extracts an unlabeled title followed directly by standard bullets", () => {
  const result = formatLessonPlan(`Characterization Quiz Review, Point of View, and Plot - Thank You, Ma'am
- ELA.6.R.1.3 - Explain point of view.
- ELA.6.R.1.1 - Analyze character interactions.

Students will be able to:
- Identify point of view.`);

  assert.equal(result.title, "Characterization Quiz Review, Point of View, and Plot - Thank You, Ma'am");
  assert.doesNotMatch(result.html, /Characterization Quiz Review/);
  assert.match(result.html, /<ul><li>ELA\.6\.R\.1\.3 - Explain point of view\.<\/li>/);
});

test("extracts a bold title before one subtitle and formats encoded minute-range blocks", () => {
  const result = formatLessonPlan(`**Possessive Adjectives and Possessive Nouns**
**ESOL 1-2 HS | 50-Minute Lesson**
**Standards**
ELA.9.C.3.1 - Follow standard English grammar.
**Lesson**
**0-5 min | Bell Ringer -&#x20;**&#x44;isplay three classroom objects.
**5-15 min | Direct Instruction -&#x20;**&#x55;se the presentation.`);

  assert.equal(result.title, "Possessive Adjectives and Possessive Nouns");
  assert.doesNotMatch(result.html, /\*\*|&#x(?:44|55);|&amp;#x(?:44|55);/i);
  assert.doesNotMatch(result.html, /<p>Possessive Adjectives and Possessive Nouns<\/p>/);
  assert.doesNotMatch(result.html, /ESOL 1-2 HS/);
  assert.match(result.html, /<p>50-Minute Lesson<\/p>/);
  assert.match(result.html, /<p><strong>0–5 min \| Bell Ringer -<\/strong><br>Display three classroom objects\.<\/p>/);
  assert.match(result.html, /<p><strong>5–15 min \| Direct Instruction -<\/strong><br>Use the presentation\.<\/p>/);
});

test("extracts a title between an ESOL course label and a lesson subtitle", () => {
  const result = formatLessonPlan(`**ESOL 1-2 HS**
**Proper Nouns, Common Nouns, and Capitalization**
*50-Minute Lesson | Book p. 8*

**Standards**
ELA.9.C.3.1 - Follow standard English grammar.
**Lesson - 50 Minutes**
**0-5 min - Bell Ringer: What Needs a Capital?**
Students classify words.
**Key Teaching Notes: English vs. Spanish**
Students compare capitalization.
**Teacher Emphasis**
Students explain each correction.`);

  assert.equal(result.title, "Proper Nouns, Common Nouns, and Capitalization");
  assert.doesNotMatch(result.html, /<p>(?:<strong>)?Proper Nouns, Common Nouns, and Capitalization/);
  assert.doesNotMatch(result.html, /ESOL 1-2 HS/);
  assert.match(result.html, /<p>50-Minute Lesson \| Book p\. 8<\/p>/);
  assert.match(result.html, /<p><strong>0–5 min - Bell Ringer: What Needs a Capital\?<\/strong><br><\/p>/);
  assert.match(result.html, /<p><strong>Key Teaching Notes: English vs\. Spanish<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Teacher Emphasis<\/strong><\/p>/);
});

test("removes only leading course metadata and preserves ESOL lesson content", () => {
  const result = formatLessonPlan(`Lesson Title
Language Practice

ESOL 3-4 - HS - P5

Standards
ELA.9.C.3.1 - Follow standard English grammar.

Objectives
- Explain how ESOL class supports language growth.

ESOL Strategies
- ESOL.A2 - Modeling`);

  assert.equal(result.title, "Language Practice");
  assert.doesNotMatch(result.html, /ESOL 3-4 - HS - P5/);
  assert.match(result.html, /Explain how ESOL class supports language growth\./);
  assert.match(result.html, /<p><strong>ESOL Strategies<\/strong><\/p>/);
  assert.match(result.html, /<li>ESOL\.A2 - Modeling<\/li>/);
});

test("recognizes spaced ESOL and pipe-delimited ELL course labels", () => {
  const spaced = formatLessonPlan(`ESOL 1 2 HS
Spaced Course Code
Standards
ELA.9.C.3.1 - Follow standard English grammar.`);
  const ell = formatLessonPlan(`ELL Grammar Review
ELL 1 | 50-Minute Lesson
Standards
ELA.9.C.3.1 - Follow standard English grammar.`);

  assert.equal(spaced.title, "Spaced Course Code");
  assert.doesNotMatch(spaced.html, /ESOL 1 2 HS/);
  assert.equal(ell.title, "ELL Grammar Review");
  assert.doesNotMatch(ell.html, /ELL 1/);
  assert.match(ell.html, /<p>50-Minute Lesson<\/p>/);
});

test("formats numbered instructional checkpoints and Blooket review details", () => {
  const result = formatLessonPlan(`Grammar Review: Six Core Skills
Standards
ELA.9.C.3.1 - Follow standard English grammar.

Teacher Review Guide - Six Grammar Checkpoints
1. Articles: a / an / the - Choose the correct article.
Model: I ate an orange.
Quick check: She wants ___ umbrella.
2. Verb Be: am / is / are - Match the subject.
Model: We are classmates.

Blooket Review
30 multiple-choice questions
5 questions per grammar skill`);

  assert.equal(result.title, "Grammar Review: Six Core Skills");
  assert.match(result.html, /<p><strong>Teacher Review Guide - Six Grammar Checkpoints<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>1\. Articles: a \/ an \/ the - Choose the correct article\.<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>2\. Verb Be: am \/ is \/ are - Match the subject\.<\/strong><\/p>/);
  assert.doesNotMatch(result.html, /<ol\b/);
  assert.match(result.html, /<p><strong>Blooket Review<\/strong><\/p><ul><li>30 multiple-choice questions<\/li><li>5 questions per grammar skill<\/li><\/ul>/);
});

test("splits pipe-delimited semantic lists without changing prose or source bullets", () => {
  const result = formatLessonPlan(`Grammar Exam
Standards
ELA.9.C.3.1 - Follow standard English grammar.
Agenda
Settle In | Directions | Grammar Exam
Lesson - 50 Minutes
Teacher contrasts Are you? | Do you? in prose.
- Keep this explicit A | B comparison together.
Materials
Student iPads | Google Form
ESOL Strategies
ESOL.A6 - Direct Language | ESOL.C14 - Chunking`);

  assert.match(result.html, /<p><strong>Agenda<\/strong><\/p><ul><li>Settle In<\/li><li>Directions<\/li><li>Grammar Exam<\/li><\/ul>/);
  assert.match(result.html, /Teacher contrasts Are you\? \| Do you\? in prose\./);
  assert.match(result.html, /<li>Keep this explicit A \| B comparison together\.<\/li>/);
  assert.match(result.html, /<p><strong>Materials<\/strong><\/p><ul><li>Student iPads<\/li><li>Google Form<\/li><\/ul>/);
  assert.match(result.html, /<p><strong>ESOL Strategies<\/strong><\/p><ul><li>ESOL\.A6 - Direct Language<\/li><li>ESOL\.C14 - Chunking<\/li><\/ul>/);
});

test("does not absorb narrative after explicit lists and bolds activity labels", () => {
  const result = formatLessonPlan(`Learning Activities Review
- ELA.8.R.3.2 - Paraphrase grade-level texts.
On the board:
What activity helps you learn?
Students write independently.
Possible sentence frames:
- I spend time __________.
- This helps me __________.
Students share with a partner.
Book - Colored Pages 34-35, Activities 1-2
Students examine the title.
Book - Colored Page 35, Activity 3
Students read the passage.
Vocabulary Review
- affect
- process
Teacher reviews answers.
Grammar Review
A, An, and The
- first mention
Comparatives and Superlatives
- more and most
Adverbs
- always`);

  assert.equal(result.title, "Learning Activities Review");
  assert.match(result.html, /<p><strong>On the board:<\/strong><\/p>/);
  assert.match(result.html, /<p>What activity helps you learn\?<\/p><p>Students write independently\.<\/p>/);
  assert.match(result.html, /<p><strong>Possible sentence frames:<\/strong><\/p><ul><li>I spend time __________\.<\/li><li>This helps me __________\.<\/li><\/ul><p>Students share with a partner\.<\/p>/);
  assert.match(result.html, /<p><strong>Book - Colored Pages 34-35, Activities 1-2<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Book - Colored Page 35, Activity 3<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Vocabulary Review<\/strong><\/p><ul><li>affect<\/li><li>process<\/li><\/ul><p>Teacher reviews answers\.<\/p>/);
  assert.match(result.html, /<p><strong>Grammar Review<\/strong><\/p><p><strong>A, An, and The<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Comparatives and Superlatives<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Adverbs<\/strong><\/p>/);
});

test("separates mixed sublabels, explicit definitions, and later assessment lists", () => {
  const result = formatLessonPlan(`Punny Ways to Learn English
- ELA.8.V.1.3 - Determine word meanings.
Teacher introduces the types of puns:
Homophonic Puns
- Words sound alike but have different meanings.
Homographic Puns
- The same spelling can have different meanings.
Compound Puns
- Several pieces of wordplay appear together.
The purpose is exposure and enjoyment.
Presentation - Slides 4-7
Teacher discusses why puns are interesting.
After submitting, students write down:
What pun do you know?
This provides a transition.
Unit Exam - Summative
Students answer orally:
What was your favorite pun?
- Pun identification - Formative
- Class Participation - Formative
The activities after the exam are low-pressure.
- ESOL.B6 - Role-play
- ESOL.C19 - Multiple Meaning Words`);

  assert.equal(result.title, "Punny Ways to Learn English");
  assert.match(result.html, /<p><strong>Homophonic Puns<\/strong><\/p><ul><li>Words sound alike but have different meanings\.<\/li><\/ul>/);
  assert.match(result.html, /<p><strong>Homographic Puns<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Compound Puns<\/strong><\/p><ul><li>Several pieces of wordplay appear together\.<\/li><\/ul><p>The purpose is exposure and enjoyment\.<\/p>/);
  assert.match(result.html, /<p><strong>Presentation - Slides 4-7<\/strong><\/p><p>Teacher discusses why puns are interesting\.<\/p>/);
  assert.match(result.html, /<p>What pun do you know\?<\/p><p>This provides a transition\.<\/p>/);
  assert.match(result.html, /<p><strong>Unit Exam - Summative<\/strong><\/p>/);
  assert.match(result.html, /<p>What was your favorite pun\?<\/p><ul><li>Pun identification - Formative<\/li><li>Class Participation - Formative<\/li><\/ul><p>The activities after the exam are low-pressure\.<\/p><ul><li>ESOL\.B6 - Role-play<\/li><li>ESOL\.C19 - Multiple Meaning Words<\/li><\/ul>/);
});

test("keeps heading-like agenda and assessment entries as list items", () => {
  const result = formatLessonPlan(`Lesson Title
Context-Aware Lists

Agenda
Bell Ringer - Warm-Up
Guided Practice
Lesson - 50 Minutes
Bell Ringer (0:00-0:05)
Students respond.

Assessment
Bell Ringer - Formative
Exit Ticket - Formative`);

  assert.match(result.html, /<p><strong>Agenda<\/strong><\/p><ul><li>Bell Ringer - Warm-Up<\/li><li>Guided Practice<\/li><\/ul>/);
  assert.match(result.html, /<p><strong>Lesson - 50 Minutes<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Assessment<\/strong><\/p><ul><li>Bell Ringer - Formative<\/li><li>Exit Ticket - Formative<\/li><\/ul>/);
});

test("bolds unfamiliar Markdown subsection headings", () => {
  const result = formatLessonPlan(`# Unit 2 Launch

## Standards
ELA.9.V.1.1 - Use academic vocabulary.

### Explore the Essential Question (0:00-0:10)
### Connect
Students brainstorm.
### Think
Students complete a chart.
### Discuss
Partners share.`);

  assert.equal(result.title, "Unit 2 Launch");
  assert.match(result.html, /<p><strong>Connect<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Think<\/strong><\/p>/);
  assert.match(result.html, /<p><strong>Discuss<\/strong><\/p>/);
  assert.doesNotMatch(result.html, /###/);
});

test("renders Markdown tables without leaking pipe or delimiter syntax", () => {
  const result = formatLessonPlan(`# Object Pronouns

## Grammar

| Subject | Object |
| ------- | ------ |
| I       | me     |
| they    | them   |`);

  assert.match(result.html, /<table[^>]*><thead><tr><th[^>]*>Subject<\/th><th[^>]*>Object<\/th><\/tr><\/thead><tbody>/);
  assert.match(result.html, /<tr><td[^>]*>I<\/td><td[^>]*>me<\/td><\/tr>/);
  assert.match(result.html, /<tr><td[^>]*>they<\/td><td[^>]*>them<\/td><\/tr>/);
  assert.doesNotMatch(result.html.replace(/<[^>]+>/g, ""), /\||---/);
});

test("removes pasted whitespace entities and Markdown hard-break markers", () => {
  const result = formatLessonPlan(`Unit 1 Vocabulary and Grammar Review and Quiz

## Standards
**ELA.9.C.3.1** - Follow standard English grammar.\\
&#x20;**ELA.9.V.1.1** - Use academic vocabulary.

## Objectives
- &#32;Use subject pronouns.&#x20;
- &nbsp;Select am, is, and are.\u00a0`);

  assert.equal(result.title, "Unit 1 Vocabulary and Grammar Review and Quiz");
  assert.doesNotMatch(result.html, /(?:&amp;#x20;|&amp;#32;|&amp;nbsp;|\\)/i);
  assert.match(result.html, /<li>ELA\.9\.C\.3\.1 - Follow standard English grammar\.<\/li>/);
  assert.match(result.html, /<li>ELA\.9\.V\.1\.1 - Use academic vocabulary\.<\/li>/);
  assert.match(result.html, /<li>Use subject pronouns\.<\/li><li>Select am, is, and are\.<\/li>/);
});
