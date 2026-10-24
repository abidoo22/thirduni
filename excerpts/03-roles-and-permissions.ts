/**
 * DzVendeur - Multi-Tenant Hierarchy & Sub-Account Scoped Data Access
 * ===================================================================
 * What it does:
 * Resolves the root merchant store for delegated staff members (SUB_ACCOUNT role)
 * and enforces strict data visibility where staff can only view and manage orders
 * matching their granted permissions (e.g. confirm, ship, return) or audit trail.
 *
 * Why it matters:
 * Retailers employ shop assistants, delivery managers, and order fulfillment staff.
 * Sub-accounts must be strictly quarantined to their employer's store, preventing
 * horizontal privilege escalation (IDOR) across stores or unauthorized status changes.
 */

import { prisma } from "@/lib/db";
import { Role, Prisma } from "@prisma/client";

type PermKey = "permViewOrders" | "permManageProducts" | "permDeliveryPricing" | "permManageTeam" | "permManageSettings";

// Resolve parent merchant store and enforce sub-account permission flags
export async function getStoreAndPermission(userId: number, requiredPermission?: PermKey) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { parent: true },
  });
  if (!user) return null;

  let ownerId = userId;
  let currentUser = user;

  if (user.role === Role.SUB_ACCOUNT) {
    if (requiredPermission && !user[requiredPermission]) {
      return { forbidden: true };
    }
    // Traverse parent hierarchy to find root store owner
    while (currentUser.parentId) {
      const parentUser = await prisma.user.findUnique({ where: { id: currentUser.parentId } });
      if (!parentUser) break;
      currentUser = parentUser;
      if (parentUser.role === Role.MERCHANT) {
        ownerId = parentUser.id;
        break;
      }
    }
  } else if (user.role !== Role.MERCHANT) {
    return null;
  }

  const store = await prisma.store.findUnique({ where: { ownerId } });
  if (!store) return null;
  return { store, ownerId, user };
}

// Scoped Prisma filter ensuring staff only access permitted order states
export function getOrderVisibilityWhere(
  user: { id: number; role: string; permOrderFull?: boolean; permOrderConfirmCancel?: boolean; permOrderShip?: boolean },
  storeId: number
): Prisma.OrderWhereInput {
  if (user.role !== "SUB_ACCOUNT") return { storeId };

  const conditions: Prisma.OrderWhereInput[] = [
    { createdById: user.id },
    { confirmedById: user.id },
    { shippedById: user.id },
  ];

  if (user.permOrderFull || user.permOrderConfirmCancel) conditions.push({ status: "PENDING" });
  if (user.permOrderFull || user.permOrderShip) conditions.push({ status: "CONFIRMED" });

  return { storeId, OR: conditions };
}
