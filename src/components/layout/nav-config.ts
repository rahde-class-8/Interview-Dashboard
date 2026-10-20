import {
  BookOpenCheck,
  Briefcase,
  CalendarClock,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  PhoneCall,
  Settings,
  Users,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboard },
  { title: "Recruiter Calls", href: "/calls", icon: PhoneCall },
  { title: "Opportunities", href: "/opportunities", icon: Briefcase },
  { title: "Interviews", href: "/interviews", icon: CalendarClock },
  { title: "Interview Preparation", href: "/preparation", icon: ListChecks },
  { title: "Question Bank", href: "/questions", icon: BookOpenCheck },
  { title: "Shared Workspace", href: "/shared", icon: Users },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}

/** Resolves the header title for the current route. */
export function getPageTitle(pathname: string) {
  if (pathname === "/calls/new") return "New Recruiter Call";
  const item = NAV_ITEMS.find((i) => isNavItemActive(i, pathname));
  return item?.title ?? "Dashboard";
}
