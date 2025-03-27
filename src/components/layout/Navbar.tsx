"use client";

import { useState, Fragment, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { 
  BellIcon, 
  MagnifyingGlassIcon 
} from "@heroicons/react/24/outline";
import { MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LogoIcon from "@/components/icons/LogoIcon";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useUiContext } from "@/context/UiContext";

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { isChatOpen, toggleChat } = useUiContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [userData, setUserData] = useState<any>(null);

  // Fetch the current user data for avatar
  useEffect(() => {
    const fetchUserData = async () => {
      if (session?.user) {
        try {
          const response = await fetch("/api/user/me");
          if (response.ok) {
            const data = await response.json();
            setUserData(data.user);
          }
        } catch (error) {
          console.error("Failed to fetch user data:", error);
        }
      }
    };

    fetchUserData();
  }, [session]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast({
      title: "Signed out successfully",
      description: "You have been signed out of your account",
    });
    router.push("/");
    router.refresh();
  };

  // Get user initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Render the avatar based on user data
  const renderAvatar = () => {
    if (userData?.useCustomAvatar) {
      return <CustomAvatar user={userData} size="md" />;
    }

    return (
      <Avatar>
        {session?.user?.image ? (
          <AvatarImage src={session.user.image} alt={session.user.name || "User"} />
        ) : (
          <AvatarFallback>{getInitials(session?.user?.name || "")}</AvatarFallback>
        )}
      </Avatar>
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#191919] border-b border-[#2a2929] h-16 shadow-md">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center space-x-2 ml-6">
            <LogoIcon className="h-2 w-2 text-primary" width={50} height={50} />
            <span className="font-bold text-xl text-white">Weezboo Teams</span>
          </Link>
        </div>

        <div className="flex-1 max-w-lg mx-auto">
          <form onSubmit={handleSearch} className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search posts, people, or tags"
              className="pl-9 bg-[#1c1c1c] border-[#2a2929] text-gray-200 focus:border-gray-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        <div className="flex items-center gap-2 mr-6">
          {session ? (
            <>
              <Button variant="ghost" size="icon" className="relative hover:bg-[#1c1c1c] text-gray-400">
                <BellIcon className="h-5 w-5" />
              </Button>

              {/* Chat toggle button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative hover:bg-[#1c1c1c] text-gray-400" 
                onClick={toggleChat}
              >
                <MessageCircle className="h-5 w-5" />
                {isChatOpen && (
                  <span className="absolute bottom-1 right-1 bg-blue-500 rounded-full w-2 h-2" />
                )}
              </Button>

              {/* Profile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="rounded-full p-0 h-10 w-10 overflow-hidden">
                    {renderAvatar()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#1c1c1c] border-[#2a2929] text-gray-200" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                      <p className="text-xs leading-none text-gray-400">
                        {session?.user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href="/profile">Your Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-posts">My Posts</Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuItem onClick={handleSignOut}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="outline" className="border-[#2a2929] hover:bg-[#1c1c1c] text-gray-200">Sign In</Button>
          )}
        </div>
      </div>
    </nav>
  );
} 