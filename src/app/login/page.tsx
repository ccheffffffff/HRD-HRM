import Login from '@/components/login';
export const dynamic = 'force-dynamic';
export default function LoginPage() {
  return (
    <Login
      google={!!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      microsoft={
        !!(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET)
      }
    />
  );
}
