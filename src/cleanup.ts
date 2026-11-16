import type { CleanupProfile, CleanupReport } from "./types.js";

export const CLEANUP_PROFILES = ["hernan-planbook"] as const satisfies readonly CleanupProfile[];

const SENTENCE_DIRECTIVE = /(?<=[.!?])\s+(?=(?:students?|teacher|partners?|groups?|class|ask|record|require|review|discuss|continue|then|explain|display|emphasize|remind|invite|collect|use|have|accept|allow|avoid|keep|provide|circulate|do\s+not)\b)/iu;
const LIST_ITEM = /^\s*(?:[*•-]|\d+[.)]|[A-Da-d][.)])(?:\s+|$)/u;

// Export wrappers that some lesson generators add around the actual plan.
const PACKAGING_LINE = /^(?:word\s+worksheets?|(?:i|we)\s+(?:created|made|prepared)\s+(?:the\s+)?(?:student\s+)?(?:materials|worksheets?|handouts?)\b.*|download\s+(?:the\s+)?(?:student|teacher)\b.*|(?:download\s+)?(?:teacher\s+)?answer\s+key|teacher\s+key)$/i;
const PAGE_COUNT = /^\d+\s+(?:printable\s+)?pages?\.?$/i;
const PREAMBLE_METADATA = /^(?:class|course|textbook)\s*:\s*\S.*$/i;
const OPTIONAL_LABEL = /(?:^optional\b|\((?:optional)\)|\[(?:optional)\])/i;
const AUDIO_REFERENCE = /\b(?:audio\s+(?:track|file|clip|recording|cd)s?\b|(?:audio\s+)?track\s+\d+(?:[.:]\d+)*\b|cd\s*\d+\b|audio\s+\d+(?:\.\d+)*\b|(?:play|listen\s+to)\s+(?:the\s+)?audio\b|^audio\s*:)/i;
const AUDIO_PARENTHETICAL = /\s*\([^()]*\b(?:audio|track\s+\d|cd\s*\d)[^()]*\)/giu;
const ANSWER_SCAFFOLD = /(?:^|(?<=^\s*(?:[*•-]|\d+[.)])\s+)|(?<=[.!?)]\s))(?:(?:possible|sample|suggested|model|target)\s+(?:answers?|responses?)|answers?(?:\s+key)?|look\s+for)\s*:/i;

export type CleanupBoundary = (line: string) => boolean;

function plain(value: string): string {
  return value
    .replace(/^#{1,6}\s+/u, "")
    .replace(/\*\*/g, "")
    .replace(/ /g, " ")
    .trim();
}

function withoutListMarker(value: string): string {
  return plain(value).replace(LIST_ITEM, "").trim();
}

function isBlank(value: string): boolean {
  return !plain(value);
}

function isListItem(value: string): boolean {
  return LIST_ITEM.test(plain(value));
}

/**
 * Removes teacher-answer guidance that begins at a matching label while keeping
 * the prompt before it and any recognizable direction after it.
 */
export function removeLabeledGuidance(
  lines: string[],
  pattern: RegExp,
  onRemoved: (count: number) => void = () => undefined,
): string[] {
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const match = pattern.exec(rawLine);
    if (!match || match.index === undefined) {
      output.push(rawLine);
      continue;
    }

    const prefix = rawLine.slice(0, match.index).trimEnd();
    const guidance = rawLine.slice(match.index + match[0].length).trim();

    // A bare label introduces a list of answers; drop the label and its items.
    if (!withoutListMarker(prefix) && !guidance) {
      let removed = 1;
      let next = index + 1;
      while (next < lines.length && (isBlank(lines[next] ?? "") || isListItem(lines[next] ?? ""))) {
        if (isListItem(lines[next] ?? "")) removed += 1;
        next += 1;
      }
      while (next > index + 1 && isBlank(lines[next - 1] ?? "")) next -= 1;
      onRemoved(removed);
      index = next - 1;
      continue;
    }

    const directiveIndex = guidance.search(SENTENCE_DIRECTIVE);
    const remainingDirection = directiveIndex >= 0 ? guidance.slice(directiveIndex).trim() : "";
    onRemoved(1);

    if (withoutListMarker(prefix) && remainingDirection) output.push(`${prefix} ${remainingDirection}`);
    else if (withoutListMarker(prefix)) output.push(prefix);
    else if (remainingDirection) output.push(remainingDirection);
  }

  return output;
}

function removePackaging(lines: string[], report: CleanupReport): string[] {
  const output: string[] = [];
  let afterPackaging = false;

  for (const rawLine of lines) {
    const line = withoutListMarker(rawLine);
    if (!line) {
      output.push(rawLine);
      continue;
    }
    if (PACKAGING_LINE.test(line) || (afterPackaging && PAGE_COUNT.test(line))) {
      report.removed.packaging += 1;
      afterPackaging = true;
      continue;
    }
    afterPackaging = false;
    output.push(rawLine);
  }

  return output;
}

function removePreambleMetadata(lines: string[], report: CleanupReport, isBoundary: CleanupBoundary): string[] {
  const output: string[] = [];
  let inPreamble = true;

  for (const rawLine of lines) {
    const line = plain(rawLine);
    if (inPreamble && line && isBoundary(rawLine)) inPreamble = false;
    if (inPreamble && PREAMBLE_METADATA.test(line)) {
      report.removed.metadata += 1;
      continue;
    }
    output.push(rawLine);
  }

  return output;
}

function isSectionLabel(rawLine: string): boolean {
  const line = withoutListMarker(rawLine);
  if (/^#{1,6}\s+/u.test(rawLine.trim())) return true;
  if (/:\s*$/u.test(line)) return true;
  return !/[.!?:]/u.test(line) && line.split(/\s+/u).length <= 8;
}

function removeOptionalContent(lines: string[], report: CleanupReport, isBoundary: CleanupBoundary): string[] {
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = withoutListMarker(rawLine);
    if (!line || !OPTIONAL_LABEL.test(line)) {
      output.push(rawLine);
      continue;
    }

    report.removed.optional += 1;
    if (isListItem(rawLine) || !isSectionLabel(rawLine)) continue;

    // An optional section label owns its list items and its contiguous paragraph.
    let sawBlank = false;
    let next = index + 1;
    for (; next < lines.length; next += 1) {
      const candidate = lines[next] ?? "";
      if (isBlank(candidate)) {
        sawBlank = true;
        continue;
      }
      if (/^#{1,6}\s+/u.test(candidate.trim()) || isBoundary(candidate) || /^[\s\-_=—–]{3,}$/u.test(plain(candidate))) break;
      if (!isListItem(candidate) && sawBlank) break;
      report.removed.optional += 1;
    }
    while (next > index + 1 && isBlank(lines[next - 1] ?? "")) next -= 1;
    index = next - 1;
  }

  return output;
}

function removeAudioReferences(lines: string[], report: CleanupReport): string[] {
  const output: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine;
    line = line.replace(AUDIO_PARENTHETICAL, () => {
      report.removed.audio += 1;
      return "";
    });
    if (AUDIO_REFERENCE.test(withoutListMarker(line))) {
      report.removed.audio += 1;
      continue;
    }
    output.push(line);
  }

  return output;
}

/**
 * Applies a named, opt-in source cleanup profile before deterministic formatting.
 * Every rule removes explicitly labeled material; none rewrites or replaces content.
 */
export function applyCleanupProfile(
  lines: string[],
  profile: CleanupProfile,
  isBoundary: CleanupBoundary,
): { lines: string[]; report: CleanupReport } {
  if (!(CLEANUP_PROFILES as readonly string[]).includes(profile)) {
    throw new Error(`Unknown cleanup profile "${String(profile)}". Supported: ${CLEANUP_PROFILES.join(", ")}.`);
  }

  const report: CleanupReport = {
    profile,
    removed: { packaging: 0, metadata: 0, optional: 0, audio: 0, answerScaffolds: 0 },
    demotedCues: 0,
  };

  let cleaned = removePackaging(lines, report);
  cleaned = removePreambleMetadata(cleaned, report, isBoundary);
  cleaned = removeOptionalContent(cleaned, report, isBoundary);
  cleaned = removeAudioReferences(cleaned, report);
  cleaned = removeLabeledGuidance(cleaned, ANSWER_SCAFFOLD, (count) => {
    report.removed.answerScaffolds += count;
  });

  return { lines: cleaned, report };
}
