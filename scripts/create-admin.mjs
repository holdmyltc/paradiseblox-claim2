import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password) {
  console.error('Usage: npm run admin:create -- admin@example.com "A-strong-password"');
  process.exit(1);
}
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use an admin password with at least 12 characters.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let user = null;
const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (created.error) {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  user = listed.data.users.find((item) => item.email?.toLowerCase() === email) || null;
  if (!user) throw created.error;
  const updated = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (updated.error) throw updated.error;
  user = updated.data.user;
} else {
  user = created.data.user;
}

const profile = await supabase.from("admin_profiles").upsert({
  user_id: user.id,
  display_name: "ParadiseBlox Admin",
});
if (profile.error) throw profile.error;

console.log("Admin account is ready:");
console.log(email);
console.log(user.id);
