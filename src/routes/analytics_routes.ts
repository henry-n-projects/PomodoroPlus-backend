import prisma from "../libs/prisma.js";
import Router from "express";
import type { NextFunction, Request, Response } from "express";
import type { UserObject } from "../types/api.js";
import { AppError } from "../utils/AppError.js";
// Prisma client instance + shared router instance
const router = Router();

/**
 * GET /api/analytics
 * query params:
 *  - days?: number e.g 7 or 14
 */

// Extend request to expect user in request
interface AuthRequest extends Request {
  user?: UserObject;
}

// Helper: parse days from query max 90
function getDaysFromQuery(req: Request): number {
  // read the query value
  const query = req.query.days;

  // convert query value to number if its a string
  const num = typeof query === "string" ? Number(query) : NaN;

  // if num is invalid (NaN, infinity) < 0 than return default (7)
  if (!Number.isFinite(num) || num <= 0) return 7;

  return Math.min(num, 90);
}

// Helper: get from and to range
function getRangeFromDays(days: number) {
  const now = new Date();
  const to = now; // Todays date
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1)); // from Date
  from.setHours(0, 0, 0, 0);
  return { from, to }; //return to and from dates
}

// Helper: normailise Date to yyyy-mm-dd
function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  // extract user from req
  const { user } = req as AuthRequest;

  // validate user exists /logged in
  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }

  try {
    // extract days from query and from to range
    const days = getDaysFromQuery(req);
    const dayRange = getRangeFromDays(days);

    // get all sessions in range
    const sessions = await prisma.session.findMany({
      where: {
        user_id: user.id,
        start_at: {
          gte: dayRange.from,
          lt: dayRange.to,
        },
      },
      include: {
        tag: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // Split by status
    const completedSessions = sessions.filter(
      (s) => s.status === "COMPLETED" && s.end_at // returns array with only completed sesisons with a endat
    );
    const scheduledSessions = sessions.filter((s) => s.status === "SCHEDULED"); // array with scheduled sessions

    // ----- COMPLETED AND SCHEDULED COUNT
    const completedCount = completedSessions.length;
    const scheduledCount = scheduledSessions.length;

    // ----- COMPLETION RATE
    const total = completedCount + scheduledCount;

    const completionRate = total === 0 ? 0 : completedCount / total;

    // ---- STREAK
    // build set of unique dates where user has completed a session
    // loop through completed sessions
    // converts session date into a day string "yyyy-mm-dd"
    // Add day to set

    const completedDays = new Set<string>();

    for (const s of completedSessions) {
      const key = toDateKey(s.start_at);
      completedDays.add(key);
    }

    // Define yesterday and earliest date in range
    const endDay = new Date(dayRange.to);
    endDay.setHours(0, 0, 0, 0);
    endDay.setDate(endDay.getDate() - 1); // yesterday
    const fromDay = new Date(dayRange.from); // earliest date
    fromDay.setHours(0, 0, 0, 0);

    // Loop backwards day by day to count streak
    let d = new Date(endDay); // today
    let streak = 0;
    // loop from today and from day
    while (d >= fromDay) {
      const key = toDateKey(d);

      // Break loop if next day is not in completeddays set
      // must be back to back to count as streak
      if (!completedDays.has(key)) {
        break;
      }

      // increment streak
      streak++;
      // Move backwards from current loop date
      d.setDate(d.getDate() - 1);
    }

    // ----- TIME PER TAG
    // Define what we store in the map for each tag
    type TagAgg = {
      name: string;
      color: string;
      minutes: number;
    };

    // Map to accumate minutes per tag
    // key: tag_id, value: TagAgg
    const byTag = new Map<string, TagAgg>();

    // loop through completed sessions
    for (const s of completedSessions) {
      // skip any invalid data if any
      if (!s.end_at) continue;

      // calculate session duration in minutes
      const durationMinutes =
        (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60;
      const netMinutes = Math.max(durationMinutes - s.break_time, 0);

      //use tag as grouping key
      const key = s.tag_id;
      // get existing aggregator or create new if not exist
      const prev = byTag.get(key) ?? {
        name: s.tag.name,
        color: s.tag.color,
        minutes: 0,
      };
      // increment minutes of session minutes
      prev.minutes += netMinutes;
      //save and upate map with aggregator
      byTag.set(key, prev);
    }
    // ----- NetfocusMins and Break Mins
    const netFocusMinutes = completedSessions.reduce(
      (sum, s) => {
        if (!s.end_at) return sum;

        const durationMinutes =
          (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60 -
          s.break_time;
        return sum + durationMinutes;
      },

      0
    );

    const netBreakMinutes = completedSessions.reduce((sum, s) => {
      return sum + s.break_time;
    }, 0);

    const totalFocusMinutes = netFocusMinutes || 1; // avoid divide by 0

    // convert map to array for json output
    const timePerTag = Array.from(byTag.entries()).map(([tagId, agg]) => ({
      tag: {
        id: tagId,
        name: agg.name,
        color: agg.color,
      },
      focus_minutes: agg.minutes,
      percentage: agg.minutes / totalFocusMinutes,
    }));

    //---- Planning realism
    type DayRealism = {
      scheduled: number;
      completed: number;
    };

    const planningByDay = new Map<string, DayRealism>();

    for (const s of sessions) {
      const day = toDateKey(s.start_at);

      // if key does not exist yet create new
      const prev = planningByDay.get(day) ?? {
        scheduled: 0,
        completed: 0,
      };

      // Increment schduled and update to map
      prev.scheduled += 1;
      planningByDay.set(day, prev);
    }

    for (const s of completedSessions) {
      const day = toDateKey(s.start_at);

      const prev = planningByDay.get(day) ?? {
        scheduled: 0,
        completed: 0,
      };

      prev.completed += 1;
      planningByDay.set(day, prev);
    }

    const planningRealismByDay: {
      day: string;
      scheduled: number;
      completed: number;
    }[] = [];

    for (
      let d = new Date(dayRange.from);
      d <= dayRange.to;
      d.setDate(d.getDate() + 1)
    ) {
      const key = toDateKey(d);

      const entry = planningByDay.get(key) ?? {
        scheduled: 0,
        completed: 0,
      };

      planningRealismByDay.push({
        day: key,
        scheduled: entry.scheduled,
        completed: entry.completed,
      });
    }

    //---- Focus Trend
    const focusByDay = new Map<string, number>();

    for (const s of completedSessions) {
      if (!s.end_at) continue;

      const day = toDateKey(s.start_at);
      const duration =
        (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60 - s.break_time;

      focusByDay.set(day, (focusByDay.get(day) ?? 0) + Math.max(duration, 0));
    }

    const focusTrend: { date: string; focus_minutes: number }[] = [];
    for (
      let d = new Date(dayRange.from);
      d <= dayRange.to;
      d.setDate(d.getDate() + 1)
    ) {
      const key = toDateKey(d);
      focusTrend.push({
        date: key,
        focus_minutes: focusByDay.get(key) ?? 0,
      });
    }

    return res.status(200).json({
      status: "success",
      data: {
        summary: {
          streak,
          completed_sessions: completedCount,
          scheduled_sessions: scheduledCount,
          completed_rate: completionRate,
          total_minutes: netFocusMinutes,
        },
        time_per_tag: timePerTag,
        planning_realism: planningRealismByDay,
        focus_efficiency: {
          focus_minutes: netFocusMinutes,
          break_minutes: netBreakMinutes,
          efficiency_rate:
            netFocusMinutes / (netFocusMinutes + netBreakMinutes),
        },
        focus_trend: focusTrend,
        range: {
          from: dayRange.from.toISOString(),
          to: dayRange.to.toISOString(),
          days,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
