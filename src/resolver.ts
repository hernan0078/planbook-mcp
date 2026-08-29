import type { JsonRecord, LessonRecord, PlanbookClass } from "./types.js";

const CLASS_ID_KEYS = ["classId", "subjectId", "courseId", "cId", "id"] as const;
const CLASS_NAME_KEYS = [
  "className",
  "subjectName",
  "courseName",
  "cN",
  "displayName",
  "name",
  "title",
] as const;
const PERIOD_KEYS = ["period", "periodName", "periodNumber", "classPeriod"] as const;

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function firstString(record: JsonRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function deepRecords(value: unknown, maxDepth = 8): JsonRecord[] {
  const records: JsonRecord[] = [];
  const seen = new Set<object>();

  const visit = (candidate: unknown, depth: number) => {
    if (depth > maxDepth || candidate === null || typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
      return;
    }

    const record = candidate as JsonRecord;
    records.push(record);
    for (const child of Object.values(record)) visit(child, depth + 1);
  };

  visit(value, 0);
  return records;
}

export function extractClasses(payload: unknown): PlanbookClass[] {
  const classes = new Map<string, PlanbookClass>();

  for (const record of deepRecords(payload)) {
    const id = firstString(record, CLASS_ID_KEYS);
    const name = firstString(record, CLASS_NAME_KEYS);
    const period = firstString(record, PERIOD_KEYS);
    const hasClassSignal =
      "classId" in record ||
      "subjectId" in record ||
      "courseId" in record ||
      "cId" in record ||
      Boolean(period) ||
      /(?:^|\s)(?:p|period)\s*[-:]?\s*\d+(?:\s|$)/i.test(name ?? "");

    if (!id || !name || !hasClassSignal) continue;
    const existing = classes.get(id);
    if (!existing || (!existing.period && period)) {
      classes.set(id, {
        id,
        name,
        period,
        yearId: firstString(record, ["yearId", "cYId"]),
      });
    }
  }

  return [...classes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function periodNumber(value: string): string {
  const match = /\d+/.exec(value);
  return match?.[0] ?? normalizedText(value);
}

export function classMatchesPeriod(item: PlanbookClass, requestedPeriod: string): boolean {
  const target = periodNumber(requestedPeriod);
  if (!target) return false;
  if (item.period && periodNumber(item.period) === target) return true;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)(?:p(?:eriod)?\\s*[-:]?\\s*)${escaped}(?:\\b|$)`, "i").test(item.name);
}

export function periodLabelForClass(item: PlanbookClass): string {
  const source = item.period || item.name;
  const match = /(?:^|\b)p(?:eriod)?\s*[-:]?\s*(\d+)(?:\b|$)/i.exec(source);
  if (match?.[1]) return `P${match[1]}`;
  const number = /\d+/.exec(item.period ?? "");
  return number?.[0] ? `P${number[0]}` : item.period || "";
}

export function selectClasses(
  classes: PlanbookClass[],
  periods: string[] = [],
  classNames: string[] = [],
): PlanbookClass[] {
  const normalizedNames = classNames.map(normalizedText).filter(Boolean);
  return classes.filter((item) => {
    const periodMatch = !periods.length || periods.some((period) => classMatchesPeriod(item, period));
    const classMatch = !normalizedNames.length || normalizedNames.some(
      (name) => normalizedText(item.name).includes(name),
    );
    return periodMatch && classMatch;
  });
}

export function resolveClass(
  classes: PlanbookClass[],
  requestedPeriod: string,
  requestedName?: string,
): PlanbookClass {
  let candidates = classes.filter((item) => classMatchesPeriod(item, requestedPeriod));

  if (requestedName?.trim()) {
    const targetName = normalizedText(requestedName);
    const named = candidates.filter((item) => normalizedText(item.name).includes(targetName));
    if (named.length) candidates = named;
  }

  if (candidates.length === 1) return candidates[0]!;

  const available = (candidates.length ? candidates : classes)
    .slice(0, 12)
    .map((item) => `${item.name}${item.yearName ? ` (${item.yearName})` : ""} [${item.id}]`)
    .join(", ");

  if (!candidates.length) {
    throw new Error(`No class matched period ${requestedPeriod}. Available: ${available || "none"}.`);
  }
  throw new Error(
    `Period ${requestedPeriod} matched multiple classes. Pass className to disambiguate: ${available}.`,
  );
}

function lessonField(record: JsonRecord, keys: readonly string[]): string {
  return firstString(record, keys) ?? "";
}

export function extractLessons(payload: unknown): LessonRecord[] {
  const lessons = new Map<string, LessonRecord>();

  const visit = (value: unknown, inheritedClassId?: string, inheritedDate?: string): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, inheritedClassId, inheritedDate);
      return;
    }

    const record = value as JsonRecord;
    const classId = firstString(record, ["classId", "subjectId", "courseId"]) ?? inheritedClassId;
    const date = firstString(record, ["customDate", "lessonDate", "date"]) ?? inheritedDate;
    const id = lessonField(record, ["lessonId", "id"]);
    const hasLessonSignal =
      "lessonId" in record ||
      "lessonText" in record ||
      "lessonTitle" in record ||
      "customDate" in record;
    if (id && id !== "0" && hasLessonSignal) {
      lessons.set(id, {
        id,
        classId,
        date,
        title: lessonField(record, ["lessonTitle", "title"]),
        lessonText: lessonField(record, ["lessonText", "text"]),
        homeworkText: lessonField(record, ["homeworkText"]),
        notesText: lessonField(record, ["notesText"]),
        tab4Text: lessonField(record, ["tab4Text"]),
        tab5Text: lessonField(record, ["tab5Text"]),
        tab6Text: lessonField(record, ["tab6Text"]),
        raw: record,
      });
    }

    for (const child of Object.values(record)) visit(child, classId, date);
  };

  visit(payload);

  return [...lessons.values()];
}

function compactDate(value: string): string {
  return value.replace(/^0/, "").replace(/\/0(\d)\//, "/$1/");
}

export function findLesson(payload: unknown, classId: string, date: string): LessonRecord | undefined {
  const lessons = extractLessons(payload);
  const exact = lessons.find(
    (lesson) =>
      (!lesson.classId || lesson.classId === classId) &&
      Boolean(lesson.date) &&
      compactDate(lesson.date!) === compactDate(date),
  );
  return exact;
}

export function hasClassDate(payload: unknown, classId: string, date: string): boolean {
  return deepRecords(payload).some((record) => {
    const recordClassId = firstString(record, ["classId", "subjectId", "courseId"]);
    const recordDate = firstString(record, ["customDate", "lessonDate", "date"]);
    return (
      (!recordClassId || recordClassId === classId) &&
      Boolean(recordDate) &&
      compactDate(recordDate!) === compactDate(date) &&
      ("lessonTitle" in record || "lessonText" in record || "extraLesson" in record)
    );
  });
}
