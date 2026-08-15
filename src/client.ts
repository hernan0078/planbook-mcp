import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deepRecords, extractClasses, findLesson, hasClassDate } from "./resolver.js";
import type { JsonRecord, LessonRecord, PlanbookClass } from "./types.js";

const API_URL = "https://api.planbook.com";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

type ApiMethod = "GET" | "POST";
type SchoolYear = { id: string; name: string; firstDay?: string; lastDay?: string };

export class PlanbookClient {
  private sessionCookie = "";
  private teacherId = "";
  private yearId = "";
  private schoolYears: SchoolYear[] = [];
  private readonly idToken = process.env.PLANBOOK_ID_TOKEN?.trim() ?? "";
  private readonly cookieFile = resolve(
    process.env.PLANBOOK_COOKIE_FILE?.trim() || join(MODULE_DIR, "../cookies.json"),
  );
  private readonly refreshScript = resolve(
    process.env.PLANBOOK_REFRESH_SCRIPT?.trim() || join(MODULE_DIR, "../refresh-cookies.py"),
  );

  async listClasses(date?: string): Promise<PlanbookClass[]> {
    await this.ensureLoggedIn(false);
    const years = this.yearsForDate(date);
    const classesById = new Map<string, PlanbookClass>();

    for (const year of years) {
      const payload = await this.request("POST", "/getClasses2", {
        teacherId: this.teacherId,
        yearId: year.id,
      });
      for (const item of extractClasses(payload)) {
        classesById.set(item.id, {
          ...item,
          yearId: item.yearId || year.id,
          yearName: year.name,
        });
      }
    }

    const classes = [...classesById.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (!classes.length) throw new Error("Planbook returned no recognizable classes.");
    return classes;
  }

  async getLesson(date: string, classId: string, yearId?: string): Promise<LessonRecord | undefined> {
    return (await this.getLessonContext(date, classId, yearId)).lesson;
  }

  private async getLessonContext(
    date: string,
    classId: string,
    yearId?: string,
  ): Promise<{ lesson?: LessonRecord; scheduled: boolean }> {
    await this.ensureLoggedIn(false);
    const targetYearId = yearId || this.yearsForDate(date)[0]?.id || this.yearId;
    const targetYear = this.schoolYears.find((year) => year.id === targetYearId);
    assertActiveSchoolYear(this.yearId, targetYearId, targetYear?.name, date);
    const payload = await this.request("GET", "/getClassLessons", {
      classId,
      teacherId: this.teacherId,
      yearId: targetYearId,
    });
    const scheduled = hasClassDate(payload, classId, date);
    let lesson = findLesson(payload, classId, date);

    // Extra lessons are omitted from the full-year sequence and only appear in the date event feed.
    if (!lesson && !scheduled) {
      const events = await this.request("GET", "/getLessonsEvents", {
        date,
        teacherId: this.teacherId,
        yearId: targetYearId,
      });
      lesson = findLesson(events, classId, date);
    }

    return {
      lesson,
      scheduled,
    };
  }

  async upsertLesson(args: {
    date: string;
    classId: string;
    yearId?: string;
    title: string;
    lessonText: string;
    overwrite: boolean;
    verify: boolean;
  }): Promise<{ action: "created" | "updated"; lessonId?: string; verified: boolean }> {
    const context = await this.getLessonContext(args.date, args.classId, args.yearId);
    const existing = context.lesson;
    if (existing && !args.overwrite) {
      throw new Error(
        `A lesson already exists on ${args.date} for class ${args.classId}. Set overwrite=true to replace it.`,
      );
    }

    const unitId = existing ? stringValue(existing.raw.unitId) || "0" : "0";
    const extraLesson = existing
      ? stringValue(existing.raw.extraLesson) || "0"
      : context.scheduled
        ? "0"
        : "999";
    const lessonLock = existing ? stringValue(existing.raw.lessonLock) || "N" : "N";
    const customStart = existing ? stringValue(existing.raw.customStart) : "";
    const customEnd = existing ? stringValue(existing.raw.customEnd) : "";
    const addClassDaysCode = existing ? stringValue(existing.raw.addClassDaysCode) : "";
    const response = await this.request("POST", "/updateLesson", buildUpdateLessonPayload({
      classId: args.classId,
      date: args.date,
      title: args.title,
      lessonText: args.lessonText,
      existing,
      unitId,
      extraLesson,
      lessonLock,
      addClassDaysCode,
      customStart,
      customEnd,
    }));

    if (isErrorPayload(response)) {
      throw new Error(`Planbook rejected the lesson update: ${compactError(response)}.`);
    }

    const responseLessonId = findLessonIdForClass(response, args.classId);
    if (!args.verify) {
      return {
        action: existing ? "updated" : "created",
        lessonId: existing?.id ?? responseLessonId,
        verified: false,
      };
    }

    const saved = await this.verifyLesson(args);
    if (!saved) {
      throw new Error(
        "Planbook accepted the request, but the saved lesson could not be verified. Check the target date and class.",
      );
    }

    return {
      action: existing ? "updated" : "created",
      lessonId: saved?.id ?? existing?.id ?? responseLessonId,
      verified: true,
    };
  }

  private async verifyLesson(args: {
    date: string;
    classId: string;
    yearId?: string;
    title: string;
    lessonText: string;
  }): Promise<LessonRecord | undefined> {
    const delays = [0, 250, 750];
    for (const delay of delays) {
      if (delay) await sleep(delay);
      const saved = await this.getLesson(args.date, args.classId, args.yearId);
      if (
        saved &&
        saved.title.trim() === args.title.trim() &&
        savedLessonMatches(saved.lessonText, args.lessonText)
      ) {
        return saved;
      }
    }
    return undefined;
  }

  private async request(
    method: ApiMethod,
    path: string,
    values: Record<string, unknown> = {},
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.ensureLoggedIn(attempt === 1);
      const url = new URL(`${API_URL}${path}`);
      const init: RequestInit = { method, headers: this.authHeaders() };

      if (method === "GET") {
        for (const [key, value] of Object.entries(values)) {
          if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
        }
      } else {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(values)) body.set(key, String(value ?? ""));
        init.headers = { ...init.headers, "Content-Type": "application/x-www-form-urlencoded" };
        init.body = body.toString();
      }

      const response = await fetch(url, init);
      const payload = await parsePayload(response);
      if (response.status === 401 || response.status === 403 || isLoggedOutPayload(payload)) {
        this.resetSession();
        continue;
      }
      if (!response.ok) {
        throw new Error(`Planbook API ${response.status} on ${path}: ${compactError(payload)}.`);
      }
      return payload;
    }

    throw new Error(
      "Planbook authentication expired. Log into Planbook in Chrome, then run npm run refresh.",
    );
  }

  private async ensureLoggedIn(forceRefresh: boolean): Promise<void> {
    if (!forceRefresh && this.teacherId) return;

    this.resetSession();
    if (this.idToken) {
      if (await this.loadSettings()) return;
      throw new Error("PLANBOOK_ID_TOKEN is invalid or expired.");
    }

    if (!forceRefresh) {
      this.sessionCookie = this.loadCookieFile();
      if (this.sessionCookie && (await this.loadSettings())) return;
    }

    this.refreshCookies();
    this.sessionCookie = this.loadCookieFile();
    if (this.sessionCookie && (await this.loadSettings())) return;

    throw new Error(
      "Could not authenticate with Planbook. Log into Planbook in Chrome and run npm run refresh.",
    );
  }

  private async loadSettings(): Promise<boolean> {
    const response = await fetch(`${API_URL}/getSettings`, { headers: this.authHeaders() });
    const payload = await parsePayload(response);
    if (!response.ok || isLoggedOutPayload(payload)) return false;

    const data = asRecord(payload);
    const userData = asRecord(data?.userData);
    this.teacherId = stringValue(userData?.teacherId);
    this.yearId = stringValue(data?.currentYearId) || stringValue(userData?.currentSchoolYearId);
    this.schoolYears = Array.isArray(data?.years)
      ? data.years.flatMap((value): SchoolYear[] => {
          const year = asRecord(value);
          const id = stringValue(year?.yearId);
          if (!id) return [];
          return [
            {
              id,
              name: stringValue(year?.yearName) || id,
              firstDay: stringValue(year?.firstDay) || undefined,
              lastDay: stringValue(year?.lastDay) || undefined,
            },
          ];
        })
      : [];
    return Boolean(this.teacherId && this.yearId);
  }

  private authHeaders(): Record<string, string> {
    if (this.idToken) return { idToken: this.idToken };
    return this.sessionCookie ? { Cookie: this.sessionCookie } : {};
  }

  private loadCookieFile(): string {
    if (!existsSync(this.cookieFile)) return "";
    try {
      const cookies = JSON.parse(readFileSync(this.cookieFile, "utf8")) as Array<{
        name?: unknown;
        value?: unknown;
        domain?: unknown;
      }>;
      return cookies
        .filter(
          (cookie) =>
            typeof cookie.name === "string" &&
            typeof cookie.value === "string" &&
            typeof cookie.domain === "string" &&
            cookie.domain.includes("planbook.com"),
        )
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    } catch {
      throw new Error(`Could not read cookie file ${this.cookieFile}.`);
    }
  }

  private refreshCookies(): void {
    if (!existsSync(this.refreshScript)) {
      throw new Error(`Cookie refresh script not found at ${this.refreshScript}.`);
    }
    const result = spawnSync("python3", [this.refreshScript], {
      encoding: "utf8",
      timeout: 30_000,
      env: process.env,
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "unknown error").trim().slice(0, 500);
      throw new Error(`Cookie refresh failed: ${detail}`);
    }
  }

  private resetSession(): void {
    this.sessionCookie = "";
    this.teacherId = "";
    this.yearId = "";
    this.schoolYears = [];
  }

  private yearsForDate(date?: string): SchoolYear[] {
    if (!date) {
      const current = this.schoolYears.find((year) => year.id === this.yearId);
      return current ? [current] : [{ id: this.yearId, name: this.yearId }];
    }

    const target = parsePlanbookDate(date);
    const matching = this.schoolYears.filter((year) => {
      const first = year.firstDay ? parsePlanbookDate(year.firstDay) : undefined;
      const last = year.lastDay ? parsePlanbookDate(year.lastDay) : undefined;
      return (!first || target >= first) && (!last || target <= last);
    });
    if (matching.length) return matching;
    throw new Error(`No Planbook school year contains ${date}.`);
  }
}

export function assertActiveSchoolYear(
  activeYearId: string,
  targetYearId: string,
  targetYearName: string | undefined,
  date: string,
): void {
  if (!activeYearId || !targetYearId || activeYearId === targetYearId) return;
  throw new Error(
    `Planbook's active school year does not contain ${date}. Switch the Planbook year selector to ${targetYearName || targetYearId} in Chrome, then retry.`,
  );
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function isLoggedOutPayload(value: unknown): boolean {
  const record = asRecord(value);
  return record?.notLoggedIn === true || record?.notLoggedIn === "true";
}

function isErrorPayload(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record?.error === true ||
    record?.error === "true" ||
    record?.success === false ||
    record?.success === "false" ||
    record?.ok === false ||
    record?.ok === "false" ||
    record?.status === "error"
  );
}

function compactError(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 300);
  const record = asRecord(value);
  const message = record?.message ?? record?.errorMessage ?? record?.error;
  return typeof message === "string" ? message.slice(0, 300) : "unexpected response";
}

function findLessonIdForClass(value: unknown, classId: string): string | undefined {
  for (const record of deepRecords(value)) {
    const recordClassId = stringValue(record.classId) || stringValue(record.subjectId);
    const lessonId = stringValue(record.lessonId);
    if (recordClassId === classId && lessonId && lessonId !== "0") return lessonId;
  }
  return undefined;
}

export function comparableLessonText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function savedLessonMatches(savedHtml: string, expectedHtml: string): boolean {
  if (normalizedVisibleLessonText(savedHtml) !== normalizedVisibleLessonText(expectedHtml)) {
    return false;
  }
  if (lessonFormattingIssues(savedHtml).length) return false;

  return ["strong", "li", "ol", "ul"].every(
    (tag) => countTag(savedHtml, tag) === countTag(expectedHtml, tag),
  );
}

export function lessonFormattingIssues(html: string): string[] {
  const issues: string[] = [];
  const text = visibleLessonText(html);

  if (!/font-family\s*:\s*Arial(?:\s*,|\s*;)/i.test(html)) issues.push("lesson is not Arial");
  if (/(?:^|\n)\s*#{1,6}\s+/m.test(text)) issues.push("Markdown heading marker is visible");
  if (/\*\*|(?<!_)__[^_\n]+__(?!_)|`[^`\n]+`|\\[_*`]/.test(text)) {
    issues.push("Markdown emphasis or escape marker is visible");
  }
  if (/(^|\s)\*[^*\n]+\*(?=\s|[.,!?;:]|$)/m.test(text)) {
    issues.push("Markdown italic marker is visible");
  }

  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const paragraph = match[1] ?? "";
    if (!/\d{1,2}:\d{2}\s*(?:[–—-]|&(?:ndash|mdash);|&#(?:8211|8212);)\s*\d{1,2}:\d{2}/i.test(paragraph)) {
      continue;
    }
    if (!/<(?:strong|b)\b/i.test(paragraph)) issues.push("timed header is not bold");
    if (!/<br\s*\/?>/i.test(paragraph)) issues.push("timed header has no soft break");
  }

  return [...new Set(issues)];
}

function countTag(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
}

function visibleLessonText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&rightarrow;|&#8594;/gi, "→")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizedVisibleLessonText(html: string): string {
  return visibleLessonText(html).replace(/\s+/g, " ").trim();
}

export function buildUpdateLessonPayload(args: {
  classId: string;
  date: string;
  title: string;
  lessonText: string;
  existing?: LessonRecord;
  unitId?: string;
  extraLesson?: string;
  lessonLock?: string;
  addClassDaysCode?: string;
  customStart?: string;
  customEnd?: string;
}): Record<string, unknown> {
  return {
    classId: args.classId,
    customDate: args.date,
    unitId: args.unitId || "0",
    extraLesson: args.extraLesson || "0",
    lessonLock: args.lessonLock || "N",
    strategySent: "Y",
    unitStandardsSent: "Y",
    statusesSent: "Y",
    schoolWorks: "[]",
    addClassDaysCode: args.addClassDaysCode || "",
    customStart: args.customStart || "",
    customEnd: args.customEnd || "",
    updatedFields: "LESSONTITLE,LESSONTEXT",
    lessonTitle: args.title,
    lessonText: args.lessonText,
    homeworkText: args.existing?.homeworkText ?? "",
    notesText: args.existing?.notesText ?? "",
    tab4Text: args.existing?.tab4Text ?? "",
    tab5Text: args.existing?.tab5Text ?? "",
    tab6Text: args.existing?.tab6Text ?? "",
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function parsePlanbookDate(value: string): number {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unexpected Planbook date ${value}.`);
  const [, month, day, year] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}
