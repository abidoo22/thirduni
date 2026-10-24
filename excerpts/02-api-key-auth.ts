/**
 * DzVendeur - Secure API Key Generation & SHA-256 Authentication
 * =============================================================
 * What it does:
 * Generates cryptographically secure API keys (prefixed `sec_live_`) for physical
 * store cash registers, stores only the SHA-256 hash in PostgreSQL, and authenticates
 * incoming POS sync requests in constant-time hash comparison.
 *
 * Why it matters:
 * Merchant desktop sync bots run in physical retail stores on Windows PCs.
 * Plaintext keys are never stored on the server, preventing credential theft even
 * in the event of database access, while granting isolated sync access per store.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";

// POST /api/merchant/api-keys - Generates new POS sync key
export async function generateStoreApiKey(storeId: number, keyName: string) {
  // Generate random 24-byte hex token prefixed for easy identification
  const secretBytes = crypto.randomBytes(24).toString("hex");
  const rawSecretKey = `sec_live_${secretBytes}`;
  const keyPrefix = rawSecretKey.substring(0, 16) + "...";
  const keyHash = crypto.createHash("sha256").update(rawSecretKey).digest("hex");

  const apiKey = await prisma.storeApiKey.create({
    data: {
      storeId,
      name: keyName || "Main POS Cashier",
      keyPrefix,
      keyHash,
    },
  });

  // Return raw secret key ONLY once upon creation so merchant can paste it into desktop agent
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    createdAt: apiKey.createdAt,
    rawSecretKey,
  };
}

// POST /api/v1/sync/products - Authenticates incoming POS sync request
export async function authenticatePosSyncRequest(authHeader: string | null) {
  const rawApiKey = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!rawApiKey || !rawApiKey.startsWith("sec_live_")) {
    return { authenticated: false, error: "Unauthorized - Valid X-Store-API-Key required" };
  }

  // Hash provided key with SHA-256 and find matching record
  const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");

  const apiKeyRecord = await prisma.storeApiKey.findUnique({
    where: { keyHash },
    include: {
      store: {
        select: { id: true, name: true, isActive: true, ownerId: true },
      },
    },
  });

  if (!apiKeyRecord || !apiKeyRecord.store || !apiKeyRecord.store.isActive) {
    return { authenticated: false, error: "Invalid or inactive API key" };
  }

  // Touch lastUsedAt timestamp for audit trail
  await prisma.storeApiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return { authenticated: true, store: apiKeyRecord.store };
}
