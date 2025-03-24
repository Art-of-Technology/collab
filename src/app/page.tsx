import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();

  // If user is logged in, redirect to timeline
  if (user) {
    redirect("/timeline");
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <main className="flex-grow flex items-center justify-center bg-white">
        <div className="container mx-auto px-4 py-16 flex flex-col md:flex-row items-center gap-12">
          <div className="md:w-1/2 flex flex-col items-start">
            <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
              Devitter
            </h1>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-6">
              The internal timeline for developer teams
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Share updates, track blockers, and collaborate with your team in a
              simple, streamlined timeline — without the complexity of traditional
              project management tools.
            </p>
            <div className="flex gap-4">
              <Link
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md text-lg font-medium transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-md text-lg font-medium transition-colors"
              >
                Register
              </Link>
            </div>
          </div>
          <div className="md:w-1/2">
            <div className="bg-gray-100 rounded-lg p-6 shadow-lg">
              {/* Timeline Preview */}
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">JD</div>
                    <div>
                      <p className="font-medium">Jane Doe</p>
                      <p className="text-sm text-gray-500">10m ago • UPDATE</p>
                    </div>
                  </div>
                  <p className="text-gray-700">Completed the responsive design for the login form. Moving on to registration page now.</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">JS</div>
                    <div>
                      <p className="font-medium">John Smith</p>
                      <p className="text-sm text-gray-500">1h ago • BLOCKER</p>
                    </div>
                  </div>
                  <p className="text-gray-700">Having issues with the authentication service. Getting timeout errors when connecting to the DB.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-4">
          <p className="text-center text-gray-600">© 2025 Devitter. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
