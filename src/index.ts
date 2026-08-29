#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { PlanbookClient } from "./client.js";
import { buildDateRange, extractLesson } from "./export.js";
import { formatLessonPlan, normalizeDate } from "./format.js";
import { resolveClass, selectClasses } from "./resolver.js";
import type { UpsertLessonResult } from "./types.js";

const client = new PlanbookClient();

const server = new McpServer(
  { name: "planbook", version: "2.1.0" },
  {
    instructions:
      "Use upsert_lesson directly for lesson entry; it resolves the class and existing lesson automatically. " +
      "Pass the user's raw lesson plan unchanged. Use extract_lesson for one saved lesson and extract_lessons for bulk read-only exports. " +
      "Call list_classes only after an ambiguity error.",
  },
);

const exportFormat = z.enum(["json", "markdown", "text", "html"]);
const lessonBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(z.string())) }),
]);
const lessonSection = z.object({
  heading: z.string().optional(),
  blocks: z.array(lessonBlock),
});
const extractedLessonOutput = z.object({
  found: z.boolean(),
  date: z.string(),
  period: z.string(),
  classId: z.string(),
  className: z.string(),
  lessonId: z.string().optional(),
  title: z.string().optional(),
  format: exportFormat,
  content: z.string().optional(),
  sections: z.array(lessonSection).optional(),
});

const upsertOutput = z.object({
  ok: z.boolean(),
  action: z.enum(["created", "updated", "preview"]),
  date: z.string(),
  period: z.string(),
  classId: z.string().optional(),
  className: z.string().optional(),
  lessonId: z.string().optional(),
  title: z.string(),
  verified: z.boolean(),
  headings: z.array(z.string()).optional(),
  bulletCount: z.number().optional(),
  htmlCharacters: z.number().optional(),
});

server.registerTool(
  "upsert_lesson",
  {
    title: "Create or update a Planbook lesson",
    description:
      "One-shot lesson entry. Resolves period/class and existing lesson, formats raw text in Arial, replaces dummy content, saves, and verifies.",
    inputSchema: z.object({
      date: z.string().describe("YYYY-MM-DD preferred; MM/DD/YYYY accepted"),
      period: z.union([z.string(), z.number()]).describe("Period number or label, e.g. 3 or P3"),
      className: z.string().optional().describe("Only needed when a period has multiple classes"),
      title: z.string().optional().describe("Optional when the plan contains a Lesson Title block"),
      lessonPlan: z.string().min(1).describe("Raw pasted lesson plan; do not pre-format as HTML"),
      overwrite: z.boolean().default(true).describe("Replace an existing lesson on the target date"),
      verify: z.boolean().default(true).describe("Read the lesson back after saving"),
      dryRun: z.boolean().default(false).describe("Format and validate without contacting Planbook"),
    }),
    outputSchema: upsertOutput,
    annotations: {
      idempotentHint: true,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  async ({ date, period, className, title, lessonPlan, overwrite, verify, dryRun }) => {
    try {
      const planbookDate = normalizeDate(date);
      const periodLabel = String(period);
      const formatted = formatLessonPlan(lessonPlan);
      const lessonTitle = title?.trim() || formatted.title?.trim();
      if (!lessonTitle) {
        throw new Error("Lesson title is missing. Pass title or include a Lesson Title block.");
      }

      if (dryRun) {
        const preview: UpsertLessonResult = {
          ok: true,
          action: "preview",
          date: planbookDate,
          period: periodLabel,
          title: lessonTitle,
          verified: false,
          headings: formatted.headings,
          bulletCount: formatted.bulletCount,
          htmlCharacters: formatted.html.length,
        };
        return toolSuccess(
          `Preview ready: ${lessonTitle} (${formatted.headings.length} sections, ${formatted.bulletCount} list items).`,
          preview,
        );
      }

      const classes = await client.listClasses(planbookDate);
      const targetClass = resolveClass(classes, periodLabel, className);
      const saved = await client.upsertLesson({
        date: planbookDate,
        classId: targetClass.id,
        yearId: targetClass.yearId,
        title: lessonTitle,
        lessonText: formatted.html,
        overwrite,
        verify,
      });

      const result: UpsertLessonResult = {
        ok: true,
        action: saved.action,
        date: planbookDate,
        period: periodLabel,
        classId: targetClass.id,
        className: targetClass.name,
        lessonId: saved.lessonId,
        title: lessonTitle,
        verified: saved.verified,
      };
      return toolSuccess(
        `${saved.action === "created" ? "Created" : "Updated"} ${lessonTitle} for ${planbookDate}, ${targetClass.name}${saved.verified ? " and verified it" : ""}.`,
        result,
      );
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "extract_lesson",
  {
    title: "Extract one Planbook lesson",
    description:
      "Read one saved lesson by date and period as structured JSON, Markdown, plain text, or exact saved HTML.",
    inputSchema: z.object({
      date: z.string().describe("YYYY-MM-DD preferred; MM/DD/YYYY accepted"),
      period: z.union([z.string(), z.number()]).describe("Period number or label, e.g. 3 or P3"),
      className: z.string().optional().describe("Only needed when a period has multiple classes"),
      format: exportFormat.default("json"),
    }),
    outputSchema: extractedLessonOutput,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ date, period, className, format }) => {
    try {
      const planbookDate = normalizeDate(date);
      const targetClass = resolveClass(
        await client.listClasses(planbookDate),
        String(period),
        className,
      );
      const output = extractLesson(
        planbookDate,
        targetClass,
        await client.getLesson(planbookDate, targetClass.id, targetClass.yearId),
        format,
      );
      return toolSuccess(
        output.found
          ? `${output.title || "Untitled lesson"} extracted for ${targetClass.name}.`
          : `No lesson found for ${targetClass.name}.`,
        output,
      );
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "extract_lessons",
  {
    title: "Bulk extract Planbook lessons",
    description:
      "Read saved lessons across a date range with optional period and class-name filters. Fetches each class feed once.",
    inputSchema: z.object({
      startDate: z.string().describe("First date, inclusive; YYYY-MM-DD preferred"),
      endDate: z.string().optional().describe("Last date, inclusive; defaults to startDate; maximum 31 calendar days"),
      periods: z.array(z.union([z.string(), z.number()])).default([])
        .describe("Optional period filters, e.g. [1, 3, 8]; empty means all classes"),
      classNames: z.array(z.string()).default([])
        .describe("Optional case-insensitive class-name substrings; combined with periods"),
      format: exportFormat.default("json"),
      includeEmpty: z.boolean().default(false)
        .describe("Include requested class/date slots that contain no lesson"),
      includeWeekends: z.boolean().default(false)
        .describe("Include Saturday and Sunday in the requested date range"),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      startDate: z.string(),
      endDate: z.string(),
      format: exportFormat,
      dateCount: z.number(),
      classCount: z.number(),
      lessonCount: z.number(),
      emptyCount: z.number(),
      lessons: z.array(extractedLessonOutput),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ startDate, endDate, periods, classNames, format, includeEmpty, includeWeekends }) => {
    try {
      const firstDate = normalizeDate(startDate);
      const lastDate = normalizeDate(endDate || startDate);
      const dates = buildDateRange(firstDate, lastDate, includeWeekends);
      const classes = selectClasses(
        await client.listClasses(firstDate),
        periods.map(String),
        classNames,
      );
      if (!classes.length) {
        throw new Error("No Planbook classes matched the supplied period and class-name filters.");
      }

      const classById = new Map(classes.map((item) => [item.id, item]));
      const dateOrder = new Map(dates.map((date, index) => [date, index]));
      const slots = await client.getLessonsForClasses(dates, classes);
      const allLessons = slots
        .map((slot) => extractLesson(slot.date, classById.get(slot.classId)!, slot.lesson, format))
        .sort((a, b) => (
          (dateOrder.get(a.date) ?? 0) - (dateOrder.get(b.date) ?? 0) ||
          periodSortValue(a.period) - periodSortValue(b.period) ||
          a.className.localeCompare(b.className)
        ));
      const lessonCount = allLessons.filter((lesson) => lesson.found).length;
      const emptyCount = allLessons.length - lessonCount;
      const lessons = includeEmpty ? allLessons : allLessons.filter((lesson) => lesson.found);
      const output = {
        ok: true,
        startDate: firstDate,
        endDate: lastDate,
        format,
        dateCount: dates.length,
        classCount: classes.length,
        lessonCount,
        emptyCount,
        lessons,
      };
      return toolSuccess(
        `Extracted ${lessonCount} lesson${lessonCount === 1 ? "" : "s"} across ${dates.length} date${dates.length === 1 ? "" : "s"} and ${classes.length} class${classes.length === 1 ? "" : "es"}.`,
        output,
      );
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "get_lesson",
  {
    title: "Get one Planbook lesson",
    description: "Resolve a period and return one lesson summary for a date. HTML is omitted by default.",
    inputSchema: z.object({
      date: z.string().describe("YYYY-MM-DD preferred; MM/DD/YYYY accepted"),
      period: z.union([z.string(), z.number()]),
      className: z.string().optional(),
      includeHtml: z.boolean().default(false),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      date: z.string(),
      classId: z.string(),
      className: z.string(),
      lessonId: z.string().optional(),
      title: z.string().optional(),
      html: z.string().optional(),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ date, period, className, includeHtml }) => {
    try {
      const planbookDate = normalizeDate(date);
      const targetClass = resolveClass(
        await client.listClasses(planbookDate),
        String(period),
        className,
      );
      const lesson = await client.getLesson(planbookDate, targetClass.id, targetClass.yearId);
      const output = {
        found: Boolean(lesson),
        date: planbookDate,
        classId: targetClass.id,
        className: targetClass.name,
        ...(lesson
          ? {
              lessonId: lesson.id,
              title: lesson.title,
              ...(includeHtml ? { html: lesson.lessonText } : {}),
            }
          : {}),
      };
      return toolSuccess(
        lesson ? `${lesson.title || "Untitled lesson"} found for ${targetClass.name}.` : `No lesson found for ${targetClass.name}.`,
        output,
      );
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "list_classes",
  {
    title: "List Planbook classes",
    description: "Compact class IDs, names, and periods. Use only to resolve an ambiguity.",
    inputSchema: z.object({
      date: z.string().optional().describe("Target date; include it when resolving an ambiguity"),
    }),
    outputSchema: z.object({
      classes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          period: z.string().optional(),
          yearId: z.string().optional(),
          yearName: z.string().optional(),
        }),
      ),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ date }) => {
    try {
      const planbookDate = date ? normalizeDate(date) : undefined;
      const classes = await client.listClasses(planbookDate);
      return toolSuccess(`${classes.length} classes found.`, { classes });
    } catch (error) {
      return toolError(error);
    }
  },
);

function toolSuccess<T extends Record<string, unknown>>(message: string, output: T) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: output,
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function periodSortValue(period: string): number {
  return Number(/\d+/.exec(period)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

await server.connect(new StdioServerTransport());
