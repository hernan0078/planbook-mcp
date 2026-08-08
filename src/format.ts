import type { FormattedLesson } from "./types.js";

const TITLE_LABEL = /^lesson\s+title\s*:?[\s]*$/i;
const SEPARATOR = /^[\s\-_=⸻—–]{3,}$/u;
const BULLET = /^\s*[*•-]\s+(.+)$/u;
const NUMBERED = /^\s*(\d+|[A-Da-d])[.)]\s+(.+)$/u;
const STANDARD_CODE = /^(?:[A-Z]{2,}(?:\.[A-Z0-9]+)+|[A-Z]{2,}\.[A-Z0-9.]+)\s*[–—-]/u;
const ASSESSMENT_ITEM = /\s[–—-]\s*(?:Formative|Summative|Classwork)\s*$/i;

const KNOWN_HEADER = /^(?:standards|essential\s+question|objectives?|assessment|why\s+this\s+lesson\s+works|lesson(?:\s*\([^)]*\))?|part\s+\d+\b.*|bell\s+ringer(?:\s*\/\s*setup)?(?:\s*\([^)]*\))?|closure(?:\s*\([^)]*\))?|mini\s+lesson\b.*|guided\s+practice\b.*|independent\s+practice\b.*|reading\b.*|transition(?:\s*\([^)]*\))?|assessment\s+expectations\b.*|standards\s+mastery\s+quiz\b.*|early\s+finisher\s+task(?:\s*\([^)]*\))?)$/i;

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
  return value
    .replace(/(\d{1,2}:\d{2})\s*[-—]\s*(\d{1,2}:\d{2})/g, "$1–$2")
    .replace(/\s+-\s+/g, " – ");
}

function cleanLine(value: string): string {
  return normalizeTimeRanges(stripEmoji(value)).trim();
}

function isHeading(value: string): boolean {
  const line = value.trim();
  if (!line || line.endsWith(":")) return false;
  if (KNOWN_HEADER.test(line)) return true;
  if (/\(\d{1,2}:\d{2}–\d{1,2}:\d{2}\)\s*$/u.test(line)) return true;
  return false;
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

  for (const rawLine of body) {
    const line = cleanLine(rawLine);
    if (!line || SEPARATOR.test(line)) {
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
      currentSection = line.toLowerCase();
      output.push(`<p><strong>${escapeHtml(line)}</strong></p>`);
      continue;
    }

    const autoList =
      (currentSection === "standards" && STANDARD_CODE.test(line)) ||
      (currentSection === "assessment" && ASSESSMENT_ITEM.test(line));
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
