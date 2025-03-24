import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/timeline");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <Link href="/" className="inline-block">
              <h1 className="text-3xl font-bold text-blue-600">Devitter</h1>
            </Link>
            <h2 className="mt-6 text-2xl font-bold text-gray-900">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Or{" "}
              <Link
                href="/register"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                create a new account
              </Link>
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
} 