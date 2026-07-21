"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/digest", label: "Digest" },
  { href: "/graph", label: "Graph" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/risks", label: "Risks" },
  { href: "/assumptions", label: "Assumptions" },
  { href: "/issues", label: "Issues" },
  { href: "/teams", label: "Teams" },
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
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
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
