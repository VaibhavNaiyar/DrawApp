import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Server component — checks NextAuth session, redirects accordingly
export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  else redirect("/signin");
}
