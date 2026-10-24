"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Plus } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { GlobalSearch } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { getPageTitle } from "./nav-config";

export function AppHeader() {
  const pathname = usePathname();
  const { data } = useAppStore();
  const user = data.currentUser;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav />
        <p className="hidden shrink-0 text-sm font-semibold md:block" aria-live="polite">
          {getPageTitle(pathname)}
        </p>
        <div className="flex flex-1 justify-center md:px-4">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/calls/new">
              <Plus />
              New Recruiter Call
            </Link>
          </Button>
          <Button asChild size="icon" className="sm:hidden" aria-label="New recruiter call">
            <Link href="/calls/new">
              <Plus />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Notifications are not available in the prototype yet.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                <Avatar>
                  <AvatarFallback>{user.name ? initials(user.name) : "…"}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span>{user.name || "Loading…"}</span>
                <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Sign out (no auth in prototype)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
