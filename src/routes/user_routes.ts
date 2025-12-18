import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import prisma from "../libs/prisma.js";
import type { UserObject } from "../types/api.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

interface AuthRequest extends Request {
  user?: UserObject;
}
router.post(
  "/timezone",
  async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) return next(new AppError(401, "Not authenticated", true));

    const { timezone } = req.body;

    await prisma.user.update({
      where: { id: user.id },
      data: { timezone },
    });

    res.json({ status: "success" });
  }
);

export default router;
