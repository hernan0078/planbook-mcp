#!/bin/bash
# Planbook MCP — one-shot installer
# Run this on any Mac that has Node.js 18+ installed
# Usage: bash install.sh

set -e

INSTALL_DIR="$HOME/planbook-mcp"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "Installing Planbook MCP server to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR/src"
cd "$INSTALL_DIR"

# ── package.json ────────────────────────────────────────────────────────────
cat > package.json << 'EOF'
{
  "name": "planbook-mcp",
  "version": "1.0.0",
  "description": "MCP server for Planbook lesson planning",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "node-fetch": "^3.3.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.4.0"
  }
}
EOF

# ── tsconfig.json ────────────────────────────────────────────────────────────
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": false,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
EOF

# ── src/index.ts ─────────────────────────────────────────────────────────────
cat > src/index.ts << 'EOF'
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch, { type RequestInit } from "node-fetch";

const AUTH_URL = "https://auth.planbook.com";
const API_URL = "https://api.planbook.com";

let sessionCookie = "";
let teacherId = "";
let yearId = "";
let apiKey = "";

function extractCookies(res: Awaited<ReturnType<typeof fetch>>): string {
  const raw: string[] =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ||
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sessionCookie },
    body: body.toString(),
    redirect: "manual",
  } as RequestInit);
  sessionCookie = mergeCookies(sessionCookie, extractCookies(res));
  if (res.status !== 302 && res.status !== 200)
    throw new Error(`Login failed — HTTP ${res.status}`);
  const location = res.headers.get("location");
  if (location) {
    const rr = await fetch(location, { headers: { Cookie: sessionCookie }, redirect: "manual" } as RequestInit);
    sessionCookie = mergeCookies(sessionCookie, extractCookies(rr));
  }
}

async function loadSettings(): Promise<void> {
  // Fetch directly — bypass apiGet/ensureLoggedIn to avoid circular recursion
  const res = await fetch(`${API_URL}/getSettings`, {
    headers: { Cookie: sessionCookie },
  } as RequestInit);
  if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const ud = (data.userData || {}) as Record<string, unknown>;
  teacherId = String(ud.teacherId || "");
  yearId = String(ud.currentSchoolYearId || "");
  apiKey = String((data as Record<string, unknown>).apiKey || "");
}

async function ensureLoggedIn(): Promise<void> {
  if (sessionCookie && teacherId) return;
  const email = process.env.PLANBOOK_EMAIL;
  const password = process.env.PLANBOOK_PASSWORD;
  if (!email || !password)
    throw new Error("Set PLANBOOK_EMAIL and PLANBOOK_PASSWORD environment variables");
  await login(email, password);
  await loadSettings();
}

async function apiGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  await ensureLoggedIn();
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (apiKey && !url.searchParams.has("apiKey")) url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), { headers: { Cookie: sessionCookie } } as RequestInit);
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json();
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  await ensureLoggedIn();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sessionCookie },
    body: new URLSearchParams(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]))
    ).toString(),
  } as RequestInit);
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json();
}

const server = new McpServer({ name: "planbook", version: "1.0.0" });

server.tool("get_settings", "Get user settings and context (teacher ID, year)", {}, async () => {
  await ensureLoggedIn();
  return { content: [{ type: "text", text: JSON.stringify(await apiGet("/getSettings"), null, 2) }] };
});

server.tool("get_classes", "List all classes/courses for the current teacher", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(await apiGet("/getClasses2"), null, 2) }],
}));

server.tool("get_schedule", "Get cycle schedule (dates to cycle pages)", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(await apiGet("/services/planbook/lesson/getCycleSchedule"), null, 2) }],
}));

server.tool("get_standards", "Get available standards for the current teacher", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(await apiGet("/getStandards"), null, 2) }],
}));

server.tool("get_templates", "Get lesson plan templates", {}, async () => {
  await ensureLoggedIn();
  return { content: [{ type: "text", text: JSON.stringify(await apiGet("/services/planbook/template/get", { teacherId, userMode: "T" }), null, 2) }] };
});

server.tool(
  "get_lessons",
  "Get lesson plans, optionally filtered by date or date range",
  {
    date: z.string().optional().describe("Specific date MM/DD/YYYY"),
    startDate: z.string().optional().describe("Start of range MM/DD/YYYY"),
    endDate: z.string().optional().describe("End of range MM/DD/YYYY"),
    classId: z.string().optional().describe("Filter by class ID"),
  },
  async ({ date, startDate, endDate, classId }) => {
    await ensureLoggedIn();
    const params: Record<string, string> = { teacherId, yearId };
    if (date) params["date"] = date;
    if (startDate) params["startDate"] = startDate;
    if (endDate) params["endDate"] = endDate;
    if (classId) params["classId"] = classId;
    let data = await apiGet("/getLessons", params);
    if ((data as Record<string, unknown>).error === "true") data = await apiPost("/getLessons", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_lesson_events",
  "Get lessons as calendar events for a date or range",
  {
    date: z.string().optional().describe("Date MM/DD/YYYY"),
    startDate: z.string().optional().describe("Start MM/DD/YYYY"),
    endDate: z.string().optional().describe("End MM/DD/YYYY"),
  },
  async ({ date, startDate, endDate }) => {
    await ensureLoggedIn();
    const params: Record<string, string> = { teacherId, yearId };
    if (date) params["date"] = date;
    if (startDate) params["startDate"] = startDate;
    if (endDate) params["endDate"] = endDate;
    return { content: [{ type: "text", text: JSON.stringify(await apiGet("/getLessonsEvents", params), null, 2) }] };
  }
);

server.tool(
  "get_comments",
  "Get comments for a specific lesson",
  { lessonId: z.string().describe("Lesson ID") },
  async ({ lessonId }) => ({
    content: [{ type: "text", text: JSON.stringify(await apiPost("/getCommentsTo", { lessonId, teacherId }), null, 2) }],
  })
);

// save_lesson: lessonId="0" creates new, real ID updates existing.
// updatedFields flags which sections changed: LESSONTITLE, LESSONTEXT, HOMEWORKTEXT, NOTESTEXT, TAB4TEXT, TAB5TEXT, TAB6TEXT
server.tool(
  "save_lesson",
  `Create or update a lesson plan on a specific date and class.
Content fields accept plain text or HTML. lessonId="0" creates a new lesson.
Call get_lessons first to get the current lessonId before updating.`,
  {
    classId: z.string().describe("Class/course ID (from get_classes)"),
    date: z.string().describe("Date MM/DD/YYYY e.g. 05/12/2026"),
    lessonId: z.string().default("0").describe("Lesson ID to update, or '0' to create new"),
    lessonTitle: z.string().optional().describe("Lesson title"),
    lessonText: z.string().optional().describe("Main lesson body (HTML or plain text) — include standards, objectives, essential questions"),
    homeworkText: z.string().optional().describe("Homework section (HTML or plain text)"),
    notesText: z.string().optional().describe("Teacher notes (HTML or plain text)"),
    tab4Text: z.string().optional().describe("Extra tab 4 content"),
    tab5Text: z.string().optional().describe("Extra tab 5 content"),
    tab6Text: z.string().optional().describe("Extra tab 6 content"),
    unitId: z.string().default("0").describe("Unit ID, or '0' for no unit"),
  },
  async ({ classId, date, lessonId, lessonTitle, lessonText, homeworkText, notesText, tab4Text, tab5Text, tab6Text, unitId }) => {
    await ensureLoggedIn();
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

server.tool(
  "copy_lesson",
  "Copy a lesson to a different date",
  {
    lessonId: z.string().describe("Source lesson ID (from get_lessons)"),
    targetDate: z.string().describe("Destination date MM/DD/YYYY"),
    targetClassId: z.string().optional().describe("Target class ID (defaults to same class)"),
  },
  async ({ lessonId, targetDate, targetClassId }) => {
    await ensureLoggedIn();
    const data = await apiPost("/copyLesson", {
      teacherId, yearId, lessonId, targetDate,
      ...(targetClassId ? { targetClassId } : {}),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
EOF

# ── install deps & build ─────────────────────────────────────────────────────
echo "Installing dependencies..."
npm install --silent

echo "Building TypeScript..."
npx tsc

echo ""

# ── register with Claude Code ────────────────────────────────────────────────
mkdir -p "$HOME/.claude"

if [ -f "$SETTINGS_FILE" ]; then
  echo "⚠️  $SETTINGS_FILE already exists."
  echo "   Add this block manually under \"mcpServers\":"
  echo ""
  cat << SNIPPET
    "planbook": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/index.js"],
      "env": {
        "PLANBOOK_EMAIL": "YOUR_EMAIL",
        "PLANBOOK_PASSWORD": "YOUR_PASSWORD"
      }
    }
SNIPPET
else
  cat > "$SETTINGS_FILE" << SETTINGSJSON
{
  "mcpServers": {
    "planbook": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/index.js"],
      "env": {
        "PLANBOOK_EMAIL": "YOUR_EMAIL_HERE",
        "PLANBOOK_PASSWORD": "YOUR_PASSWORD_HERE"
      }
    }
  }
}
SETTINGSJSON
  echo "✅ Created $SETTINGS_FILE"
  echo "   Edit it and fill in PLANBOOK_EMAIL and PLANBOOK_PASSWORD."
fi

echo ""
echo "✅ Done! Planbook MCP installed at $INSTALL_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit ~/.claude/settings.json — add your email and password"
echo "  2. Restart Claude Code"
echo "  3. Available tools: get_lessons, save_lesson, copy_lesson,"
echo "     get_classes, get_schedule, get_standards, get_templates"
