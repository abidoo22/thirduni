/**
 * DzVendeur - Multi-Tenant Chat Authorization & In-App Messaging
 * =============================================================
 * What it does:
 * Authorizes and handles direct in-app messaging between buyers and merchants,
 * ensuring complete tenant isolation and verifying sub-account permissions
 * (`permConsumerChat` vs `permSupportChat`).
 *
 * Why it matters:
 * Algerian shoppers expect immediate communication with shop owners to ask about
 * sizing, colors, and delivery schedules before confirming COD purchases.
 */

import { prisma } from "@/lib/db";
import { sanitizeTextContent } from "@/lib/security";

// Verify user permission and isolation boundary for a given conversation
export async function verifyConversationAccess(
  conversationId: number,
  userId: number,
  role: string
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) return null;

  // Merchant / Staff isolation: only access chats belonging to their own store
  if (role === "MERCHANT" || role === "SUB_ACCOUNT") {
    let ownerId = userId;
    if (role === "SUB_ACCOUNT") {
      const subUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { parentId: true, permConsumerChat: true, permSupportChat: true },
      });
      if (conversation.type === "SUPPORT" && !subUser?.permSupportChat) return null;
      if (conversation.type === "MERCHANT_CUSTOMER" && !subUser?.permConsumerChat) return null;
      if (subUser?.parentId) ownerId = subUser.parentId;
    }

    if (conversation.merchantId === ownerId) {
      return conversation;
    }
    return null;
  }

  // Customer isolation: can only access conversations they personally initiated
  if (role === "CUSTOMER") {
    if (conversation.customerId === userId && conversation.type === "MERCHANT_CUSTOMER") {
      return conversation;
    }
    return null;
  }

  return null;
}

// Send and persist a sanitized chat message
export async function sendChatMessage(conversationId: number, senderId: number, rawText: string) {
  const cleanText = sanitizeTextContent(rawText.trim());
  if (!cleanText) {
    throw new Error("Message text cannot be empty");
  }

  return prisma.message.create({
    data: {
      conversationId,
      senderId,
      text: cleanText,
    },
  });
}
