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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card border-b h-16 shadow-md">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center space-x-2 ml-6">
            <LogoIcon className="h-2 w-2 text-primary" width={50} height={50} />
            <span className="font-bold text-xl">Weezboo Teams</span>
          </Link>
        </div>

        <div className="flex-1 max-w-lg mx-auto">
          <form onSubmit={handleSearch} className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search posts, people, or tags"
              className="pl-9 bg-background border-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        <div className="flex items-center gap-2 mr-6">
          {session ? (
            <>
              <Button variant="ghost" size="icon" className="relative hover-effect">
                <BellIcon className="h-5 w-5" />
                {/* <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                  
                </span> */}
              </Button>

              {/* Chat toggle button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative hover-effect" 
                onClick={toggleChat}
              >
                <MessageCircle className="h-5 w-5" />
                {isChatOpen && (
                  <span className="absolute bottom-1 right-1 bg-primary rounded-full w-2 h-2" />
                )}
              </Button>

              {/* Profile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="rounded-full p-0 h-10 w-10 overflow-hidden">
                    {renderAvatar()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session?.user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href="/profile">Your Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-posts">My Posts</Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="outline">Sign In</Button>
          )}
        </div>
      </div>
    </nav>
  );
} 