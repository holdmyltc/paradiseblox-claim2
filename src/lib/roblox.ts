import type { RobloxProfile } from "@/lib/types";

export async function lookupRobloxUser(username: string): Promise<RobloxProfile> {
  const cleaned = username.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleaned)) throw new Error("Enter a valid Roblox username");
  const userResponse = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [cleaned], excludeBannedUsers: true }),
    cache: "no-store",
  });
  if (!userResponse.ok) throw new Error("Roblox lookup is temporarily unavailable");
  const userJson = await userResponse.json();
  const user = userJson?.data?.[0];
  if (!user?.id) throw new Error("Roblox username not found");

  const [profileResponse, avatarResponse] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${user.id}`, { cache: "no-store" }),
    fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`, { cache: "no-store" }),
  ]);
  const profile = profileResponse.ok ? await profileResponse.json() : {};
  const avatar = avatarResponse.ok ? await avatarResponse.json() : {};
  return {
    userId: Number(user.id),
    username: user.name,
    displayName: profile.displayName || user.displayName || user.name,
    avatarUrl: avatar?.data?.[0]?.imageUrl || null,
  };
}
