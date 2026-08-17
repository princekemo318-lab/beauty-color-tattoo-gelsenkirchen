// GET /api/shop/products — public catalog (prices are authoritative on the server).
import { json } from "../../_shared/auth.js";
import { CATALOG, SHIPPING, TAX_RATE, CUSTOM_MIN } from "../../_shared/shop.js";

export async function onRequestGet() {
  return json(
    { products: CATALOG, shipping: SHIPPING, taxRate: TAX_RATE, customMin: CUSTOM_MIN },
    200,
    { "cache-control": "public, max-age=300" }
  );
}
