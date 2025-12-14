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
  // Extract user from req
  const { user } = req as AuthRequest;

  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }

  try {
    //extract query params
    const days = getDaysFromQuery(req);
    const { to, from } = getRangeFromDays(days);
    const tagId =
      typeof req.query.tagId === "string" ? req.query.tagId : undefined;

    // build db query that contains non optional values
    const where: any = {
      user_id: user.id,
      status: "COMPLETED",
      start_at: {
        gte: from,
        lt: to,
      },
    };

    // If tagId is provided add to where db query
    if (!tagId) {
      where.tagId = tagId;
    }

    // Retrieve filtered session
    const session = await prisma.session.findMany({
      where,
      include: {
        tag: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });

    // Map session into array of objects for list
    const totalMinutes = 0;
    const list = await session.map((s) => {
      if (s.start_at && s.end_at) {
        const totalMinutes =
          (s.end_at.getTime() - s.start_at.getTime()) / 1000 / 60;
      }
      return {
        id: s.id,
        name: s.name,
        start_at: s.start_at,
        end_at: s.end_at,
        total_minutes: totalMinutes,
        break_time: s.break_time,
        tag: {
          id: s.tag.id,
          name: s.tag.name,
          color: s.tag.color,
        },
      };
    });

    // return response to client
    return res.status(200).json({
      status: "success",
      data: {
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
          days,
        },
        sessions: list,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET/ /API/HISTORY/:id
 *
 * detailed info for a single session
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  const { user } = req as AuthRequest;

  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }

  try {
    // Extract id from url params
    const { id } = req.params;

    // Validate id is provided
    if (!id) {
      return next(new AppError(400, "Session id not provided", true));
    }

    // Fetch session from db
    const session = await prisma.session.findFirst({
      where: {
        id: id,
      },
      include: {
        tag: true,
        breaks: true,
      },
    });

    //validate session exists
    if (!session) {
      return next(new AppError(404, "Session not found", true));
    }

    // calculate total time,
    if (!session.end_at) {
      return next(
        new AppError(
          400,
          "Only sessions that are finished can have details viewed",
          true
        )
      );
    }
    const totalSessionMinutes =
      session.end_at.getTime() - session.start_at.getTime() / 1000 / 60;

    // Calculate total breaks
    const totalBreakMinutes = session.breaks.reduce((sum, b) => {
      if (!b.end_time) return sum;

      // calculate break time in min
      const diffMin =
        (b.end_time.getTime() - b.start_time.getTime()) / 1000 / 60;

      // Add diff min to sum total, ensure lowest value to add is 0
      return sum + Math.max(diffMin, 0);
    }, 0);
    const breakMinutes = totalBreakMinutes || session.break_time;
    const focusMinutes = Math.max(totalSessionMinutes - breakMinutes, 0);
    const breaks = session.breaks
      .sort((a, b) => a.start_time.getTime() - b.start_time.getTime())
      .map((b) => {
        ({
          id: b.id,
          type: b.type,
          start_time: b.start_time.toISOString(),
          end_time: b.end_time?.toISOString(),
        });
      });

    return res.status(200).json({
      status: "success",
      data: {
        session: {
          id: session.id,
          name: session.name,
          status: session.status,
          start_at: session.start_at.toISOString(),
          end_at: session.end_at.toISOString(),
          tag: {
            id: session.tag.id,
            name: session.tag.name,
            color: session.tag.color,
          },
        },
        metrics: {
          total_minutes: totalSessionMinutes,
          focus_minutes: focusMinutes,
          break_minutes: breakMinutes,
          break_count: session.breaks.length,
        },
        breaks,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from request
    const { user } = req as AuthRequest;

    // Validate user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Extract id from url params
      const { id } = req.params;

      // Ensure id exists
      if (!id) {
        return next(new AppError(400, "Session Id not provided", true));
      }

      // Retrieve session from db
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
        include: {
          breaks: true,
          distractions: true,
        },
      });

      // Validate session exists
      if (!session) {
        return next(new AppError(404, "Session not found", true));
      }

      // Vadiate session is completed
      if (session.status !== "COMPLETED") {
        return next(
          new AppError(
            400,
            "Only completed sessions can be deleted from history",
            true
          )
        );
      }

      // Delete foreign keys so delete doesnt fail
      await prisma.break.deleteMany({
        where: {
          session_id: id,
        },
      });

      await prisma.distraction.deleteMany({
        where: {
          session_id: id,
        },
      });

      await prisma.session.delete({
        where: {
          id: id,
        },
      });

      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
