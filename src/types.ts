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

export type FormattedLesson = {
  title?: string;
  html: string;
  headings: string[];
  bulletCount: number;
  sourceCharacters: number;
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
};
