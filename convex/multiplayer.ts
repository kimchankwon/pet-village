'use node';

import { SignJWT } from 'jose';
import { v } from 'convex/values';
import {
  PROTOCOL_VERSION,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
} from '@pet-village/multiplayer-protocol';
import { internal } from './_generated/api';
import { action } from './_generated/server';

const PENGUIN_COLORS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

export const issueTicket = action({
  args: { penguinColor: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const profile: {
      identity: string;
      displayName: string;
      petName: string;
      petSpecies: string;
      penguinColor: string;
    } = await ctx.runQuery(internal.multiplayerProfile.admissionProfile, {});
    const secret = process.env.MULTIPLAYER_TICKET_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('Multiplayer ticket signing is not configured');
    }

    return await new SignJWT({
      displayName: profile.displayName,
      petName: profile.petName,
      petSpecies: profile.petSpecies,
      penguinColor: PENGUIN_COLORS.has(args.penguinColor)
        ? args.penguinColor
        : profile.penguinColor,
      protocolVersion: PROTOCOL_VERSION,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(TICKET_ISSUER)
      .setAudience(TICKET_AUDIENCE)
      .setSubject(profile.identity)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(secret));
  },
});
