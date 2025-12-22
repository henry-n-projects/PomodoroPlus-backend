import prisma from "../libs/prisma.js";
import {
  Router,
  type NextFunction,
  type Response,
  type Request,
} from "express";
import { AppError } from "../utils/AppError.js";
import type { UserObject } from "../types/api.js";
import { SessionStatus } from "@prisma/client";

const router = Router();

interface AuthRequest extends Request {
  user?: UserObject;
}
/**
 * GET API/SESSION/SCEDULED
 *
 * getscheduled sessions to start from
 */
router.get(
  "/scheduled",
  async (req: Request, res: Response, next: NextFunction) => {
    // Store the user from the client response
    const { user } = req as AuthRequest;

    // 1. Validate the user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    //2. Try fetch scheduled schedules
    try {
      const now = new Date();

      //Query db for sessions status 'scheduled'
      const sessions = await prisma.session.findMany({
        where: {
          user_id: user.id,
          status: SessionStatus.SCHEDULED,
          start_at: {
            gte: now,
          },
        },
        include: {
          tag: true,
        },
        orderBy: {
          start_at: "asc",
        },
      });

      // Create an array of session obejcts from fetch result
      const result = sessions.map((s) => ({
        id: s.id,
        name: s.name,
        start_at: s.start_at,
        end_at: s.end_at,
        status: s.status,
        break_time: s.break_time,
        tag: {
          id: s.tag.id,
          name: s.tag.name,
          color: s.tag.color,
        },
      }));

      // Send response to client
      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST API/SESSION/:ID/START
 *
 * start session: scheduled -> in progress, set start time
 * */
router.post(
  "/:id/start",
  async (req: Request, res: Response, next: NextFunction) => {
    // Store user from client response
    const { user } = req as AuthRequest;

    // 1. Validate user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // 2. Extract session id from url
      const id = req.params.id;

      if (!id) {
        return next(new AppError(400, "Session id missing", true));
      }

      const now = new Date();

      // 3. Fetch scheduled session and validate session belongs to user
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      if (!session) {
        return next(new AppError(404, "Session not found", true));
      }

      // 4. Validate that session is scheduled
      if (session.status !== "SCHEDULED") {
        next(new AppError(400, "Only scheduled sessions can be started", true));
      }

      // 5. Update session: status=scheduled -> start time=now
      const updated = await prisma.session.update({
        where: { id: session.id },
        data: {
          status: "IN_PROGRESS",
          start_at: now, // actual start time
          end_at: null, // clear any previous end time, just in case
          break_time: 0, // reset break time if needed
        },
      });

      // 6. Return response to client
      return res.status(200).json({
        status: "success",
        data: {
          id: updated.id,
          status: updated.status,
          start_at: updated.start_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST 'API/:ID/STOP'
 *
 * stop session / record session into db
 */
router.post(
  "/:id/stop",
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Extract user from req
    const { user } = req as AuthRequest;

    // 2. Validate the user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // 3. Extract url param
      const { id } = req.params;

      const now = new Date();

      if (!id) {
        return next(new AppError(400, "Session id missing", true));
      }

      // 4. Validate session belongs to user
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      // 5. Validate session is in progress
      if (session?.status !== "IN_PROGRESS") {
        return next(
          new AppError(400, "Only sessions in progress can be stopped", true)
        );
      }

      // 6. Update session to be completed
      const updated = await prisma.session.update({
        where: {
          id: session.id,
        },
        data: {
          status: "COMPLETED",
          end_at: now,
        },
      });

      // 7. Return response to client
      return res.status(200).json({
        status: "success",
        data: {
          session: {
            id: updated.id,
            status: updated.status,
            start_at: updated.start_at.toISOString(),
            end_at: updated.end_at?.toISOString() ?? null,
            break_time: updated.break_time,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 *
 * POST API/SESSION/:ID/BREAKS/START
 *
 * start break, fetch break and record start time, add to session
 */
router.post(
  "/:id/breaks/start",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from req
    const { user } = req as AuthRequest;

    // Validate user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Extract the url params
      const { id } = req.params;

      if (!id) {
        return next(new AppError(400, "Session id missing", true));
      }
      const now = new Date();
      const { type } = req.body as { type?: string };

      // Fetch session
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      // Validate it exists and is scheduled
      if (!session) {
        return next(new AppError(404, "Session not found", true));
      }

      if (session.status !== "IN_PROGRESS") {
        return next(
          new AppError(400, "Can only start break on active sessions", true)
        );
      }

      // Fetch break
      const activeBreak = await prisma.break.findFirst({
        where: {
          session_id: session.id,
          end_time: null,
        },
      });
      // Validate no active break
      if (!activeBreak) {
        return next(
          new AppError(400, "An active break is already in progress", true)
        );
      }

      // Check for valid type in req
      const breakType =
        type && ["SHORT", "LONG", "CUSTOM"].includes(type) ? type : "CUSTOM";

      // Create break entry
      const newBreak = await prisma.break.create({
        data: {
          session_id: session.id,
          type: breakType,
          start_time: now,
          end_time: null,
        },
      });

      // Return response to client
      return res.status(201).json({
        status: "success",
        data: {
          break: {
            id: newBreak.id,
            type: newBreak.type,
            start_time: newBreak.start_time.toISOString(),
            end_time: newBreak.end_time,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 *
 * POST /API/SESSION/:ID/BREAKS/:BREAKID/END
 *
 * update break_end time for a session
 */
router.post(
  "/:id/breaks/:breakId/end",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from req
    const { user } = req as AuthRequest;

    // Validate that user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Extract session id from url params
      const { id, breakId } = req.params;
      if (!id) {
        return next(new AppError(400, "Session id missing", true));
      }

      if (!breakId) {
        return next(new AppError(400, "Break id missing", true));
      }

      const { type } = req.body as { type?: string }; // e.g. "SHORT" | "LONG" | "CUSTOM"

      const now = new Date();

      // Fetch session from db validate session exists
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      if (!session) {
        return next(new AppError(404, "Cannot find session.", true));
      }

      //Fetch break and validate if it exists
      const brk = await prisma.break.findFirst({
        where: {
          id: breakId,
          session_id: id,
        },
      });

      if (!brk) {
        return next(new AppError(404, "Cannot find break.", true));
      }

      // Validate break has not ended
      if (brk.end_time) {
        return next(new AppError(400, "This break has already ended.", true));
      }

      // Update break time
      const updatedBreak = await prisma.break.update({
        where: { id: brk.id },
        data: {
          end_time: now,
        },
      });

      // Calculate total break time in minutes
      const diffMs =
        (updatedBreak.end_time?.getTime() ?? 0) -
        updatedBreak.start_time.getTime();
      // Convert to minutes
      const diffMin = Math.max(Math.round(diffMs / 1000 / 60), 0);

      // Add to session's total break_time (ensure non-null)
      const newBreakTime = (session.break_time ?? 0) + diffMin;

      await prisma.session.update({
        where: { id: session.id },
        data: { break_time: newBreakTime },
      });

      return res.status(200).json({
        status: "success",
        data: {
          break: {
            id: updatedBreak.id,
            start_time: updatedBreak.start_time.toISOString(),
            end_time: updatedBreak.end_time?.toISOString() ?? null,
            duration_minutes: diffMin,
          },
          session: {
            id: session.id,
            break_time: newBreakTime,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET API/SESSION/:ID
 *
 * get session activty such as breaks focus time
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  // Extract user from request
  const { user } = req as AuthRequest;

  // Validate that user is logged in
  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }
  try {
    // Extract id from url params
    const { id } = req.params;

    //Validate that session id exists
    if (!id) {
      return next(new AppError(400, "Missing session id", true));
    }

    // Fetch session, tag, breaks
    const session = await prisma.session.findFirst({
      where: {
        id: id,
        user_id: user.id,
      },
      include: {
        tag: true,
        breaks: true,
      },
    });

    // Validate that session exists
    if (!session) {
      return next(new AppError(404, "Cannot find session", true));
    }

    const now = new Date();
    const effectiveEnd = session.end_at ?? now;

    // Total break time: start from 0 loop and add break min
    const totalBreakMinutes = session.breaks.reduce((sum, brk) => {
      // Skip unfinished breaks
      if (!brk.end_time) return sum;
      // Calculate each break to ms
      const diffMs = brk.end_time.getTime() - brk.start_time.getTime();
      // Convert ms to minutes, ensure no negative and add to sum
      return sum + Math.max(Math.round(diffMs / 1000 / 60), 0);
    }, 0);

    // Calculate total session duration in min
    const totalMinutes =
      (effectiveEnd.getTime() - session.start_at.getTime()) / 1000 / 60;

    // Calculate total minutes on task in min
    const focusMinutes = Math.max(
      Math.round(totalMinutes - totalBreakMinutes),
      0
    );

    // Return response to client
    return res.status(200).json({
      status: "success",
      data: {
        session: {
          id: session.id,
          name: session.name,
          status: session.status,
          start_at: session.start_at.toISOString(),
          end_at: session.end_at ? session.end_at.toISOString() : null,
          break_time: session.break_time,
          tag: {
            id: session.tag.id,
            name: session.tag.name,
            color: session.tag.color,
          },
        },
        activity: {
          total_minutes: Math.max(Math.round(totalMinutes), 0),
          focus_minutes: focusMinutes,
          break_minutes: totalBreakMinutes,
          breaks: session.breaks
            .sort((a, b) => a.start_time.getTime() - b.start_time.getTime())
            .map((b) => ({
              id: b.id,
              type: b.type,
              start_time: b.start_time.toISOString(),
              end_time: b.end_time ? b.end_time.toISOString() : null,
            })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
export default router;
