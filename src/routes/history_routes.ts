import prisma from "../libs/prisma.js";
import { Router } from "express";
import type { UserObject } from "../types/api.js";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

const router = Router();

interface AuthRequest extends Request {
  user: UserObject;
}

// HELPER: validate days to a number
function getDaysFromQuery(req: Request): number {
  const days = req.query.days;
  const num = typeof days === "string" ? Number(days) : NaN;
  if (!Number.isFinite(num) || num <= 0) {
    return 7;
  }
  return Math.min(num, 90);
}

// HELPER: get range from, to filter dates
function getRangeFromDays(days: number) {
  const now = new Date();

  const to = now;
  const from = new Date(now);

  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { to, from };
}
/**
 *
 * GET /API/HISTORY
 *
 * QUERY PARAMS:
 * - days?: number
 * - tagId : string
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const { user } = req as AuthRequest;

  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }

  try {
    const days = getDaysFromQuery(req);
    const { to, from } = getRangeFromDays(days);
    const tagId =
      typeof req.query.tagId === "string" ? req.query.tagId : undefined;

    const where: any = {
      user_id: user.id,
      status: "COMPLETED",
      start_at: {
        gte: from,
        lt: to,
      },
    };

    if (tagId) {
      where.tag_id = tagId;
    }

    const sessions = await prisma.session.findMany({
      where,
      include: {
        tag: true,
        breaks: true,
        distractions: true,
      },
      orderBy: {
        start_at: "desc",
      },
    });

    const tags = await prisma.tag.findMany({
      where: {
        user_id: user.id,
      },
    });

    const list = sessions.map((s) => {
      let focusMinutes = 0;

      if (s.start_at && s.end_at) {
        focusMinutes =
          (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60 -
          s.break_time;
        focusMinutes = Math.max(focusMinutes, 0);
      }

      return {
        id: s.id,
        name: s.name,
        start_at: s.start_at.toISOString(),
        end_at: s.end_at?.toISOString(),
        focus_minutes: focusMinutes,
        break_time: s.break_time,
        break_count: s.breaks.length,
        distraction_count: s.distractions.length,
        tag: s.tag
          ? {
              id: s.tag.id,
              name: s.tag.name,
              color: s.tag.color,
            }
          : null,
        distractions: s.distractions.map((d) => ({
          name: d.name,
        })),
        breaks: s.breaks
          .sort((a, b) => a.start_time.getTime() - b.start_time.getTime())
          .map((b) => ({
            id: b.id,
            start_time: b.start_time.toISOString(),
            end_time: b.end_time?.toISOString(),
          })),
      };
    });

    return res.status(200).json({
      status: "success",
      data: {
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
          days,
        },
        sessions: list,
        tags: tags
          .filter((t) => t.name)
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
          })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
