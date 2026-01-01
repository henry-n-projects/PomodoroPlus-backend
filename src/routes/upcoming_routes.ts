import prisma from "../libs/prisma.js";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { UserObject } from "../types/api.js";
import type { CreateUpcomingBody, UpdateUpcomingBody } from "../types/api.js";
import { AppError } from "../utils/AppError.js";
import { Prisma, SessionStatus } from "@prisma/client";

const router = Router();

// Extend request to expect a possible user object
interface AuthRequest extends Request {
  user?: UserObject;
}

// GET upcoming -> list of future sessions
router.get(
  "/upcoming",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from request
    const { user } = req as AuthRequest;

    // Validate if user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      //Get today's date
      const now = Date();

      //Fetch sessions with dates greater than today
      const sessions = await prisma.session.findMany({
        where: {
          user_id: user.id,
          start_at: {
            gte: now,
          },
          status: "SCHEDULED",
        },
        include: {
          tag: true,
        },
        orderBy: {
          start_at: "asc",
        },
      });

      if (!sessions) {
        return next(new AppError(404, "Cannot find sessions", true));
      }

      const result = sessions.map((s) => ({
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

      // Return the result to client
      return res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/past", async (req: Request, res: Response, next: NextFunction) => {
  // Extract user from request
  const { user } = req as AuthRequest;

  // Validate if user is logged in
  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }
  try {
    // Todays date
    const now = new Date();

    const sessions = await prisma.session.findMany({
      where: {
        user_id: user.id,
        status: "SCHEDULED",
        start_at: {
          lt: now,
        },
        end_at: null,
      },
      include: {
        tag: true,
      },
      orderBy: {
        start_at: "asc",
      },
    });
    if (!sessions) {
      return next(new AppError(404, "Cannot find sessions", true));
    }

    const result = sessions.map((s) => ({
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

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

//POST create a new upcoming session (status = SCHEDULED)
router.post(
  "/session/add",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from request
    const { user } = req as AuthRequest;

    //Validate that user is logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Type assertion for payload from client
      const body = req.body as CreateUpcomingBody;

      // Validate required fields exist
      if (!body.start_at) {
        return res.status(400).json({
          status: "error",
          message: "start_at is missing",
        });
      }
      const now = new Date();
      //Convert start_at and end_at to date type
      const startAt = new Date(body.start_at);
      const endAt = body.end_at ? new Date(now) : null;

      if (startAt < now) {
        return res.status(400).json({
          status: "error",
          message: "start_at must be a future date",
        });
      }

      // Validate date is in correct format
      if (isNaN(startAt.getTime()) || (endAt && isNaN(endAt.getTime()))) {
        return res.status(400).json({
          status: "error",
          message: "start_at and end_at is in invalid format",
        });
      }

      //Handle tag creation or selection
      let tagId = body.tag_id;

      // If user creates a new tag instead of choosing existing tag
      if (!tagId && body.new_tag_name && body.new_tag_color) {
        const newTag = await prisma.tag.create({
          data: {
            user_id: user.id,
            name: body.new_tag_name,
            color: body.new_tag_color,
            created_at: new Date(),
          },
        });

        tagId = newTag.id;
      }

      // If still no tagId → invalid
      if (!tagId) {
        return res.status(400).json({
          status: "error",
          message: "tag_id or new_tag_name/new_tag_color must be provided",
        });
      }

      // Update session in db
      const session = await prisma.session.create({
        data: {
          user_id: user.id,
          name: body.name ? body.name : null,
          start_at: startAt,
          end_at: endAt,
          break_time: 0,
          status: SessionStatus.SCHEDULED,
          tag_id: tagId,
        },
        include: {
          tag: true,
        },
      });

      return res.status(201).json({
        status: "success",
        data: {
          id: session.id,
          name: session.name,
          start_at: session.start_at.toISOString(),
          end_at: session.end_at ? session.end_at.toISOString() : null,
          status: session.status,
          break_time: session.break_time,
          tag: {
            id: session.tag.id,
            name: session.tag.name,
            color: session.tag.color,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

//PATCH edit scheduled sessions only
router.patch(
  "/update/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    //Extract user from request
    const { user } = req as AuthRequest;

    //Verify that user exists/ logged in
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Extract id from url params
      const { id } = req.params;

      // Verify that id was provided
      if (!id) {
        return next(new AppError(400, "Session id missing request", true));
      }

      // Fetch and verify session exists to edit
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      if (!session) {
        return next(new AppError(404, "Cannot find session", true));
      }

      // check is session status is scheduled
      if (session.status !== "SCHEDULED") {
        return next(
          new AppError(400, "Only scheduled sessions can be edited", true)
        );
      }

      // Define dynamic object for partial updates
      const data: Partial<{
        name: string | null;
        start_at: Date;
        tag_id: string;
      }> = {};

      // Extract the payload from client
      const body = req.body as UpdateUpcomingBody;

      // Check if name is provided and update
      if (body.name !== undefined) {
        data.name = body.name ?? null;
      }

      // Check if start at is provided and update
      if (body.start_at !== undefined) {
        const startAt = new Date(body.start_at);

        //Check date format
        if (isNaN(startAt.getTime())) {
          return res.status(400).json({
            status: "error",
            message: "Invalid date format for start_at",
          });
        }
        // Must be in the future
        const now = new Date();
        if (startAt.getTime() <= now.getTime()) {
          return res.status(400).json({
            status: "error",
            message: "start_at must be a future date",
          });
        }
        data.start_at = startAt;
      }

      // End at is not to be edited and should be default to null
      if (body.end_at !== undefined) {
        return res.status(400).json({
          status: "error",
          message: "end_time cannot be edited for upcoming sessions",
        });
      }

      // --- Update tag ---
      if (body.tag_id !== undefined) {
        // Validate tag belongs to user
        const tag = await prisma.tag.findFirst({
          where: {
            id: body.tag_id,
            user_id: user.id,
          },
        });

        if (!tag) {
          return res.status(400).json({
            status: "error",
            message: "Invalid tag_id for this user",
          });
        }

        data.tag_id = body.tag_id;
      }

      const updated = await prisma.session.update({
        where: {
          id: id,
          user_id: user.id,
        },
        data: data,
        include: {
          tag: true,
        },
      });

      //Return response
      return res.status(200).json({
        status: "success",
        data: {
          session: {
            id: updated.id,
            name: updated.name,
            start_at: updated.start_at.toISOString(),
            end_at: updated.end_at ? updated.end_at.toISOString() : null,
            status: updated.status,
            break_time: updated.break_time,
            tag: {
              id: updated.tag.id,
              name: updated.tag.name,
              color: updated.tag.color,
            },
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/delete/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user from req
    const { user } = req as AuthRequest;

    // Validate that user is logged in / exists
    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      // Extract id from route params
      const { id } = req.params;

      // Validate session id exists
      if (!id) {
        return next(
          new AppError(404, "Session id not found in url param", true)
        );
      }

      // Find session from db
      const session = await prisma.session.findFirst({
        where: {
          id: id,
          user_id: user.id,
        },
      });

      // Validate session exists
      if (!session) {
        return next(new AppError(404, "Session id not found", true));
      }

      // Validate that session is scheduled
      if (session.status !== "SCHEDULED") {
        return next(
          new AppError(400, " Only scheduled sessions can be deleted", true)
        );
      }

      // Delete session from db
      const deletedSession = prisma.session.delete({
        where: {
          id: session.id,
        },
      });

      // return response
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.get("/tags", async (req: Request, res: Response, next: NextFunction) => {
  // Extract user from  req
  const { user } = req as AuthRequest;

  // Validate user is logged in
  if (!user) {
    return next(new AppError(401, "Not authenticated", true));
  }

  try {
    const tags = await prisma.tag.findMany({
      where: {
        user_id: user.id,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    return res.status(200).json({
      status: "success",
      data: {
        tags: tags.map((t) => ({
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

router.post(
  "/add/tags",
  async (req: Request, res: Response, next: NextFunction) => {
    const { user } = req as AuthRequest;

    if (!user) {
      return next(new AppError(401, "Not authenticated", true));
    }

    try {
      const { name, color } = req.body as {
        name?: string;
        color?: string;
      };

      // Basic validation
      if (!name || !name.trim()) {
        return next(new AppError(400, "Tag name is required", true));
      }

      if (!color) {
        return next(new AppError(400, "Tag color is required", true));
      }

      const trimmedName = name.trim();
      const now = new Date();
      const tag = await prisma.tag.create({
        data: {
          user_id: user.id,
          name: trimmedName,
          color,
          created_at: now,
        },
      });

      return res.status(201).json({
        status: "success",
        data: {
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
          },
        },
      });
    } catch (err) {
      // Handle unique constraint violation (duplicate tag name)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return next(
          new AppError(409, "Tag with this name already exists", true)
        );
      }

      next(err);
    }
  }
);

export default router;
