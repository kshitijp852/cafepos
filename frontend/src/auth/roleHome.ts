import type { Role } from "@/lib/types";

/** Where a signed-in user lands right after auth, keyed by role. */
export function roleHome(role: Role): string {
  switch (role) {
    case "platform_admin":
      return "/admin";
    case "waiter":
      return "/waiter/tables";
    case "kitchen":
      return "/waiter/kitchen";
    default:
      return "/dashboard";
  }
}
