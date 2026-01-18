import session from "express-session";
import connectPgSimple from "connect-pg-simple";

export const configureSession = () => {
  //1. Configure sessions to be stored in Postgres
  const PgSession = connectPgSimple(session);

  //2. Validate environemtn variables
  if (!process.env.SESSION_SECRET) {
    throw new Error("Session secret is required!");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Database URL is required!");
  }

  //3. Return session configuration -> creates a session store connected to DB
  return session({
    proxy: true,
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
      // Clean up expired sessions
      pruneSessionInterval: 60 * 15, // 15 minutes
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // Prevents client-side access to the cookie
      secure: process.env.NODE_ENV === "production", // Requires HTTPS in production
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000 * 5, // 5 days
    },
  });
};
