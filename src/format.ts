import type { FormattedLesson } from "./types.js";

const TITLE_LABEL = /^lesson\s+title\s*:?[\s]*$/i;
const SEPARATOR = /^[\s\-_=⸻—–]{3,}$/u;
const BULLET = /^\s*[*•-]\s+(.+)$/u;
const NUMBERED = /^\s*(\d+|[A-Da-d])[.)]\s+(.+)$/u;
const STANDARD_CODE = /^(?:[A-Z]{2,}(?:\.[A-Z0-9]+)+|[A-Z]{2,}\.[A-Z0-9.]+)\s*[–—-]/u;
const ASSESSMENT_ITEM = /\s[–—-]\s*(?:Formative|Summative|Classwork)\s*$/i;
const ESOL_STRATEGY = /^ESOL\.[A-Z]\d+\s*[–—-]/i;
const TIME_RANGE = /\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/u;

const KNOWN_HEADER = /^(?:standards|essential\s+question|objectives?|agenda|materials|pages(?:\s*\/\s*materials)?|assessment|esol\s+strategies|why\s+this\s+lesson\s+works|lesson(?:\s+timeline)?(?:\s*[–—-]\s*\d+\s*minutes|\s*\([^)]*\))?|part\s+\d+\b.*|bell\s+ringer\b.*|closure\b.*|mini\s+lesson\b.*|guided\s+practice\b.*|independent\s+practice\b.*|reading\b.*|transition\b.*|assessment\s+expectations\b.*|standards\s+mastery\s+quiz\b.*|early\s+finisher\s+task\b.*)$/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripEmoji(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/\uFE0F/gu, "")
    .trim();
}

function normalizeTimeRanges(value: string): string {
  const normalized = value
    .replace(/(\d{1,2}:\d{2})\s*[-—]\s*(\d{1,2}:\d{2})/g, "$1–$2")
    .replace(/\s+-\s+/g, " – ");
  return normalized.replace(
    /^(.+?)\s+[–—-]\s+(\d{1,2}:\d{2}–\d{1,2}:\d{2})\s*$/u,
    "$1 ($2)",
  );
}

function cleanLine(value: string): string {
  return normalizeTimeRanges(stripEmoji(value)).trim();
}

function isHeading(value: string): boolean {
  const line = value.trim();
  if (!line) return false;
  if (TIME_RANGE.test(line)) return true;
  return KNOWN_HEADER.test(line.replace(/:\s*$/, ""));
}

function sectionName(value: string): string {
  return value.replace(/:\s*$/, "").trim().toLowerCase();
}

function implicitBulletIndexes(lines: string[]): Set<number> {
  const indexes = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const cue = cleanLine(lines[index] ?? "");
    if (!cue.endsWith(":") || isHeading(cue)) continue;

    const candidates: number[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = cleanLine(lines[next] ?? "");
      if (!candidate || SEPARATOR.test(candidate) || isHeading(candidate)) break;
      if (candidate.endsWith(":")) break;
      candidates.push(next);
    }

    if (candidates.length >= 2) {
      for (const candidate of candidates) indexes.add(candidate);
    }
  }

  return indexes;
}

function extractTitle(lines: string[]): { title?: string; body: string[] } {
  const body = [...lines];
  const labelIndex = body.findIndex((line) => TITLE_LABEL.test(cleanLine(line)));
  if (labelIndex === -1) return { body };

  let titleIndex = labelIndex + 1;
  while (titleIndex < body.length) {
    const candidate = cleanLine(body[titleIndex] ?? "");
    if (candidate && !SEPARATOR.test(candidate)) break;
    titleIndex += 1;
  }

  const title = titleIndex < body.length ? cleanLine(body[titleIndex] ?? "") : undefined;
  body.splice(labelIndex, Math.max(1, titleIndex - labelIndex + (title ? 1 : 0)));
  return { title, body };
}

export function normalizeDate(value: string): string {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) {
    const [, year, month, day] = iso;
    validateDateParts(Number(year), Number(month), Number(day), value);
    return `${month}/${day}/${year}`;
  }

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (mdy) {
    const [, month, day, year] = mdy;
    validateDateParts(Number(year), Number(month), Number(day), value);
    return `${month!.padStart(2, "0")}/${day!.padStart(2, "0")}/${year}`;
  }

  throw new Error(`Invalid date "${value}". Use YYYY-MM-DD or MM/DD/YYYY.`);
}

function validateDateParts(year: number, month: number, day: number, original: string): void {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${original}".`);
  }
}

export function formatLessonPlan(source: string): FormattedLesson {
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const { title, body } = extractTitle(rawLines);
  const output: string[] = ['<div style="font-family: Arial, sans-serif;">'];
  const headings: string[] = [];
  const inferredBullets = implicitBulletIndexes(body);
  let bulletCount = 0;
  let listType: "ul" | "ol" | undefined;
  let currentSection = "";

  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = undefined;
  };

  const addListItem = (type: "ul" | "ol", text: string, marker?: string) => {
    if (listType !== type) {
      closeList();
      output.push(`<${type}>`);
      listType = type;
    }
    const markerAttribute = type === "ol" && marker && /^[A-Da-d]$/.test(marker)
      ? ' type="A"'
      : "";
    if (markerAttribute && output.at(-1) === "<ol>") output[output.length - 1] = `<ol${markerAttribute}>`;
    output.push(`<li>${escapeHtml(text)}</li>`);
    bulletCount += 1;
  };

  for (let index = 0; index < body.length; index += 1) {
    const rawLine = body[index] ?? "";
    const line = cleanLine(rawLine);
    if (!line) continue;
    if (SEPARATOR.test(line)) {
      closeList();
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet?.[1]) {
      addListItem("ul", bullet[1]);
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered?.[1] && numbered[2]) {
      addListItem("ol", numbered[2], numbered[1]);
      continue;
    }

    if (isHeading(line)) {
      closeList();
      headings.push(line);
      currentSection = sectionName(line);
      const softBreak = TIME_RANGE.test(line) ? "<br>" : "";
      output.push(`<p><strong>${escapeHtml(line)}</strong>${softBreak}</p>`);
      continue;
    }

    const autoList =
      (currentSection === "standards" && STANDARD_CODE.test(line)) ||
      (currentSection === "objectives" && !/students\s+will\s+be\s+able\s+to:?$/i.test(line)) ||
      currentSection === "agenda" ||
      currentSection === "materials" ||
      currentSection === "pages / materials" ||
      (currentSection === "assessment" && ASSESSMENT_ITEM.test(line)) ||
      (currentSection === "esol strategies" && ESOL_STRATEGY.test(line)) ||
      inferredBullets.has(index);
    if (autoList) {
      addListItem("ul", line);
      continue;
    }

    closeList();
    output.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  output.push("</div>");

  return {
    title,
    html: output.join(""),
    headings,
    bulletCount,
    sourceCharacters: source.length,
  };
}
