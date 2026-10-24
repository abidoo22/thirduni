/**
 * DzVendeur - 58-Wilaya Dynamic Delivery Fee Engine
 * =================================================
 * What it does:
 * Calculates real-time Cash on Delivery (COD) shipping fees based on the merchant's
 * configured pricing matrix across Algeria's 58 wilayas, distinguishing between
 * Home Delivery (à domicile) and Stop-Desk / Post Office Pickup (au bureau).
 *
 * Why it matters:
 * Algerian logistics pricing varies widely between coastal, highland, and southern
 * desert wilayas. Flat shipping rates fail locally; merchants need exact per-wilaya
 * and per-delivery-mode pricing during checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/delivery-price - Calculate dynamic shipping rate for Algerian checkout
export async function POST(request: NextRequest) {
  try {
    const { storeId, wilayaId, deliveryType } = await request.json();

    const storeIdInt = parseInt(storeId, 10);
    const wilayaIdInt = parseInt(wilayaId, 10);

    if (isNaN(storeIdInt) || isNaN(wilayaIdInt)) {
      return NextResponse.json({ success: false, error: "Invalid store or wilaya ID" }, { status: 400 });
    }

    // Verify Wilaya exists (codes 01 to 58)
    const wilaya = await prisma.wilaya.findUnique({
      where: { id: wilayaIdInt },
      select: { id: true, code: true, nameAr: true, nameFr: true },
    });

    if (!wilaya) {
      return NextResponse.json({ success: false, error: "Wilaya not found" }, { status: 404 });
    }

    // Lookup merchant's custom price rule for this specific wilaya
    const priceRule = await prisma.priceRule.findUnique({
      where: {
        storeId_wilayaId: { storeId: storeIdInt, wilayaId: wilayaIdInt },
      },
    });

    // Default rates (0 indicates delivery is unavailable to this wilaya)
    let homePrice = 0;
    let officePrice = 0;

    if (priceRule && priceRule.isActive) {
      homePrice = Number(priceRule.homePrice);
      officePrice = Number(priceRule.officePrice);
    }

    // Determine price according to customer's chosen delivery method
    const isStopDesk = deliveryType === "POST_OFFICE" || deliveryType === "OFFICE";
    const selectedPrice = isStopDesk ? officePrice : homePrice;

    return NextResponse.json({
      success: true,
      data: {
        homePrice,
        officePrice,
        selectedPrice,
        currency: "DZD",
        isDeliveryAvailable: (isStopDesk ? officePrice : homePrice) > 0 || (priceRule?.isActive ?? false),
        wilaya,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to calculate delivery fee" }, { status: 500 });
  }
}
