#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { PlanbookClient } from "./client.js";
import { formatLessonPlan, normalizeDate } from "./format.js";
import { resolveClass } from "./resolver.js";
import type { UpsertLessonResult } from "./types.js";

const client = new PlanbookClient();

const server = new McpServer(
  { name: "planbook", version: "2.0.1" },
  {
    instructions:
      "Use upsert_lesson directly for lesson entry; it resolves the class and existing lesson automatically. " +
      "Pass the user's raw lesson plan unchanged. Call list_classes only after an ambiguity error.",
  },
);

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

await server.connect(new StdioServerTransport());
