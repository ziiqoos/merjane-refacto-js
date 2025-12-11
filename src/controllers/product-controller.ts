/* eslint-disable @typescript-eslint/switch-exhaustiveness-check */
/* eslint-disable max-depth */
/* eslint-disable no-await-in-loop */
import fastifyPlugin from "fastify-plugin";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

export const ProductController = fastifyPlugin(async (server) => {
  // Add schema validator and serializer
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  server.withTypeProvider<ZodTypeProvider>().post(
    "/orders/:orderId/processOrder",
    {
      schema: {
        params: z.object({
          orderId: z.coerce.number(),
        }),
      },
    },
    async (request, reply) => {
      const ps = server.diContainer.resolve("ps");
      const orderId = await ps.processOrder(request.params.orderId);
      if (!orderId) {
        return reply.status(404).send({ message: "Order not found" });
      }

      await reply.send({ orderId });
    }
  );
});
