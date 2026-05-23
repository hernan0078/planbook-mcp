import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch, { type RequestInit } from "node-fetch";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const AUTH_URL = "https://auth.planbook.com";
const API_URL = "https://api.planbook.com";

// Session state — populated once on first tool call
let sessionCookie = "";
let teacherId = "";
let yearId = "";
let apiKey = "";

// ---------------------------------------------------------------------------
// Cookie file support (written by refresh-cookies.ts / Playwright login)
// ---------------------------------------------------------------------------
function loadCookieFile(): string {
  const cookiePath = join(dirname(fileURLToPath(import.meta.url)), "../cookies.json");
  if (!existsSync(cookiePath)) return "";
  try {
    type PlaywrightCookie = { name: string; value: string; domain: string };
    const cookies: PlaywrightCookie[] = JSON.parse(readFileSync(cookiePath, "utf8"));
    // Use api.planbook.com cookies; fall back to app.planbook.com cookies
    const apiCookies = cookies.filter(c => c.domain.includes("api.planbook.com"));
    const pool = apiCookies.length ? apiCookies : cookies.filter(c => c.domain.includes("planbook.com"));
    return pool.map(c => `${c.name}=${c.value}`).join("; ");
  } catch {
    return "";
  }
}

// NOTE: loadCookieFile() is called dynamically in ensureLoggedIn so a
// re-run of refresh-cookies.py takes effect without restarting the server.
const presetIdToken = process.env.PLANBOOK_ID_TOKEN || "";

// Path to the Python cookie refresh script (one level up from dist/)
const REFRESH_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "../refresh-cookies.py");

// Spawns refresh-cookies.py to pull fresh cookies from Chrome's profile.
// Called automatically when session is expired or missing.
async function runCookieRefresh(): Promise<void> {
  console.error("[planbook-mcp] Session expired — auto-refreshing cookies from Chrome...");
  try {
    execSync(`python3 "${REFRESH_SCRIPT}"`, { stdio: "pipe", timeout: 30_000 });
    console.error("[planbook-mcp] Cookie refresh succeeded ✅");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      "Auto cookie refresh failed. Make sure you are logged into Planbook in Chrome, " +
      "then run: python3 refresh-cookies.py\n" + detail
    );
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function extractCookies(res: Awaited<ReturnType<typeof fetch>>): string {
  // node-fetch v3: headers.getSetCookie() returns all Set-Cookie values
  const raw: string[] = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ||
    [res.headers.get("set-cookie") || ""].filter(Boolean);
  return raw.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

function mergeCookies(existing: string, incoming: string): string {
  const map = new Map<string, string>();
  for (const pair of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...rest] = pair.split("=");
    if (k) map.set(k.trim(), rest.join("="));
  }
  for (const pair of incoming.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...rest] = pair.split("=");
    if (k) map.set(k.trim(), rest.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getCSRFToken(): Promise<string> {
  const res = await fetch(`${AUTH_URL}/login`);
  const html = await res.text();
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!match) throw new Error("Could not extract CSRF token from login page");
  sessionCookie = mergeCookies(sessionCookie, extractCookies(res));
  return match[1];
}

async function login(email: string, password: string): Promise<void> {
  const csrf = await getCSRFToken();
  const body = new URLSearchParams({ _csrf: csrf, username: email, password });
  const res = await fetch(`${AUTH_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookie,
    },
    body: body.toString(),
    redirect: "manual",
  } as RequestInit);

  sessionCookie = mergeCookies(sessionCookie, extractCookies(res));

  if (res.status !== 302 && res.status !== 200) {
    throw new Error(`Login failed — status ${res.status}`);
  }

  // Follow the redirect to pick up app-domain cookies
  const location = res.headers.get("location");
  if (location) {
    const redirectRes = await fetch(location, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    } as RequestInit);
    sessionCookie = mergeCookies(sessionCookie, extractCookies(redirectRes));
  }
}

async function ensureLoggedIn(): Promise<void> {
  if (teacherId) return;

  // Fast path A: PLANBOOK_ID_TOKEN header (24-hour JWT, manual)
  if (presetIdToken) {
    await loadSettings();
    return;
  }

  // Fast path B: read cookies.json fresh every time (so refresh-cookies.py
  // takes effect immediately without restarting the MCP server)
  const freshCookie = loadCookieFile();
  if (freshCookie) {
    sessionCookie = freshCookie;
    await loadSettings();
    if (teacherId) return; // worked
    sessionCookie = ""; // expired — fall through to auto-refresh
  }

  // Auto-refresh: run refresh-cookies.py to pull new cookies from Chrome
  await runCookieRefresh();
  const refreshedCookie = loadCookieFile();
  if (refreshedCookie) {
    sessionCookie = refreshedCookie;
    await loadSettings();
    if (teacherId) return; // worked after refresh
    sessionCookie = "";
  }

  throw new Error(
    "Could not authenticate with Planbook even after cookie refresh. " +
    "Make sure you are logged into Planbook in Chrome and try again."
  );
}

function authHeaders(): Record<string, string> {
  if (presetIdToken) return { idToken: presetIdToken };
  if (sessionCookie) return { Cookie: sessionCookie };
  return {};
}

// Detect notLoggedIn response and reset session state so the next
// ensureLoggedIn() call will trigger a fresh auto-refresh.
function checkAuth(data: unknown): void {
  if ((data as Record<string, unknown>)?.notLoggedIn === "true") {
    // Reset session so ensureLoggedIn() will re-authenticate on next call
    teacherId = "";
    sessionCookie = "";
    throw new Error("__PLANBOOK_NOT_LOGGED_IN__");
  }
}

async function apiGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  await ensureLoggedIn();
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const doFetch = async () => {
    const res = await fetch(url.toString(), { headers: authHeaders() } as RequestInit);
    if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
    const data = await res.json();
    checkAuth(data);
    return data;
  };
  try {
    return await doFetch();
  } catch (err) {
    if (String(err).includes("__PLANBOOK_NOT_LOGGED_IN__")) {
      // Mid-session expiry: auto-refresh and retry once
      await ensureLoggedIn();
      return await doFetch();
    }
    throw err;
  }
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  await ensureLoggedIn();
  const doFetch = async () => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...authHeaders(),
      },
      body: new URLSearchParams(
        Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]))
      ).toString(),
    } as RequestInit);
    if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
    const data = await res.json();
    checkAuth(data);
    return data;
  };
  try {
    return await doFetch();
  } catch (err) {
    if (String(err).includes("__PLANBOOK_NOT_LOGGED_IN__")) {
      // Mid-session expiry: auto-refresh and retry once
      await ensureLoggedIn();
      return await doFetch();
    }
    throw err;
  }
}

async function loadSettings(): Promise<void> {
  // Fetch directly — bypass apiGet/ensureLoggedIn to avoid circular recursion
  const res = await fetch(`${API_URL}/getSettings`, {
    headers: authHeaders(),
  } as RequestInit);
  if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const userData = (data.userData || {}) as Record<string, unknown>;
  teacherId = String(userData.teacherId || "");
  yearId = String(userData.currentSchoolYearId || "");
  apiKey = String((data as Record<string, unknown>).apiKey || "");
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "planbook",
  version: "1.0.0",
});

// --- get_settings -----------------------------------------------------------
server.tool(
  "get_settings",
  "Get current user settings and context (teacher ID, year, classes config)",
  {},
  async () => {
    await ensureLoggedIn();
    const data = await apiGet("/getSettings");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_classes ------------------------------------------------------------
server.tool(
  "get_classes",
  "List all classes/courses for the current teacher",
  {},
  async () => {
    const data = await apiGet("/getClasses2");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_schedule -----------------------------------------------------------
server.tool(
  "get_schedule",
  "Get the cycle/page schedule showing which dates map to which cycle pages",
  {},
  async () => {
    const data = await apiGet("/services/planbook/lesson/getCycleSchedule");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_standards ----------------------------------------------------------
server.tool(
  "get_standards",
  "Get available standards for the current teacher",
  {},
  async () => {
    const data = await apiGet("/getStandards");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_templates ----------------------------------------------------------
server.tool(
  "get_templates",
  "Get lesson plan templates for the current teacher",
  {},
  async () => {
    await ensureLoggedIn();
    const data = await apiGet("/services/planbook/template/get", {
      teacherId,
      userMode: "T",
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_lessons ------------------------------------------------------------
server.tool(
  "get_lessons",
  "Get lesson plans. Optionally filter by date (MM/DD/YYYY) or date range.",
  {
    date: z.string().optional().describe("Specific date MM/DD/YYYY"),
    startDate: z.string().optional().describe("Start of date range MM/DD/YYYY"),
    endDate: z.string().optional().describe("End of date range MM/DD/YYYY"),
    classId: z.string().optional().describe("Filter by class ID"),
  },
  async ({ date, startDate, endDate, classId }) => {
    await ensureLoggedIn();
    const params: Record<string, string> = {};
    if (date) params["date"] = date;
    if (startDate) params["startDate"] = startDate;
    if (endDate) params["endDate"] = endDate;
    if (classId) params["classId"] = classId;
    if (teacherId) params["teacherId"] = teacherId;
    if (yearId) params["yearId"] = yearId;

    // Try GET first; fall back to POST if no data
    let data = await apiGet("/getLessons", params);
    const asObj = data as Record<string, unknown>;
    if (asObj.error === "true") {
      data = await apiPost("/getLessons", params);
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_lesson_events ------------------------------------------------------
server.tool(
  "get_lesson_events",
  "Get lessons as calendar events (useful for date-based views)",
  {
    date: z.string().optional().describe("Date MM/DD/YYYY"),
    startDate: z.string().optional().describe("Start MM/DD/YYYY"),
    endDate: z.string().optional().describe("End MM/DD/YYYY"),
  },
  async ({ date, startDate, endDate }) => {
    await ensureLoggedIn();
    const params: Record<string, string> = {};
    if (date) params["date"] = date;
    if (startDate) params["startDate"] = startDate;
    if (endDate) params["endDate"] = endDate;
    if (teacherId) params["teacherId"] = teacherId;
    if (yearId) params["yearId"] = yearId;
    const data = await apiGet("/getLessonsEvents", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- get_comments -----------------------------------------------------------
server.tool(
  "get_comments",
  "Get comments for a specific lesson",
  {
    lessonId: z.string().describe("The lesson ID to get comments for"),
  },
  async ({ lessonId }) => {
    const data = await apiPost("/getCommentsTo", { lessonId, teacherId });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- save_lesson ------------------------------------------------------------
// All content is HTML. lessonId="0" creates a new lesson; a real ID updates.
// updatedFields tells the server which sections changed (comma-separated):
//   LESSONTITLE, LESSONTEXT, HOMEWORKTEXT, NOTESTEXT, TAB4TEXT, TAB5TEXT, TAB6TEXT
server.tool(
  "save_lesson",
  `Create or update a lesson plan on a specific date and class.
Content fields (lessonText, homeworkText, etc.) accept plain text or HTML.
Pass lessonId="0" to create a new lesson; pass an existing lessonId to update.
Use get_lessons first to retrieve current content and the lessonId before updating.

FORMATTING RULES — always follow these when building lesson HTML:
1. NO emojis anywhere in the lesson content (no 🔔, ⚡, 🚪, or any other emoji).
2. Standards must each appear on their own line as a <ul><li> list — never comma-separated. Always include the full standard name after the code, separated by a dash: e.g. <li>ELA.K12.EE.4.1 – Use appropriate listening and collaboration skills</li>. Never list the code alone without its description.
3. Section headers use <p><strong>Header Text</strong></p> on their own line — no emoji prefixes.
4. Content NEVER goes inline with a header. The header is always its own <p><strong>...</strong></p> line, and the content follows on the next line. For example:
   CORRECT:   <p><strong>Essential Question</strong></p><p>How can discussion...</p>
   WRONG:     <p><strong>Essential Question:</strong> How can discussion...</p>
   This applies to Essential Question, Objectives, Standards, and all other section labels.
5. NO <hr/> or <hr> dividers anywhere in the lesson. Never use horizontal rule tags to separate sections.
6. Assessment items must be a <ul><li> list below a standalone <p><strong>Assessment</strong></p> header — never pipe-separated inline (e.g. "Bell Ringer – Formative | Exit Ticket – Formative" is WRONG). Each assessment item gets its own <li>.`,
  {
    classId: z.string().describe("Class/course ID (from get_classes)"),
    date: z.string().describe("Date MM/DD/YYYY e.g. 05/12/2026"),
    lessonId: z.string().default("0").describe("Lesson ID to update, or '0' to create new"),
    lessonTitle: z.string().optional().describe("Lesson title"),
    lessonText: z.string().optional().describe("Main lesson body — HTML only. Standards must be a <ul><li> list (one per line). No emojis anywhere. Section headers use <strong> tags only."),
    homeworkText: z.string().optional().describe("Homework section — HTML or plain text"),
    notesText: z.string().optional().describe("Teacher notes — HTML or plain text"),
    tab4Text: z.string().optional().describe("Extra tab 4 content"),
    tab5Text: z.string().optional().describe("Extra tab 5 content"),
    tab6Text: z.string().optional().describe("Extra tab 6 content"),
    unitId: z.string().default("0").describe("Unit ID, or '0' for no unit"),
  },
  async ({ classId, date, lessonId, lessonTitle, lessonText, homeworkText, notesText, tab4Text, tab5Text, tab6Text, unitId }) => {
    await ensureLoggedIn();

    // Track which fields are being changed
    const updatedParts: string[] = [];
    if (lessonTitle !== undefined) updatedParts.push("LESSONTITLE");
    if (lessonText !== undefined) updatedParts.push("LESSONTEXT");
    if (homeworkText !== undefined) updatedParts.push("HOMEWORKTEXT");
    if (notesText !== undefined) updatedParts.push("NOTESTEXT");
    if (tab4Text !== undefined) updatedParts.push("TAB4TEXT");
    if (tab5Text !== undefined) updatedParts.push("TAB5TEXT");
    if (tab6Text !== undefined) updatedParts.push("TAB6TEXT");

    const toHtml = (text: string) =>
      text.startsWith("<") ? text : `<p>${text.replace(/\n/g, "</p><p>")}</p>`;

    const lessonTextHtml = lessonText !== undefined ? toHtml(lessonText) : "";
    const homeworkTextHtml = homeworkText !== undefined ? toHtml(homeworkText) : "";
    const notesTextHtml = notesText !== undefined ? toHtml(notesText) : "";
    const tab4Html = tab4Text !== undefined ? toHtml(tab4Text) : "";
    const tab5Html = tab5Text !== undefined ? toHtml(tab5Text) : "";
    const tab6Html = tab6Text !== undefined ? toHtml(tab6Text) : "";

    // Server uses oldLesson for conflict detection — send current state
    const oldLesson = JSON.stringify({
      classId, date, extraLesson: 0, collaborateSubjectId: 0,
      lessonTitle: lessonTitle ?? "",
      lessonText: lessonTextHtml,
      homeworkText: homeworkTextHtml,
      notesText: notesTextHtml,
      tab4Text: tab4Html, tab5Text: tab5Html, tab6Text: tab6Html,
    });

    const data = await apiPost("/updateLesson", {
      classId,
      customDate: date,
      lessonId: lessonId ?? "0",
      unitId: unitId ?? "0",
      extraLesson: "0",
      lessonLock: "N",
      strategySent: "Y",
      unitStandardsSent: "Y",
      statusesSent: "Y",
      schoolWorks: "[]",
      addClassDaysCode: "",
      customStart: "",
      customEnd: "",
      linkedLessonId: "0",
      isEditingALinkedLesson: "N",
      fetchDay: "true",
      updatedFields: updatedParts.join(","),
      oldLesson,
      lessonTitle: lessonTitle ?? "",
      lessonText: lessonTextHtml,
      homeworkText: homeworkTextHtml,
      notesText: notesTextHtml,
      tab4Text: tab4Html,
      tab5Text: tab5Html,
      tab6Text: tab6Html,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- copy_lesson ------------------------------------------------------------
server.tool(
  "copy_lesson",
  "Copy an existing lesson to a different date (same or different class)",
  {
    lessonId: z.string().describe("Source lesson ID (from get_lessons)"),
    targetDate: z.string().describe("Destination date MM/DD/YYYY"),
    targetClassId: z.string().optional().describe("Target class ID (defaults to same class)"),
  },
  async ({ lessonId, targetDate, targetClassId }) => {
    await ensureLoggedIn();
    const data = await apiPost("/copyLesson", {
      teacherId,
      yearId,
      lessonId,
      targetDate,
      ...(targetClassId ? { targetClassId } : {}),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
