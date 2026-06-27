import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DrawCanvas from "@/components/canvas/DrawCanvas";
import styles from "./room.module.css";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  // Run auth and params resolution in parallel
  const [session, { roomId }] = await Promise.all([auth(), params]);

  if (!session?.user) redirect("/signin");

  return (
    <div className={styles.container}>
      <DrawCanvas roomId={roomId} />
    </div>
  );
}
