import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { type INotificationService } from "../notifications.port.js";
import {
  createDatabaseMock,
  cleanUp,
} from "../../utils/test-utils/database-tools.ts.js";
import { ProductService } from "./product.service.js";
import { products } from "@/db/schema.js";
import { type Product, PRODUCT_TYPES } from "@/domain/product.js";
import { type Database } from "@/db/type.js";
import { SQLiteProductRepository } from "@/repositories/sqlite-product.repository.js";
import { NormalProductHandler } from "@/services/product-handlers/normal-product.handler.js";
import { SeasonalProductHandler } from "@/services/product-handlers/seasonal-product.handler.js";
import { ExpirableProductHandler } from "@/services/product-handlers/expirable-product.handler.js";
import { type IProductHandler } from "@/services/product-handler.js";

describe("ProductService Tests", () => {
  let notificationServiceMock: DeepMockProxy<INotificationService>;
  let productService: ProductService;
  let databaseMock: Database;
  let databaseName: string;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    ({ databaseMock, databaseName } = await createDatabaseMock());
    notificationServiceMock = mockDeep<INotificationService>();
    const productRepository = new SQLiteProductRepository({
      db: databaseMock,
    } as any);
    const handlers: Map<
      (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES],
      IProductHandler
    > = new Map([
      [
        PRODUCT_TYPES.NORMAL,
        new NormalProductHandler(notificationServiceMock, productRepository),
      ],
      [
        PRODUCT_TYPES.SEASONAL,
        new SeasonalProductHandler(notificationServiceMock, productRepository),
      ],
      [
        PRODUCT_TYPES.EXPIRABLE,
        new ExpirableProductHandler(notificationServiceMock, productRepository),
      ],
    ]);
    productService = new ProductService({
      ns: notificationServiceMock,
      pr: productRepository,
      productHandlersByType: handlers,
    });
  });

  afterEach(async () => {
    await cleanUp(databaseName);
  });

  it("decrements NORMAL stock when available", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 1,
      name: "RJ45 Cable",
      type: PRODUCT_TYPES.NORMAL,
      available: 2,
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 1 });
    expect(
      notificationServiceMock.sendDelayNotification
    ).not.toHaveBeenCalled();
  });

  it("sends delay notification for NORMAL product without stock", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 2,
      name: "RJ45 Cable",
      type: PRODUCT_TYPES.NORMAL,
      available: 0,
      leadTime: 7,
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 0, leadTime: 7 });
    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      7,
      "RJ45 Cable"
    );
  });

  it("decrements SEASONAL stock when in season", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 3,
      type: PRODUCT_TYPES.SEASONAL,
      name: "Watermelon",
      available: 3,
      seasonStartDate: new Date(now - 5 * DAY),
      seasonEndDate: new Date(now + 60 * DAY),
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 2 });
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).not.toHaveBeenCalled();
  });

  it("marks SEASONAL product unavailable when season has not started", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 4,
      type: PRODUCT_TYPES.SEASONAL,
      name: "Cherry",
      available: 5,
      seasonStartDate: new Date(now + 30 * DAY),
      seasonEndDate: new Date(now + 60 * DAY),
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 0 });
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Cherry");
  });

  it("marks SEASONAL product unavailable when lead time exceeds season end", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 5,
      type: PRODUCT_TYPES.SEASONAL,
      name: "Grapes",
      available: 0,
      leadTime: 15,
      seasonStartDate: new Date(now - 2 * DAY),
      seasonEndDate: new Date(now + 5 * DAY),
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 0 });
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Grapes");
  });

  it("sends delay notification when SEASONAL product is out of stock but still in season", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 6,
      type: PRODUCT_TYPES.SEASONAL,
      name: "Melon",
      available: 0,
      leadTime: 3,
      seasonStartDate: new Date(now - 2 * DAY),
      seasonEndDate: new Date(now + 30 * DAY),
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 0 });
    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      3,
      "Melon"
    );
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).not.toHaveBeenCalled();
  });

  it("decrements EXPIRABLE stock when not expired", async () => {
    // GIVEN
    const product = await insertProduct({
      id: 7,
      type: PRODUCT_TYPES.EXPIRABLE,
      name: "Milk",
      available: 2,
      expiryDate: new Date(now + 30 * DAY),
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 1 });
    expect(
      notificationServiceMock.sendExpirationNotification
    ).not.toHaveBeenCalled();
  });

  it("marks EXPIRABLE product unavailable when expired", async () => {
    // GIVEN
    const expiryDate = new Date(now - 2 * DAY);
    const product = await insertProduct({
      id: 8,
      type: PRODUCT_TYPES.EXPIRABLE,
      name: "Yogurt",
      available: 3,
      expiryDate,
    });

    // WHEN
    await productService.processProduct(product);

    // THEN
    await expectProduct(product.id, { available: 0 });
    expect(
      notificationServiceMock.sendExpirationNotification
    ).toHaveBeenCalledWith("Yogurt", expiryDate);
  });

  async function insertProduct(overrides: Partial<Product>): Promise<Product> {
    const baseProduct: Product = {
      id: 1,
      leadTime: 1,
      available: 1,
      type: PRODUCT_TYPES.NORMAL,
      name: "Default",
      expiryDate: null,
      seasonStartDate: null,
      seasonEndDate: null,
    };
    const product = { ...baseProduct, ...overrides };
    await databaseMock.insert(products).values(product);
    return product as Product;
  }

  async function expectProduct(
    id: number,
    expected: Partial<Product>
  ): Promise<void> {
    const persisted = await databaseMock.query.products.findFirst({
      where: (product, { eq }) => eq(product.id, id),
    });
    expect(persisted).toMatchObject(expected);
  }
});
