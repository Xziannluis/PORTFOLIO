import { handler as adminApiHandler } from "./admin-api.mjs";

export const handler = (event) =>
  adminApiHandler({
    ...event,
    queryStringParameters: {
      ...event.queryStringParameters,
      endpoint: "login",
    },
  });
