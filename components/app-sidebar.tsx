"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  AlertDiamondIcon,
  Bug01Icon,
  DashboardSquare01Icon,
  Flowchart01Icon,
  HelpCircleIcon,
  Link01Icon,
  NewsIcon,
  Package01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardSquare01Icon },
  { href: "/digest", label: "Digest", icon: NewsIcon },
  { href: "/graph", label: "Graph", icon: Flowchart01Icon },
  { href: "/deliverables", label: "Deliverables", icon: Package01Icon },
  { href: "/dependencies", label: "Dependencies", icon: Link01Icon },
  { href: "/risks", label: "Risks", icon: AlertDiamondIcon },
  { href: "/assumptions", label: "Assumptions", icon: HelpCircleIcon },
  { href: "/issues", label: "Issues", icon: Bug01Icon },
  { href: "/teams", label: "Teams", icon: UserGroupIcon },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 text-sm font-semibold">
        RAID Tracker
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Program</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
