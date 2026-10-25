import Link from "next/link";
import { currentUser, hasRole } from "@/lib/auth";
import UploadForm from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  if (!hasRole(await currentUser(), "planner"))
    return (
      <p className="mx-auto max-w-2xl rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
        Uploading data needs a planner or admin account. <Link href="/login" className="underline">Sign in</Link>.
      </p>
    );
  return <UploadForm />;
}
