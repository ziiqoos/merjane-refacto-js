export const PRODUCT_TYPES = {
	NORMAL: 'NORMAL',
	SEASONAL: 'SEASONAL',
	EXPIRABLE: 'EXPIRABLE',
} as const;

export type ProductType = typeof PRODUCT_TYPES[keyof typeof PRODUCT_TYPES];

export type Product = {
	id: number;
	leadTime: number;
	available: number;
	type: ProductType;
	name: string;
	expiryDate: Date | null;
	seasonStartDate: Date | null;
	seasonEndDate: Date | null;
};
