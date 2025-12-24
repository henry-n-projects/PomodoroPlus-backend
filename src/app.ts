import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cookieParser from "cookie-parser";
import passport from "passport";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { configureSession } from "./config/session.js";
import { configurePassport } from "./config/passport.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import cors from "cors";

const PgSession = connectPgSimple(session);

//0. Create express app instance
const app = express();

// 1. Cors to allow frontend to talk to backend
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

//2. Middleware to parse JSON bodies
app.use(express.json());

//3. Middleware to parse cookies
app.use(cookieParser());

//4. Session middleware -> initialises a session and set cookie header with SID
app.use(configureSession());

//5. Initialize passport
configurePassport();

//6. passport middleware -> attach helper functions to req
app.use(passport.initialize());

//7. passport middleware session -> on every req calls deserializeUser
app.use(passport.session());

//8. Basic route to root for testing
app.get("/", (req: express.Request, res: express.Response) => {
  res.send("Express app is running");
});

//9. mount all routes
app.use("/api", routes);

//10. Error handling middleware
app.use(errorHandler);

//11. unmatched routes
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

export default app;
