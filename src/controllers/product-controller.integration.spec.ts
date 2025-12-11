import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { asValue } from "awilix";
import { type INotificationService } from "@/services/notifications.port.js";
import {
  type ProductInsert,
  products,
  orders,
  ordersToProducts,
} from "@/db/schema.js";
import { ProductType } from "@/utils/enums/product-type.js";
import { type Database } from "@/db/type.js";
import { buildFastify } from "@/fastify.js";

describe("ProductController Integration Tests", () => {
  let fastify: FastifyInstance;
  let database: Database;
  let notificationServiceMock: DeepMockProxy<INotificationService>;

  beforeEach(async () => {
    notificationServiceMock = mockDeep<INotificationService>();

    fastify = await buildFastify();
    fastify.diContainer.register({
      ns: asValue(notificationServiceMock as INotificationService),
    });
    await fastify.ready();
    database = fastify.database;
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("processes NORMAL product: decrements stock and no notification when available", async () => {
    const { orderId } = await seedOrder([
      {
        leadTime: 15,
        available: 2,
        type: ProductType.NORMAL,
        name: "USB Cable",
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "USB Cable"),
    });
    expect(persisted?.available).toBe(1);
    expect(
      notificationServiceMock.sendDelayNotification
    ).not.toHaveBeenCalled();
  });

  it("processes NORMAL product: sends delay when out of stock", async () => {
    const { orderId } = await seedOrder([
      {
        leadTime: 10,
        available: 0,
        type: ProductType.NORMAL,
        name: "USB Dongle",
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "USB Dongle"),
    });
    expect(persisted?.available).toBe(0);
    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      10,
      "USB Dongle"
    );
  });

  it("processes SEASONAL product: decrements stock when in season", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const { orderId } = await seedOrder([
      {
        leadTime: 15,
        available: 3,
        type: ProductType.SEASONAL,
        name: "Watermelon",
        seasonStartDate: new Date(now - 2 * DAY),
        seasonEndDate: new Date(now + 30 * DAY),
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Watermelon"),
    });
    expect(persisted?.available).toBe(2);
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).not.toHaveBeenCalledWith("Watermelon");
  });

  it("processes SEASONAL product: marks unavailable when before season", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const { orderId } = await seedOrder([
      {
        leadTime: 15,
        available: 5,
        type: ProductType.SEASONAL,
        name: "Grapes",
        seasonStartDate: new Date(now + 30 * DAY),
        seasonEndDate: new Date(now + 60 * DAY),
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Grapes"),
    });
    expect(persisted?.available).toBe(0);
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Grapes");
  });

  it("processes SEASONAL product: marks unavailable when lead time exceeds season end", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const { orderId } = await seedOrder([
      {
        leadTime: 15,
        available: 0,
        type: ProductType.SEASONAL,
        name: "Grapes",
        seasonStartDate: new Date(now - 2 * DAY),
        seasonEndDate: new Date(now + 5 * DAY),
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Grapes"),
    });
    expect(persisted?.available).toBe(0);
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Grapes");
  });

  it("processes SEASONAL product: sends delay when in season but out of stock", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const { orderId } = await seedOrder([
      {
        leadTime: 3,
        available: 0,
        type: ProductType.SEASONAL,
        name: "Watermelon",
        seasonStartDate: new Date(now - 2 * DAY),
        seasonEndDate: new Date(now + 30 * DAY),
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Watermelon"),
    });
    expect(persisted?.available).toBe(0);
    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      3,
      "Watermelon"
    );
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).not.toHaveBeenCalledWith("Watermelon");
  });

  it("processes EXPIRABLE product: decrements when not expired", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const { orderId } = await seedOrder([
      {
        leadTime: 15,
        available: 2,
        type: ProductType.EXPIRABLE,
        name: "Butter",
        expiryDate: new Date(now + 10 * DAY),
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Butter"),
    });
    expect(persisted?.available).toBe(1);
    expect(
      notificationServiceMock.sendExpirationNotification
    ).not.toHaveBeenCalled();
  });

  it("processes EXPIRABLE product: marks unavailable and notifies when expired", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const expiryDate = new Date(now - 2 * DAY);
    const { orderId } = await seedOrder([
      {
        leadTime: 90,
        available: 3,
        type: ProductType.EXPIRABLE,
        name: "Milk",
        expiryDate,
      },
    ]);

    await postProcess(orderId);

    const persisted = await database.query.products.findFirst({
      where: eq(products.name, "Milk"),
    });
    expect(persisted?.available).toBe(0);
    expect(
      notificationServiceMock.sendExpirationNotification
    ).toHaveBeenCalledWith("Milk", expiryDate);
  });

  async function seedOrder(productInserts: ProductInsert[]) {
    const orderId = await database.transaction(async (tx) => {
      const productList = await tx
        .insert(products)
        .values(productInserts)
        .returning({ productId: products.id });
      const [order] = await tx
        .insert(orders)
        .values([{}])
        .returning({ orderId: orders.id });
      await tx.insert(ordersToProducts).values(
        productList.map((p) => ({
          orderId: order!.orderId,
          productId: p.productId,
        }))
      );
      return order!.orderId;
    });
    return { orderId };
  }

  async function postProcess(orderId: number) {
    const client = supertest(fastify.server);
    const response = await client.post(`/orders/${orderId}/processOrder`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    const resultOrder = await database.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    expect(resultOrder?.id).toBe(orderId);
  }
});
