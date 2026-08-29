import type { FormattedLesson } from "./types.js";

const TITLE_LABEL = /^lesson\s+title\s*:?[\s]*$/i;
const MARKDOWN_TITLE = /^#\s+(.+)$/u;
const SEPARATOR = /^(?:[\s\-_=—–]{3,}|⸻+)$/u;
const BULLET = /^\s*[*•-]\s+(.+)$/u;
const NUMBERED = /^\s*(\d+|[A-Da-d])[.)]\s+(.+)$/u;
const STANDARD_CODE = /^(?:[A-Z]{2,}(?:\.[A-Z0-9]+)+|[A-Z]{2,}\.[A-Z0-9.]+)\s*[–—-]/u;
const ASSESSMENT_ITEM = /\s[–—-]\s*(?:Formative|Summative|Classwork)\s*$/i;
const ESOL_STRATEGY = /^ESOL\.[A-Z]\d+\s*[–—-]/i;
const COURSE_METADATA = /^(?:ESOL|ELL)\b(?!\s+strateg(?:y|ies)\b)(?=[^|]*\d)[^|]*$/i;
const TIME_RANGE = /(?:\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}|\d{1,3}\s*[–—-]\s*\d{1,3}\s*(?:min|minutes?)\b)/iu;

const MAJOR_HEADER = /^(?:standards|essential\s+question|objectives?|agenda|materials|pages(?:\s*\/\s*materials)?|assessment|esol\s+strategies|key\s+teaching\s+notes\b.*|teacher\s+emphasis\b.*|teacher\s+review\s+guide\b.*|blooket\s+review\b.*|why\s+this\s+lesson\s+works|lesson(?:\s+timeline)?(?:\s*[–—-]\s*\d+\s*minutes|\s*\([^)]*\))?|part\s+\d+\b.*)$/i;
const KNOWN_HEADER = /^(?:standards|essential\s+question|objectives?|agenda|materials|pages(?:\s*\/\s*materials)?|assessment|esol\s+strategies|key\s+teaching\s+notes\b.*|teacher\s+emphasis\b.*|teacher\s+review\s+guide\b.*|blooket\s+review\b.*|why\s+this\s+lesson\s+works|lesson(?:\s+timeline)?(?:\s*[–—-]\s*\d+\s*minutes|\s*\([^)]*\))?|part\s+\d+\b.*|bell\s+ringer\b.*|closure\b.*|mini\s+lesson\b.*|guided\s+practice\b.*|independent\s+practice\b.*|reading\b.*|transition\b.*|assessment\s+expectations\b.*|standards\s+mastery\s+quiz\b.*|early\s+finisher\s+task\b.*)$/i;

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

function normalizePasteArtifacts(value: string): string {
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\\\s*$/u, "");
}

function stripMarkdown(value: string): string {
  const headingFree = value.replace(/^#{1,6}\s+/, "");
  const bullet = /^(\s*[*•-]\s+)(.*)$/u.exec(headingFree);
  const prefix = bullet?.[1] ?? "";
  const content = bullet?.[2] ?? headingFree;

  return prefix + content
    // Remove bold markers first so nested italics become a simple pair.
    .replace(/\*\*/g, "")
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1")
    .replace(/\\([\\_*`])/g, "$1")
    .replace(/(?<!_)__([^_\n]+)__(?!_)/g, "$1")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

function normalizeTimeRanges(value: string): string {
  const normalized = value.replace(
    /(\d{1,2}:\d{2})\s*[-—]\s*(\d{1,2}:\d{2})/g,
    "$1–$2",
  );
  const clockNormalized = normalized.replace(
    /^(.+?)\s+[–—-]\s+(\d{1,2}:\d{2}–\d{1,2}:\d{2})\s*$/u,
    "$1 ($2)",
  );
  return clockNormalized.replace(
    /(\d{1,3})\s*[-—]\s*(\d{1,3})(\s*(?:min|minutes?)\b)/gi,
    "$1–$2$3",
  );
}

function cleanLine(value: string): string {
  return normalizeTimeRanges(stripMarkdown(stripEmoji(normalizePasteArtifacts(value)))).trim();
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

function isStandardEntry(value: string): boolean {
  return STANDARD_CODE.test(cleanLine(value).replace(/^\s*[*•-]\s+/u, ""));
}

function leadingBoldTimedSection(value: string): { header: string; body: string } | undefined {
  const normalized = normalizePasteArtifacts(value).trim();
  const match = /^\*\*(.+?)\*\*\s*(.*)$/u.exec(normalized);
  if (!match?.[1]) return undefined;

  const header = cleanLine(match[1]);
  if (!TIME_RANGE.test(header)) return undefined;
  return { header, body: cleanLine(match[2] ?? "") };
}

function markdownTableCells(value: string): string[] | undefined {
  const line = value.trim();
  if (!line.startsWith("|") || !line.endsWith("|")) return undefined;
  return line.slice(1, -1).split("|").map((cell) => cleanLine(cell));
}

function isMarkdownTableDelimiter(cells: string[] | undefined): boolean {
  return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function isNumberedInstructionalHeader(lines: string[], index: number): boolean {
  const numbered = NUMBERED.exec(cleanLine(lines[index] ?? ""));
  if (!numbered?.[1] || !/^\d+$/.test(numbered[1])) return false;

  for (let next = index + 1; next < lines.length; next += 1) {
    const candidate = cleanLine(lines[next] ?? "");
    if (!candidate || SEPARATOR.test(candidate)) continue;
    return /^(?:model|quick\s+check|contrast)\s*:/i.test(candidate);
  }

  return false;
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
  if (labelIndex === -1) {
    const firstContentIndex = body.findIndex((line) => {
      const candidate = cleanLine(line);
      return Boolean(candidate) && !SEPARATOR.test(candidate);
    });
    const markdownTitle = firstContentIndex >= 0
      ? MARKDOWN_TITLE.exec((body[firstContentIndex] ?? "").trim())
      : undefined;
    if (markdownTitle?.[1]) {
      body.splice(firstContentIndex, 1);
      return { title: cleanLine(markdownTitle[1]), body };
    }

    const firstLine = firstContentIndex >= 0 ? cleanLine(body[firstContentIndex] ?? "") : "";
    const followingContentIndexes = body
      .map((line, index) => ({ index, line: cleanLine(line) }))
      .filter(({ index, line }) => index > firstContentIndex && Boolean(line) && !SEPARATOR.test(line))
      .map(({ index }) => index);
    const metadataTitleIndex = COURSE_METADATA.test(firstLine)
      ? followingContentIndexes[0]
      : undefined;
    const metadataTitle = metadataTitleIndex !== undefined
      ? cleanLine(body[metadataTitleIndex] ?? "")
      : "";
    const metadataTitleContextIndexes = followingContentIndexes.slice(1, 3);
    if (
      metadataTitleIndex !== undefined &&
      metadataTitle &&
      !isHeading(metadataTitle) &&
      metadataTitleContextIndexes.some((index) => {
        const candidate = cleanLine(body[index] ?? "");
        return sectionName(candidate) === "standards" || isStandardEntry(body[index] ?? "");
      })
    ) {
      body.splice(metadataTitleIndex, 1);
      return { title: metadataTitle, body };
    }

    const titleContextIndexes = followingContentIndexes.slice(0, 2);
    if (
      firstLine &&
      !isHeading(firstLine) &&
      titleContextIndexes.some((index) => {
        const candidate = cleanLine(body[index] ?? "");
        return sectionName(candidate) === "standards" || isStandardEntry(body[index] ?? "");
      })
    ) {
      body.splice(firstContentIndex, 1);
      return { title: firstLine, body };
    }

    return { body };
  }

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

function removeRedundantCourseMetadata(lines: string[]): string[] {
  const body = [...lines];

  for (let index = 0; index < body.length; index += 1) {
    const line = cleanLine(body[index] ?? "");
    if (sectionName(line) === "standards" || isStandardEntry(body[index] ?? "")) break;
    if (!line) continue;

    const pipeIndex = line.indexOf("|");
    if (pipeIndex >= 0) {
      const courseLabel = line.slice(0, pipeIndex).trim();
      const usefulMetadata = line.slice(pipeIndex + 1).trim();
      if (COURSE_METADATA.test(courseLabel)) {
        if (usefulMetadata) body[index] = usefulMetadata;
        else body.splice(index--, 1);
        continue;
      }
    }

    if (COURSE_METADATA.test(line)) body.splice(index--, 1);
  }

  return body;
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
  const extracted = extractTitle(rawLines);
  const title = extracted.title;
  const body = removeRedundantCourseMetadata(extracted.body);
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

  const addSemanticListItems = (text: string) => {
    const items = text.split(/\s+\|\s+/u).map((item) => item.trim()).filter(Boolean);
    for (const item of items) addListItem("ul", item);
  };

  for (let index = 0; index < body.length; index += 1) {
    const rawLine = body[index] ?? "";
    const boldTimedSection = leadingBoldTimedSection(rawLine);
    const markdownHeading = /^#{1,6}\s+/u.test(rawLine.trim());
    const line = cleanLine(rawLine);
    if (!line) continue;
    if (SEPARATOR.test(line)) {
      closeList();
      continue;
    }

    if (boldTimedSection) {
      closeList();
      headings.push(boldTimedSection.header);
      currentSection = sectionName(boldTimedSection.header);
      const bodyText = boldTimedSection.body ? escapeHtml(boldTimedSection.body) : "";
      output.push(`<p><strong>${escapeHtml(boldTimedSection.header)}</strong><br>${bodyText}</p>`);
      continue;
    }

    const tableHeader = markdownTableCells(rawLine);
    const tableDelimiter = markdownTableCells(body[index + 1] ?? "");
    if (
      tableHeader?.length &&
      isMarkdownTableDelimiter(tableDelimiter) &&
      tableDelimiter?.length === tableHeader.length
    ) {
      closeList();
      output.push('<table style="border-collapse: collapse;">');
      output.push("<thead><tr>");
      for (const cell of tableHeader) {
        output.push(`<th style="border: 1px solid #999; padding: 4px; text-align: left;">${escapeHtml(cell)}</th>`);
      }
      output.push("</tr></thead><tbody>");
      index += 2;
      while (index < body.length) {
        const row = markdownTableCells(body[index] ?? "");
        if (!row || row.length !== tableHeader.length) break;
        output.push("<tr>");
        for (const cell of row) {
          output.push(`<td style="border: 1px solid #999; padding: 4px;">${escapeHtml(cell)}</td>`);
        }
        output.push("</tr>");
        index += 1;
      }
      output.push("</tbody></table>");
      index -= 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet?.[1]) {
      addListItem("ul", bullet[1]);
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered?.[1] && numbered[2]) {
      if (isNumberedInstructionalHeader(body, index)) {
        closeList();
        headings.push(line);
        output.push(`<p><strong>${escapeHtml(line)}</strong></p>`);
        continue;
      }
      addListItem("ol", numbered[2], numbered[1]);
      continue;
    }

    const contextualList =
      (currentSection === "agenda" && !MAJOR_HEADER.test(line.replace(/:\s*$/, ""))) ||
      (currentSection === "assessment" && ASSESSMENT_ITEM.test(line));
    if (contextualList) {
      addSemanticListItems(line);
      continue;
    }

    if (markdownHeading || isHeading(line)) {
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
      currentSection === "blooket review" ||
      (currentSection === "assessment" && ASSESSMENT_ITEM.test(line)) ||
      (currentSection === "esol strategies" && ESOL_STRATEGY.test(line)) ||
      inferredBullets.has(index);
    if (autoList) {
      addSemanticListItems(line);
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
