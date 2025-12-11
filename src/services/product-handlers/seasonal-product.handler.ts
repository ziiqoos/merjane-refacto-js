import { ProductRepositoryPort } from "@/repositories/product.repository.js";
import { IProductHandler } from "../product-handler.js";
import { PRODUCT_TYPES, type Product } from "@/domain/product.js";
import { type INotificationService } from "../notifications.port.js";
const DAY_IN_MS = 1000 * 60 * 60 * 24;

export class SeasonalProductHandler implements IProductHandler {
  public readonly type = PRODUCT_TYPES.SEASONAL;
  private readonly ns: INotificationService;
  private readonly repo: ProductRepositoryPort;

  public constructor(ns: INotificationService, pr: ProductRepositoryPort) {
    this.ns = ns;
    this.repo = pr;
  }

  async processOrder(product: Product): Promise<void> {
    const now = new Date();
    const inSeason = this.isInSeason(product, now);

    if (inSeason && product.available > 0) {
      await this.decrementStock(product);
      return;
    }

    const beforeSeason = this.isBeforeSeasonStart(product, now);
    const seasonOver = this.isAfterSeasonEnd(product, now);
    const canRestockBeforeEnd = this.canRestockBeforeSeasonEnd(product, now);

    if (beforeSeason || seasonOver || !canRestockBeforeEnd) {
      await this.markUnavailable(product);
      this.ns.sendOutOfStockNotification(product.name);
      return;
    }

    await this.notifyDelay(product.leadTime, product);
  }

  public async notifyDelay(leadTime: number, product: Product): Promise<void> {
    product.leadTime = leadTime;
    await this.persistProduct(product);
    this.ns.sendDelayNotification(leadTime, product.name);
  }

  private isInSeason(product: Product, now: Date): boolean {
    if (!product.seasonStartDate || !product.seasonEndDate) {
      return false;
    }

    return now >= product.seasonStartDate && now <= product.seasonEndDate;
  }

  private isBeforeSeasonStart(product: Product, now: Date): boolean {
    if (!product.seasonStartDate) {
      return false;
    }

    return now < product.seasonStartDate;
  }

  private isAfterSeasonEnd(product: Product, now: Date): boolean {
    if (!product.seasonEndDate) {
      return false;
    }

    return now > product.seasonEndDate;
  }

  private canRestockBeforeSeasonEnd(product: Product, now: Date): boolean {
    if (!product.seasonEndDate) {
      return false;
    }

    const restockDate = new Date(now.getTime() + product.leadTime * DAY_IN_MS);
    return restockDate <= product.seasonEndDate;
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
