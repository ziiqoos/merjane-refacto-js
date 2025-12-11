import { type Cradle, diContainer } from "@fastify/awilix";
import { asClass, asFunction, asValue, Resolver } from "awilix";
import { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { type INotificationService } from "@/services/notifications.port.js";
import { NotificationService } from "@/services/impl/notification.service.js";
import { type Database } from "@/db/type.js";
import { ProductService } from "@/services/impl/product.service.js";
import { SQLiteProductRepository } from "@/repositories/sqlite-product.repository.js";
import { type ProductRepositoryPort } from "@/repositories/product.repository.js";
import { NormalProductHandler } from "@/services/product-handlers/normal-product.handler.js";
import { SeasonalProductHandler } from "@/services/product-handlers/seasonal-product.handler.js";
import { ExpirableProductHandler } from "@/services/product-handlers/expirable-product.handler.js";
import { IProductHandler } from "@/services/product-handler.js";
import { PRODUCT_TYPES, ProductType } from "@/domain/product.js";

declare module "@fastify/awilix" {
  interface Cradle {
    // eslint-disable-line @typescript-eslint/consistent-type-definitions
    logger: FastifyBaseLogger;
    db: Database;
    ns: INotificationService;
    pr: ProductRepositoryPort;
    ps: ProductService;
    // product handlers
    normalHandler: IProductHandler;
    seasonalHandler: IProductHandler;
    expirableHandler: IProductHandler;
    // handlers map
    productHandlersByType: Map<ProductType, IProductHandler>;
  }
}

export async function configureDiContext(
  server: FastifyInstance
): Promise<void> {
  diContainer.register({
    logger: asValue(server.log),
  });
  diContainer.register({
    db: asValue(server.database),
  });
  diContainer.register({
    ns: asClass(NotificationService),
  });
  diContainer.register({
    pr: asClass(
      SQLiteProductRepository
    ) as unknown as Resolver<ProductRepositoryPort>,
  });

  diContainer.register(
    "normalHandler",
    asFunction(
      ({ ns, pr }: Pick<Cradle, "ns" | "pr">) =>
        new NormalProductHandler(ns, pr)
    ).singleton()
  );
  diContainer.register(
    "seasonalHandler",
    asFunction(
      ({ ns, pr }: Pick<Cradle, "ns" | "pr">) =>
        new SeasonalProductHandler(ns, pr)
    ).singleton()
  );
  diContainer.register(
    "expirableHandler",
    asFunction(
      ({ ns, pr }: Pick<Cradle, "ns" | "pr">) =>
        new ExpirableProductHandler(ns, pr)
    ).singleton()
  );

  diContainer.register(
    "productHandlersByType",
    asFunction(({ normalHandler, seasonalHandler, expirableHandler }) => {
      return new Map<ProductType, IProductHandler>([
        [PRODUCT_TYPES.NORMAL, normalHandler],
        [PRODUCT_TYPES.SEASONAL, seasonalHandler],
        [PRODUCT_TYPES.EXPIRABLE, expirableHandler],
      ]);
    }).singleton()
  );

  diContainer.register("ps", asClass(ProductService).singleton());
}

export function resolve<Service extends keyof Cradle>(
  service: Service
): Cradle[Service] {
  return diContainer.resolve(service);
}
