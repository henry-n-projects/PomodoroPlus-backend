import { Router, type Request, type Response } from "express";
import authRoutes from "./auth_routes.js";
import recordRoutes from "./record_routes.js";
import dashboardRoutes from "./dashboard_routes.js";
import sessionsRouter from "./sessions_routes.js";
import analyticsRouter from "./analytics_routes.js";
import historyRouter from "./history_routes.js";
import userRouter from "./user_routes.js";
const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/record", recordRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/sessions", sessionsRouter);
router.use("/analytics", analyticsRouter);
router.use("/history", historyRouter);
router.use("/user", userRouter);
export default router;
