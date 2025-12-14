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
 *
 * Returns:
 * - streak : number
 * - completion_rate : number (0-1)
 * - completed_count : number
 * - scheduled_count : number
 * - time_per)tag: Array<{tag: {id, name, color}, focus_minutes}>
 * - sessions: list of completed sessions in range
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
  return d.toISOString().slice(0, 10);
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
        end_at: {
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

    // Define today and earliest date in range
    const endDay = new Date(dayRange.to); // today
    endDay.setHours(0, 0, 0, 0);
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

    // convert map to array for json output
    const timePerTag = Array.from(byTag.entries()).map(([tagId, agg]) => ({
      tag: {
        id: tagId,
        name: agg.name,
        color: agg.color,
      },
      focus_minutes: agg.minutes,
    }));

    // ----- LIST OF COMPLETED SESSIONS FOR TIMEFRAME
    // create an array of object with session stats
    const sessionList = completedSessions.map((s) => {
      // calculate session duration
      const durationMinutes =
        s.end_at && s.start_at
          ? (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60
          : 0;
      const netMinutes = Math.max(durationMinutes - s.break_time, 0);

      return {
        id: s.id,
        name: s.name,
        start_at: s.start_at.toISOString(),
        end_at: s.end_at ? s.end_at.toISOString() : null,
        status: s.status,
        net_minutes: netMinutes,
        break_minutes: s.break_time,
        tag: {
          id: s.tag.id,
          name: s.tag.name,
          color: s.tag.color,
        },
      };
    });

    return res.status(200).json({
      status: "success",
      data: {
        range: {
          from: dayRange.from.toISOString(),
          to: dayRange.to.toISOString(),
          days,
        },
        streak,
        completion_rate: completionRate,
        completed_count: completedCount,
        scheduled_count: scheduledCount,
        time_per_tag: timePerTag,
        sessions: sessionList,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
