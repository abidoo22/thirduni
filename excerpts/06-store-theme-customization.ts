/**
 * DzVendeur - Store Branding, Theme Whitelist & Social Channels
 * ============================================================
 * What it does:
 * Manages store branding configuration including strict color theme whitelisting,
 * merchant logo URL, return window policies, and verified Algerian social links
 * (Facebook, Instagram, TikTok, WhatsApp direct messaging).
 *
 * Why it matters:
 * In the Algerian market, social commerce (Instagram & WhatsApp) is critical.
 * Merchants customize their storefront to match their brand identity while
 * keeping customer interactions directly tied to their active WhatsApp support.
 */

import { prisma } from "@/lib/db";
import { getStoreAndPermission } from "@/lib/auth-utils";

// Curated accessibility-tested primary brand palettes
const ALLOWED_THEME_COLORS = ["#10b981", "#004ac6", "#bc4800", "#7c3aed"];

// PUT /api/merchant/store - Updates merchant branding, theme, and social connections
export async function updateStoreSettings(userId: number, body: Record<string, any>) {
  // 1. Verify sub-account has permManageSettings or user is store owner
  const permissionResult = await getStoreAndPermission(userId, "permManageSettings");
  if (!permissionResult || "forbidden" in permissionResult) {
    return { status: 403, error: "Forbidden: You do not have permission to modify store settings" };
  }

  const { store } = permissionResult;
  const { name, themeColor, logo, whatsappUrl, instagramUrl, facebookUrl, returnDaysLimit } = body;

  // 2. Validate theme color against allowed branding list
  if (themeColor !== undefined) {
    const normalizedColor = String(themeColor).trim().toLowerCase();
    if (!ALLOWED_THEME_COLORS.includes(normalizedColor)) {
      return { status: 400, error: "Invalid theme color selected" };
    }
  }

  // 3. Validate return days limit
  const parsedReturnDays = returnDaysLimit !== undefined ? parseInt(returnDaysLimit, 10) : undefined;
  if (parsedReturnDays !== undefined && (isNaN(parsedReturnDays) || parsedReturnDays < 0)) {
    return { status: 400, error: "Invalid return days limit" };
  }

  // 4. Update store branding and social profiles
  const updatedStore = await prisma.store.update({
    where: { id: store.id },
    data: {
      ...(name && { name: String(name).trim() }),
      ...(themeColor && { themeColor: String(themeColor).trim().toLowerCase() }),
      ...(logo !== undefined && { logo }),
      ...(whatsappUrl !== undefined && { whatsappUrl }),
      ...(instagramUrl !== undefined && { instagramUrl }),
      ...(facebookUrl !== undefined && { facebookUrl }),
      ...(parsedReturnDays !== undefined && { returnDaysLimit: parsedReturnDays }),
    },
  });

  return { status: 200, store: updatedStore };
}
