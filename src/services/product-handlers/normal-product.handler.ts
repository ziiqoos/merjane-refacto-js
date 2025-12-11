import { ProductRepositoryPort } from "@/repositories/product.repository.js";
import { IProductHandler } from "../product-handler.js";
import { PRODUCT_TYPES, type Product } from "@/domain/product.js";
import { type INotificationService } from "../notifications.port.js";

export class NormalProductHandler implements IProductHandler {
  public readonly type = PRODUCT_TYPES.NORMAL;

  private readonly ns: INotificationService;
  private readonly repo: ProductRepositoryPort;

  public constructor(ns: INotificationService, pr: ProductRepositoryPort) {
    this.ns = ns;
    this.repo = pr;
  }
  async processOrder(product: Product): Promise<void> {
    if (product.available > 0) {
      await this.decrementStock(product);
      return;
    }

    if (product.leadTime > 0) {
      await this.notifyDelay(product.leadTime, product);
    }
  }

  public async notifyDelay(leadTime: number, product: Product): Promise<void> {
    product.leadTime = leadTime;
    await this.persistProduct(product);
    this.ns.sendDelayNotification(leadTime, product.name);
  }

  private async decrementStock(product: Product): Promise<void> {
    product.available -= 1;
    await this.persistProduct(product);
  }

  private async persistProduct(product: Product): Promise<void> {
    await this.repo.persistProduct(product);
  }
}
