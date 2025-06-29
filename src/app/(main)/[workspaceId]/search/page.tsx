import { searchContent } from "@/actions/search";
import SearchResults from "@/components/search/SearchResults";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";

interface SearchPageProps {
  searchParams: {
    q?: string;
    tab?: string;
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }
  const _searchParams = await searchParams;
  const query = _searchParams.q || "";
  const tab = _searchParams.tab || "all";
  
  // If no query, redirect to the homepage
  if (!query.trim()) {
    redirect("/");
  }

  // Get initial data from server action
  const initialData = await searchContent(query, tab);

  // Pass data to the client component
  return (
    <SearchResults 
      initialData={initialData}
      searchQuery={query}
      activeTab={tab}
    />
  );
} 