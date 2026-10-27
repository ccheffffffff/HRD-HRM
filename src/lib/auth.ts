import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { query } from './db';
const providers: any[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const parsed = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(200),
        })
        .safeParse(credentials);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;
      const key = createHash('sha256').update(email).digest('hex');
      const [throttle] = await query(
        `INSERT INTO auth_throttles(key,expires_at) VALUES($1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_throttles.expires_at<now() THEN 1 ELSE auth_throttles.attempts+1 END,expires_at=CASE WHEN auth_throttles.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_throttles.expires_at END RETURNING attempts`,
        [key],
      );
      if (throttle.attempts > 10) return null;
      const [user] = await query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
      // A constant valid hash avoids a fast nonexistent-account path.
      const match = await compare(
        password,
        user?.password_hash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.yr9w59vgW38Fnjym8y0ThQtbE5FZ5aS',
      );
      if (!user || !match) return null;
      await query('DELETE FROM auth_throttles WHERE key=$1', [key]);
      return { id: user.id, name: user.name, email: user.email };
    },
  }),
];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
)
  providers.push(MicrosoftEntraID);
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'credentials') return true;
      if (!user.email) return false;
      if (account?.provider === 'google' && !(profile as any)?.email_verified) return false;
      // OAuth can only sign in a pre-provisioned active user. Tenant membership is never inferred from an email domain.
      const [existing] = await query('SELECT id FROM users WHERE email=$1 AND active=true', [
        user.email.toLowerCase(),
      ]);
      if (!existing) return false;
      user.id = existing.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = String(token.uid ?? '');
      return session;
    },
  },
});
