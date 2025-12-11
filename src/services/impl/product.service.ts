import { type Cradle } from "@fastify/awilix";
import { ProductType, type Product } from "@/domain/product.js";
import { type ProductRepositoryPort } from "@/repositories/product.repository.js";
import { PRODUCT_TYPES } from "@/domain/product.js";
import { IProductHandler } from "../product-handler.js";

export class ProductService {
  private readonly repo: ProductRepositoryPort;
  private readonly handlersByType: Map<ProductType, IProductHandler>;

  constructor({
    pr,
    productHandlersByType,
  }: Pick<Cradle, "ns" | "pr" | "productHandlersByType">) {
    this.repo = pr;
    this.handlersByType = productHandlersByType;
  }

  public async processOrder(orderId: number): Promise<number | null> {
    const order = await this.repo.findOrderWithProducts(orderId);

    if (!order) {
      return null;
    }

    for (const { product } of order.products ?? []) {
      await this.processProduct(product);
    }

    return order.id;
  }

  public async processProduct(product: Product): Promise<void> {
    const handler =
      this.handlersByType.get(product.type) ??
      this.handlersByType.get(PRODUCT_TYPES.NORMAL);

    if (!handler) {
      throw new Error("Register a handler for Normal products");
    }

    await handler.processOrder(product);
  }
}
