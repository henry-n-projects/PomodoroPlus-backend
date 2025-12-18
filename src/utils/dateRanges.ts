import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import { start } from "repl";
export function getUserDayRangeUTC(date: Date, timeZone: string) {
  // 1. convert "now" to user's timezone
  const nowLocal = toZonedTime(date, timeZone);

  // 2. Compute day end and start to user timezone
  const startLocal = startOfDay(nowLocal);
  const endLocal = endOfDay(nowLocal);

  // 3. Convert back local to UTC
  return {
    start: fromZonedTime(startOfDay(date), timeZone),
    end: fromZonedTime(endOfDay(date), timeZone),
  };
}
export function getUserWeekRangeUTC(date: Date, timezone: string) {
  // 1. convert now to local time
  const nowLocal = toZonedTime(date, timezone);

  //2. get local start and end of day
  const startLocal = startOfDay(nowLocal);
  const endLocal = endOfDay(nowLocal);

  // 3. Return time back to UTC
  return {
    start: fromZonedTime(startOfWeek(date, { weekStartsOn: 1 }), timezone),
    end: fromZonedTime(endOfWeek(date, { weekStartsOn: 1 }), timezone),
  };
}
