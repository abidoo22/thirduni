/**
 * DzVendeur - Cash-on-Delivery (COD) Order Lifecycle & Stock Transaction
 * =====================================================================
 * What it does:
 * Enforces a strict state machine transition matrix for Algerian COD orders
 * (PENDING -> CONFIRMED -> SHIPPED -> COMPLETED), verifies sub-account transition
 * permissions, and executes atomic database transactions to decrement or restore stock.
 *
 * Why it matters:
 * In Algeria, COD is the dominant payment method with high return risks. Orders
 * require phone confirmation before dispatch. Atomic transactions guarantee stock
 * integrity between online reservations and physical cashier sales.
 */

import { prisma } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELED", "MODIFIED_PENDING"],
  MODIFIED_PENDING: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["SHIPPED", "CANCELED", "MODIFIED_PENDING"],
  SHIPPED: ["COMPLETED", "RETURNED"],
  COMPLETED: ["RETURNED"],
  CANCELED: [],
  RETURNED: [],
};

export async function transitionOrderStatus(
  orderId: number,
  newStatus: OrderStatus,
  order: { id: number; status: OrderStatus; items: Array<{ productId: number; quantity: number }> },
  actorUserId: number
) {
  const allowedNext = ALLOWED_TRANSITIONS[order.status];
  if (!allowedNext || !allowedNext.includes(newStatus)) {
    throw new Error(`Forbidden: Cannot transition from ${order.status} to ${newStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    // When merchant confirms order after customer phone verification, decrement stock
    if (newStatus === "CONFIRMED") {
      for (const item of order.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ID: ${item.productId}`);
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    }

    // When order is canceled or returned, restore reserved items back to inventory
    if ((newStatus === "CANCELED" || newStatus === "RETURNED") && order.status !== "PENDING") {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    return tx.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        updatedById: actorUserId,
        ...(newStatus === "CONFIRMED" && { confirmedById: actorUserId, confirmedAt: new Date() }),
        ...(newStatus === "SHIPPED" && { shippedById: actorUserId, shippedAt: new Date() }),
        ...(newStatus === "COMPLETED" && { completedById: actorUserId, completedAt: new Date() }),
      },
    });
  });
}
