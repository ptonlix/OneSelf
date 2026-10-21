declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export default class Provider {
    constructor(issuer: string, configuration: Record<string, unknown>);
    callback(): (req: IncomingMessage, res: ServerResponse) => void;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
