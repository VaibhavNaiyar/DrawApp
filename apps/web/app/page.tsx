import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Server component — reads cookie instantly, no JS waterfall
export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (token) redirect("/dashboard");
  else redirect("/signin");
}
