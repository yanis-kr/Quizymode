import { AxiosError, AxiosHeaders } from "axios";

/** A refused request as axios reports it: a ProblemDetails body behind the generic status message. */
export const refusal = (detail: string, status = 429, title = "RateLimit") =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { title, detail, status },
  });
