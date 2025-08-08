import { Loader2 } from "lucide-react";
import { Metadata } from "next";
import { Suspense } from "react";
import NotificationsClient from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Notifications | Collab",
  description: "View and manage your notifications",
};

export default function NotificationsPage() {
  return (
    <div>
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <NotificationsClient />
      </Suspense>
    </div>
  );
}