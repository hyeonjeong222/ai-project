export function hasVerifiedEmail(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
}): user is { email: string; email_confirmed_at: string } {
  return Boolean(user.email && user.email_confirmed_at);
}
