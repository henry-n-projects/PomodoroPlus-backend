import { Router } from "express";
import prisma from "../libs/prisma.js";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import type { UserObject } from "../types/api.js";
import {
  getUserDayRangeUTC,
  getUserWeekRangeUTC,
} from "../utils/dateRanges.js";
const router = Router();

// Extend request to expect a user object and its properties
interface AuthRequest extends Request {
  user?: UserObject;
}

/**
 * GET 'API/DASHBOARD/'
 *
 * Show user info, weekly progress, daily sessions, weekly activity
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthRequest).user;
  // 0. Authenticate user
  if (!user) {
    return next(new AppError(401, "not authenticated", true));
  }

  try {
    const timezone = user.timezone ?? "UTC";
    const now = new Date();
    const { start: dayStart, end: dayEnd } = getUserDayRangeUTC(now, timezone);
    const { start: weekStart, end: weekEnd } = getUserWeekRangeUTC(
      now,
      timezone
    );
    // 1. Find todays sessions
    const getDaySessions = prisma.session.findMany({
      where: {
        user_id: user.id,
        start_at: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      include: {
        tag: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // 2. Find this week sessions
    const getWeekSessions = prisma.session.findMany({
      where: {
        user_id: user.id,
        start_at: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      include: {
        tag: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // 3. Fetch sessions
    const [daySessions, weekSessions] = await Promise.all([
      getDaySessions,
      getWeekSessions,
    ]);

    // 4. Calculate weekly progress
    const scheduledCount = weekSessions.length;
    const completedCount = weekSessions.filter(
      (s) => s.status === "COMPLETED"
    ).length;

    // 5. Calculate weekly actvity
    // Map session dates to total minutes for that date e.g <2025-12-12 : 40>
    const byDate = new Map<string, number>();
    // Loop over sessions
    for (const s of weekSessions) {
      // Skip not finished or completed
      if (s.status !== "COMPLETED" || !s.end_at) continue;

      // Convert sessions to date yyyymmdd
      const dateKey = s.start_at.toISOString().slice(0, 10);

      // Calculate duration to min
      const durationMinutes =
        (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60;

      // Subtract break time, dont allow value to go below 0 (negative minutes)
      const netMinutes = Math.max(durationMinutes - s.break_time, 0);

      // Check if we have the date key exists already if not 0 is the value as it doesnt exist yet
      const prev = byDate.get(dateKey) ?? 0;

      // Add minutes to date key
      byDate.set(dateKey, prev + netMinutes);
    }
    // Convert map into array of [date, focus_minutes]
    const entries = Array.from(byDate.entries());

    // Finally convert array elements into objects {date, focusminutes}
    const weeklyActivities = entries.map(([date, focusMinutes]) => {
      return {
        date: date,
        focus_minutes: focusMinutes,
      };
    });

    // 6. Convert todays sessions into array of objects
    const today = daySessions.map((s) => ({
      id: s.id,
      name: s.name,
      start_at: s.start_at.toISOString(),
      end_at: s.end_at ? s.end_at.toISOString() : null,
      status: s.status,
      break_time: s.break_time,
      tag: {
        id: s.tag.id,
        name: s.tag.name,
        color: s.tag.color,
      },
    }));

    // 7. Build response
    return res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user.id,
          name: user.name,
          avatar_url: user.avatar_url,
          timezone: user.timezone,
          settings: user.settings,
        },
        week_progress: {
          scheduled_count: scheduledCount,
          completed_count: completedCount,
        },
        weekly_activities: weeklyActivities,
        today: {
          date: dayStart.toISOString(),
          sessions: today,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
