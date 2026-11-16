export type JsonRecord = Record<string, unknown>;

export type PlanbookClass = {
  id: string;
  name: string;
  period?: string;
  yearId?: string;
  yearName?: string;
};

export type LessonRecord = {
  id: string;
  classId?: string;
  date?: string;
  title: string;
  lessonText: string;
  homeworkText: string;
  notesText: string;
  tab4Text: string;
  tab5Text: string;
  tab6Text: string;
  raw: JsonRecord;
};

export type CleanupProfile = "hernan-planbook";

export type CleanupReport = {
  profile: CleanupProfile;
  removed: {
    packaging: number;
    metadata: number;
    optional: number;
    audio: number;
    answerScaffolds: number;
  };
  demotedCues: number;
};

export type FormatOptions = {
  cleanupProfile?: CleanupProfile;
};

export type FormattedLesson = {
  title?: string;
  html: string;
  headings: string[];
  bulletCount: number;
  sourceCharacters: number;
  cleanup?: CleanupReport;
};

export type UpsertLessonInput = {
  date: string;
  period: string;
  className?: string;
  title?: string;
  lessonPlan: string;
  overwrite: boolean;
  verify: boolean;
  dryRun: boolean;
  cleanupProfile?: CleanupProfile;
};

export type UpsertLessonResult = {
  ok: boolean;
  action: "created" | "updated" | "preview";
  date: string;
  period: string;
  classId?: string;
  className?: string;
  lessonId?: string;
  title: string;
  verified: boolean;
  headings?: string[];
  bulletCount?: number;
  htmlCharacters?: number;
  cleanup?: CleanupReport;
};

export type LessonBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] };

export type LessonSection = {
  heading?: string;
  blocks: LessonBlock[];
};

export type LessonExportFormat = "json" | "markdown" | "text" | "html";

export type ExtractedLesson = {
  found: boolean;
  date: string;
  period: string;
  classId: string;
  className: string;
  lessonId?: string;
  title?: string;
  format: LessonExportFormat;
  content?: string;
  sections?: LessonSection[];
};

export type LessonSlot = {
  date: string;
  classId: string;
  lesson?: LessonRecord;
};
