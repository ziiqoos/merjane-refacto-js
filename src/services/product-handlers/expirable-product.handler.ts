import { ProductRepositoryPort } from "@/repositories/product.repository.js";
import { IProductHandler } from "../product-handler.js";
import { PRODUCT_TYPES, type Product } from "@/domain/product.js";
import { type INotificationService } from "../notifications.port.js";

export class ExpirableProductHandler implements IProductHandler {
  public readonly type = PRODUCT_TYPES.EXPIRABLE;
  private readonly ns: INotificationService;
  private readonly repo: ProductRepositoryPort;

  public constructor(ns: INotificationService, pr: ProductRepositoryPort) {
    this.ns = ns;
    this.repo = pr;
  }
  async processOrder(product: Product): Promise<void> {
    const now = new Date();
    const isExpired = this.hasExpired(product, now);

    if (product.available > 0 && !isExpired) {
      await this.decrementStock(product);
      return;
    }

    await this.markUnavailable(product);
    if (product.expiryDate) {
      this.ns.sendExpirationNotification(product.name, product.expiryDate);
    }
  }

  private hasExpired(product: Product, now: Date): boolean {
    if (!product.expiryDate) {
      return false;
    }

    return product.expiryDate <= now;
  }

  private async markUnavailable(product: Product): Promise<void> {
    product.available = 0;
    await this.persistProduct(product);
  }
  private async decrementStock(product: Product): Promise<void> {
    product.available -= 1;
    await this.persistProduct(product);
  }

  private async persistProduct(product: Product): Promise<void> {
    await this.repo.persistProduct(product);
  }
}
