import { openapi } from "@/app/lib/api/openapi";

export const dynamic = "force-dynamic";

export const GET = () => Response.json(openapi);
