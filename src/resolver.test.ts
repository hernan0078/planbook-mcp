import assert from "node:assert/strict";
import test from "node:test";

import { extractClasses, findLesson, resolveClass } from "./resolver.js";

const classPayload = {
  data: {
    classes: [
      { classId: 10, className: "English Advanced - P3" },
      { classId: 20, className: "ESOL 1-2 - P2", periodNumber: 2 },
      { classId: 30, className: "ESOL 3-4 - P4" },
    ],
  },
};

test("extracts and resolves classes without a discovery round trip", () => {
  const classes = extractClasses(classPayload);
  assert.equal(classes.length, 3);
  assert.deepEqual(resolveClass(classes, "3"), {
    id: "10",
    name: "English Advanced - P3",
    period: undefined,
    yearId: undefined,
  });
  assert.equal(resolveClass(classes, "P2").id, "20");
});

test("understands Planbook's current compact class keys", () => {
  const classes = extractClasses({
    classes: [{ cId: 29565741, cN: "English Advanced - P3", cYId: 92930938 }],
  });
  assert.deepEqual(classes[0], {
    id: "29565741",
    name: "English Advanced - P3",
    period: undefined,
    yearId: "92930938",
  });
});

test("asks for a class name only when a period is ambiguous", () => {
  const classes = extractClasses({
    classes: [
      { classId: "a", className: "English - P3" },
      { classId: "b", className: "Writing Lab - P3" },
    ],
  });
  assert.throws(() => resolveClass(classes, "3"), /multiple classes/);
  assert.equal(resolveClass(classes, "3", "Writing").id, "b");
});

test("finds an existing lesson for idempotent updates", () => {
  const payload = {
    lessons: [
      {
        lessonId: "900",
        classId: "10",
        customDate: "05/11/2026",
        lessonTitle: "Poetry",
        lessonText: "<p>Existing</p>",
      },
    ],
  };
  const lesson = findLesson(payload, "10", "05/11/2026");
  assert.equal(lesson?.id, "900");
  assert.equal(lesson?.title, "Poetry");
});

test("finds a lesson in the current full-year class payload", () => {
  const payload = {
    classId: 29565741,
    classYearId: 92930938,
    lessons: [
      {
        date: "05/11/2026",
        classId: 29565741,
        lessonId: 1505545014,
        lessonTitle: "Poetry Assessment",
        lessonText: '<div style="font-family: Arial, sans-serif;">Lesson</div>',
        homeworkText: "",
        notesText: "",
        tab4Text: "",
        tab5Text: "",
        tab6Text: "",
      },
    ],
  };

  const lesson = findLesson(payload, "29565741", "05/11/2026");
  assert.equal(lesson?.id, "1505545014");
  assert.equal(lesson?.lessonText, '<div style="font-family: Arial, sans-serif;">Lesson</div>');
});
