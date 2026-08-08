import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { extractClasses, findLesson, deepRecords } from "./resolver.js";
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
    await this.ensureLoggedIn(false);
    const payload = await this.request("GET", "/getClassLessons", {
      classId,
      teacherId: this.teacherId,
      yearId: yearId || this.yearsForDate(date)[0]?.id || this.yearId,
    });
    return findLesson(payload, classId, date);
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
    const existing = await this.getLesson(args.date, args.classId, args.yearId);
    if (existing && !args.overwrite) {
      throw new Error(
        `A lesson already exists on ${args.date} for class ${args.classId}. Set overwrite=true to replace it.`,
      );
    }

    const lessonId = existing?.id ?? "0";
    const unitId = existing ? stringValue(existing.raw.unitId) || "0" : "0";
    const extraLesson = existing ? stringValue(existing.raw.extraLesson) || "0" : "0";
    const lessonLock = existing ? stringValue(existing.raw.lessonLock) || "N" : "N";
    const collaborateSubjectId = existing
      ? stringValue(existing.raw.collaborateSubjectId) || "0"
      : "0";
    const customStart = existing ? stringValue(existing.raw.customStart) : "";
    const customEnd = existing ? stringValue(existing.raw.customEnd) : "";
    const linkedLessonId = existing ? stringValue(existing.raw.linkedLessonId) || "0" : "0";
    const addClassDaysCode = existing ? stringValue(existing.raw.addClassDaysCode) : "";
    const oldLesson = JSON.stringify({
      classId: args.classId,
      date: args.date,
      extraLesson: Number(extraLesson),
      collaborateSubjectId: Number(collaborateSubjectId),
      lessonTitle: existing?.title ?? "",
      lessonText: existing?.lessonText ?? "",
      homeworkText: existing?.homeworkText ?? "",
      notesText: existing?.notesText ?? "",
      tab4Text: existing?.tab4Text ?? "",
      tab5Text: existing?.tab5Text ?? "",
      tab6Text: existing?.tab6Text ?? "",
    });

    const response = await this.request("POST", "/updateLesson", {
      classId: args.classId,
      customDate: args.date,
      lessonId,
      unitId,
      extraLesson,
      lessonLock,
      strategySent: "Y",
      unitStandardsSent: "Y",
      statusesSent: "Y",
      schoolWorks: "[]",
      addClassDaysCode,
      customStart,
      customEnd,
      linkedLessonId,
      isEditingALinkedLesson: "N",
      fetchDay: "true",
      updatedFields: "LESSONTITLE,LESSONTEXT",
      oldLesson,
      lessonTitle: args.title,
      lessonText: args.lessonText,
      homeworkText: existing?.homeworkText ?? "",
      notesText: existing?.notesText ?? "",
      tab4Text: existing?.tab4Text ?? "",
      tab5Text: existing?.tab5Text ?? "",
      tab6Text: existing?.tab6Text ?? "",
    });

    if (isErrorPayload(response)) {
      throw new Error(`Planbook rejected the lesson update: ${compactError(response)}.`);
    }

    const responseLessonId = findFirstString(response, ["lessonId", "id"]);
    if (!args.verify) {
      return {
        action: existing ? "updated" : "created",
        lessonId: existing?.id ?? responseLessonId,
        verified: false,
      };
    }

    const saved = await this.getLesson(args.date, args.classId, args.yearId);
    const verified = Boolean(
      saved &&
      saved.title.trim() === args.title.trim() &&
      comparableText(saved.lessonText).includes(comparableText(args.lessonText).slice(0, 120)),
    );
    if (!verified) {
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
  return record?.error === true || record?.error === "true";
}

function compactError(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 300);
  const record = asRecord(value);
  const message = record?.message ?? record?.errorMessage ?? record?.error;
  return typeof message === "string" ? message.slice(0, 300) : "unexpected response";
}

function findFirstString(value: unknown, keys: readonly string[]): string | undefined {
  for (const record of deepRecords(value)) {
    for (const key of keys) {
      const candidate = stringValue(record[key]);
      if (candidate && candidate !== "0") return candidate;
    }
  }
  return undefined;
}

function comparableText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parsePlanbookDate(value: string): number {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unexpected Planbook date ${value}.`);
  const [, month, day, year] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}
