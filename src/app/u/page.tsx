import { redirect } from "next/navigation";

// Target of the home page form: /u?username=foo -> /u/foo
export default async function UsernameRedirect({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const { username } = await searchParams;
  const name = username?.trim();
  redirect(name ? `/u/${encodeURIComponent(name)}` : "/");
}
