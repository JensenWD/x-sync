export interface XAccountIdentity {
  id: string;
  username: string;
}

export function assertSameXAccount(
  existing: { user_id: string; username: string } | undefined,
  user: XAccountIdentity,
) {
  if (existing && existing.user_id !== user.id) {
    throw new Error(
      `This library is bound to @${existing.username}. Disconnect it explicitly before connecting a different X account.`,
    );
  }
}
