import { expect, test } from "vitest";
import { slackDays, riskScore } from "./derived";

const DAY = 24 * 60 * 60 * 1000;

test("slackDays is positive when committed before needed", () => {
  expect(slackDays(10 * DAY, 7 * DAY)).toBe(3);
});

test("slackDays is negative when committed after needed", () => {
  expect(slackDays(7 * DAY, 10 * DAY)).toBe(-3);
});

test("slackDays is null when committedDate is undefined", () => {
  expect(slackDays(10 * DAY, undefined)).toBeNull();
});

test("riskScore multiplies probability by impact", () => {
  expect(riskScore(4, 5)).toBe(20);
});
