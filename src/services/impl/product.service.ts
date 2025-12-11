import { type Cradle } from "@fastify/awilix";
import { eq } from "drizzle-orm";
import { type INotificationService } from "../notifications.port.js";
import { products, type Product } from "@/db/schema.js";
import { ProductType } from "@/utils/enums/product-type.js";
import { type Database } from "@/db/type.js";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export class ProductService {
  private readonly ns: INotificationService;
  private readonly db: Database;

  public constructor({ ns, db }: Pick<Cradle, "ns" | "db">) {
    this.ns = ns;
    this.db = db;
  }

  public async processProduct(product: Product): Promise<void> {
    switch (product.type) {
      case ProductType.NORMAL:
        await this.handleNormalProduct(product);
        break;
      case ProductType.SEASONAL:
        await this.handleSeasonalProduct(product);
        break;
      case ProductType.EXPIRABLE:
        await this.handleExpirableProduct(product);
        break;
      default:
        await this.handleNormalProduct(product);
        break;
    }
  }

  public async notifyDelay(leadTime: number, product: Product): Promise<void> {
    product.leadTime = leadTime;
    await this.persistProduct(product);
    this.ns.sendDelayNotification(leadTime, product.name);
  }

  private async handleNormalProduct(product: Product): Promise<void> {
    if (product.available > 0) {
      await this.decrementStock(product);
      return;
    }

    if (product.leadTime > 0) {
      await this.notifyDelay(product.leadTime, product);
    }
  }

  private async handleSeasonalProduct(product: Product): Promise<void> {
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

  private async handleExpirableProduct(product: Product): Promise<void> {
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

  private async decrementStock(product: Product): Promise<void> {
    product.available -= 1;
    await this.persistProduct(product);
  }

  private async markUnavailable(product: Product): Promise<void> {
    product.available = 0;
    await this.persistProduct(product);
  }

  private async persistProduct(product: Product): Promise<void> {
    await this.db
      .update(products)
      .set(product)
      .where(eq(products.id, product.id));
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

  private hasExpired(product: Product, now: Date): boolean {
    if (!product.expiryDate) {
      return false;
    }

    return product.expiryDate <= now;
  }
}
