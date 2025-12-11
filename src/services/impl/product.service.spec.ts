import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { type INotificationService } from "../notifications.port.js";
import {
  createDatabaseMock,
  cleanUp,
} from "../../utils/test-utils/database-tools.ts.js";
import { ProductService } from "./product.service.js";
import { products, type Product } from "@/db/schema.js";
import { ProductType } from "@/utils/enums/product-type.js";
import { type Database } from "@/db/type.js";

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
    productService = new ProductService({
      ns: notificationServiceMock,
      db: databaseMock,
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
      type: ProductType.NORMAL,
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
      type: ProductType.NORMAL,
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
      type: ProductType.SEASONAL,
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
      type: ProductType.SEASONAL,
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
      type: ProductType.SEASONAL,
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
      type: ProductType.SEASONAL,
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
      type: ProductType.EXPIRABLE,
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
      type: ProductType.EXPIRABLE,
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
      type: ProductType.NORMAL,
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
