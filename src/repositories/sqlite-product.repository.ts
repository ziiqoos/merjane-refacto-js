import { type Cradle } from "@fastify/awilix";
import { eq } from "drizzle-orm";
import {
  orders,
  products,
  type Product as DbProduct,
  type ProductInsert as DbProductInsert,
} from "@/db/schema.js";
import { type Database } from "@/db/type.js";
import { type ProductRepositoryPort } from "./product.repository.js";
import { type Product } from "@/domain/product.js";

export class SQLiteProductRepository implements ProductRepositoryPort {
  private readonly db: Database;

  public constructor({ db }: Pick<Cradle, "db">) {
    this.db = db;
  }

  public async findOrderWithProducts(orderId: number) {
    const order = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        products: {
          columns: {},
          with: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    return {
      id: order.id,
      products: order.products.map(({ product }) => ({
        product: this.toDomain(product),
      })),
    };
  }

  public async persistProduct(product: Product) {
    await this.db
      .update(products)
      .set(this.toPersistence(product))
      .where(eq(products.id, product.id));
  }

  private toDomain(row: DbProduct): Product {
    return {
      id: row.id,
      leadTime: row.leadTime,
      available: row.available,
      type: row.type as Product["type"],
      name: row.name,
      expiryDate: row.expiryDate,
      seasonStartDate: row.seasonStartDate,
      seasonEndDate: row.seasonEndDate,
    };
  }

  private toPersistence(product: Product): DbProductInsert {
    return {
      id: product.id,
      leadTime: product.leadTime,
      available: product.available,
      type: product.type,
      name: product.name,
      expiryDate: product.expiryDate,
      seasonStartDate: product.seasonStartDate,
      seasonEndDate: product.seasonEndDate,
    };
  }
}
