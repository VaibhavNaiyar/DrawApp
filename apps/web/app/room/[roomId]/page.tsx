import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DrawCanvas from "@/components/canvas/DrawCanvas";
import styles from "./room.module.css";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const [session, { roomId }] = await Promise.all([auth(), params]);

  if (!session?.user) redirect("/signin");

  return (
    <div className={styles.container}>
      <DrawCanvas
        roomId={roomId}
        userId={session.user.id}
        userName={session.user.name ?? "Anonymous"}
      />
    </div>
  );
}
