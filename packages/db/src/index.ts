import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not configured for @repo/db");
}

const adapter = new PrismaPg({
	connectionString: databaseUrl,
});

export const prismaClient = new PrismaClient({
	adapter,
	...(process.env.PRISMA_QUERY_LOG === "true"
		? { log: [{ emit: "event", level: "query" as const }] }
		: {}),
});

if (process.env.PRISMA_QUERY_LOG === "true") {
	prismaClient.$on("query", (event) => {
		console.info(JSON.stringify({ message: "prisma_query", query: event.query, durationMs: event.duration }));
	});
}
