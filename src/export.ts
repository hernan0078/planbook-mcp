import type {
  ExtractedLesson,
  LessonBlock,
  LessonExportFormat,
  LessonRecord,
  LessonSection,
  PlanbookClass,
} from "./types.js";
import { periodLabelForClass } from "./resolver.js";

const MAX_RANGE_DAYS = 31;
const BLOCK = /<(p|ul|ol|table|h[1-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const TIMED_HEADING = /(?:\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}|\d{1,3}\s*[–—-]\s*\d{1,3}\s*(?:min|minutes?)\b)/i;
const KNOWN_HEADING = /^(?:standards|essential question|objectives?|agenda|lesson(?: timeline)?\b.*|assessment|materials|pages(?: \/ materials)?|esol strategies|closure\b.*|bell ringer\b.*)$/i;

export function parseLessonHtml(html: string): LessonSection[] {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/^\s*<div\b[^>]*>/i, "")
    .replace(/<\/div>\s*$/i, "");
  const sections: LessonSection[] = [];
  let current: LessonSection = { blocks: [] };
  let cursor = 0;

  const commitSection = (): void => {
    if (current.heading || current.blocks.length) sections.push(current);
  };
  const beginSection = (heading: string): void => {
    commitSection();
    current = { heading, blocks: [] };
  };
  const addBlock = (block: LessonBlock): void => {
    current.blocks.push(block);
  };
  const addLooseText = (value: string): void => {
    const text = inlineText(value);
    if (text) addBlock({ type: "paragraph", text });
  };

  for (const match of source.matchAll(BLOCK)) {
    const index = match.index ?? 0;
    addLooseText(source.slice(cursor, index));
    cursor = index + match[0].length;
    const tag = match[1]!.toLowerCase();
    const body = match[2] ?? "";

    if (/^h[1-6]$/.test(tag)) {
      const heading = inlineText(body).replace(/^#{1,6}\s+/, "");
      if (heading) beginSection(heading);
      continue;
    }
    if (tag === "p") {
      const explicit = /^\s*<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*(?:<br\s*\/?>)?/i.exec(body);
      const visible = inlineText(body);
      const markdown = /^#{1,6}\s+(.+)$/.exec(visible);
      const heading = explicit ? inlineText(explicit[1] ?? "") : markdown?.[1];
      if (heading) {
        beginSection(heading);
        const remainder = explicit ? inlineText(body.slice(explicit[0].length)) : "";
        if (remainder) addBlock({ type: "paragraph", text: remainder });
      } else if (visible && (TIMED_HEADING.test(visible) || KNOWN_HEADING.test(visible))) {
        beginSection(visible);
      } else if (visible) {
        addBlock({ type: "paragraph", text: visible });
      }
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)]
        .map((item) => inlineText(item[1] ?? ""))
        .filter(Boolean);
      if (items.length) addBlock({ type: "list", ordered: tag === "ol", items });
      continue;
    }
    if (tag === "table") {
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
        .map((row) => [...((row[1] ?? "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi))]
          .map((cell) => inlineText(cell[1] ?? "")))
        .filter((row) => row.length);
      if (rows.length) addBlock({ type: "table", rows });
    }
  }

  addLooseText(source.slice(cursor));
  commitSection();
  return sections;
}

export function extractLesson(
  date: string,
  targetClass: PlanbookClass,
  lesson: LessonRecord | undefined,
  format: LessonExportFormat,
): ExtractedLesson {
  const base = {
    found: Boolean(lesson),
    date,
    period: periodLabelForClass(targetClass),
    classId: targetClass.id,
    className: targetClass.name,
    format,
  };
  if (!lesson) return base;

  const sections = parseLessonHtml(lesson.lessonText);
  const metadata = {
    ...base,
    lessonId: lesson.id,
    title: lesson.title,
  };
  if (format === "json") return { ...metadata, sections };
  if (format === "html") return { ...metadata, content: lesson.lessonText };
  if (format === "markdown") {
    return { ...metadata, content: renderMarkdown(lesson.title, sections) };
  }
  return { ...metadata, content: renderText(lesson.title, sections) };
}

export function buildDateRange(
  startDate: string,
  endDate: string,
  includeWeekends: boolean,
): string[] {
  const start = parsePlanbookDate(startDate);
  const end = parsePlanbookDate(endDate);
  if (end < start) throw new Error("endDate must be on or after startDate.");
  const calendarDays = Math.floor((end - start) / 86_400_000) + 1;
  if (calendarDays > MAX_RANGE_DAYS) {
    throw new Error(`Bulk extraction is limited to ${MAX_RANGE_DAYS} calendar days per call.`);
  }

  const dates: string[] = [];
  for (let value = start; value <= end; value += 86_400_000) {
    const date = new Date(value);
    const day = date.getUTCDay();
    if (includeWeekends || (day !== 0 && day !== 6)) dates.push(formatPlanbookDate(date));
  }
  return dates;
}

function renderMarkdown(title: string, sections: LessonSection[]): string {
  const output: string[] = title ? [`# ${title}`] : [];
  for (const section of sections) {
    if (section.heading) output.push(`## ${section.heading}`);
    for (const block of section.blocks) output.push(markdownBlock(block));
  }
  return output.filter(Boolean).join("\n\n").trim();
}

function markdownBlock(block: LessonBlock): string {
  if (block.type === "paragraph") return block.text;
  if (block.type === "list") {
    return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
  }
  const width = Math.max(...block.rows.map((row) => row.length));
  const rows = block.rows.map((row) => Array.from({ length: width }, (_, index) => escapeTableCell(row[index] ?? "")));
  const header = rows[0] ?? [];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderText(title: string, sections: LessonSection[]): string {
  const output: string[] = title ? [title] : [];
  for (const section of sections) {
    if (section.heading) output.push(section.heading);
    for (const block of section.blocks) {
      if (block.type === "paragraph") output.push(block.text);
      if (block.type === "list") {
        output.push(block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n"));
      }
      if (block.type === "table") output.push(block.rows.map((row) => row.join("\t")).join("\n"));
    }
  }
  return output.filter(Boolean).join("\n\n").trim();
}

function inlineText(value: string): string {
  return decodeEntities(value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"",
    ndash: "–", mdash: "—", bull: "•", hellip: "…",
    larr: "←", leftarrow: "←", uarr: "↑", uparrow: "↑",
    rarr: "→", rightarrow: "→", darr: "↓", downarrow: "↓",
    harr: "↔", leftrightarrow: "↔", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z\d]+);/gi, (full, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : full;
    }
    return named[entity.toLowerCase()] ?? full;
  });
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function parsePlanbookDate(value: string): number {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unexpected Planbook date ${value}.`);
  const [, month, day, year] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function formatPlanbookDate(value: Date): string {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
}
