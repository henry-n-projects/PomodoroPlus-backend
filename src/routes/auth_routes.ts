import { Router } from "express";
import passport from "passport";
import type { UserObject } from "../types/api.js";
const router = Router();

// Google login -> displays google login and request profile+email
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google callback -> Add or create user if successful + sets session and cookie info, redirect if not
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    successRedirect: `${process.env.FRONTEND_URL}/api/dashboard`, // change
  })
);

// Google logout -> removes user from session, remove cookie
router.post("/logout", (req, res, next) => {
  req.logOut((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Get current User
router.get("/me", (req, res) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ status: "error", message: "Not authenticated" });
  }
  const user = req.user as UserObject;

  res.json(user);
});

export default router;
