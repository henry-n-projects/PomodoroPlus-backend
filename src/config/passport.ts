import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Prisma } from "@prisma/client";
import prisma from "../libs/prisma.js";

export const configurePassport = () => {
  // Serialize user ID for the session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);

    // When user logs in passport saves only user ID to session table
    // Sends the cookie to the browser with session ID
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      done(null, user);
    } catch (error) {
      done(error);
    }

    // On new requests the cookie is sent from client with session ID
    // We receive and look up the sessionID that matches and rebuild user
  });

  // Setup google oAuth strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Find or create user
          let user = await prisma.user.findUnique({
            where: { auth_user_id: profile.id },
          });

          if (!user) {
            // Create new user if not found
            user = await prisma.user.create({
              data: {
                auth_user_id: profile.id,
                name: profile.displayName,
                avatar_url: profile.photos?.[0]?.value ?? null,
                timezone: "UTC",
                settings: {} as Prisma.JsonObject,
              },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )

    // Passport handles log in using google sign in
    // When user signs in callback method recieves the user profile adds or loads user
  );
};
