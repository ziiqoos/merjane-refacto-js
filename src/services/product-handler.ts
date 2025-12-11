import { type Product } from "@/domain/product.js";
import { PRODUCT_TYPES } from "@/domain/product.js";
export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

export interface IProductHandler {
  readonly type: ProductType;
  processOrder(p: Product): Promise<void>;
}
