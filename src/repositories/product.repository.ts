import { type Product } from "@/domain/product.js";

export interface ProductRepositoryPort {
	findOrderWithProducts(orderId: number): Promise<{
		id: number;
		products: Array<{ product: Product }>;
	} | null | undefined>;

	persistProduct(product: Product): Promise<void>;
}
