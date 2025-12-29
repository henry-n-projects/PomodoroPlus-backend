import passport, { use } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Prisma } from "@prisma/client";
import prisma from "../libs/prisma.js";
import { Default_Tags } from "../constants/defaultTags.js";

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
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await prisma.$transaction(async (tx) => {
            // Create or fetch user (never null)
            const user = await tx.user.upsert({
              where: { auth_user_id: profile.id },
              update: {},
              create: {
                auth_user_id: profile.id,
                name: profile.displayName,
                avatar_url: profile.photos?.[0]?.value ?? null,
                timezone: "UTC",
                settings: {} as Prisma.JsonObject,
              },
            });

            // Seed default tags
            await tx.tag.createMany({
              data: Default_Tags.map((t) => ({
                user_id: user.id,
                name: t.name,
                color: t.color,
                created_at: new Date(),
              })),
              skipDuplicates: true,
            });

            return user;
          });

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
};
