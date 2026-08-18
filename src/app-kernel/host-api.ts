export interface AppHostContext {
  projectRoot: URL;
  dataDir: URL;
}

export type AppHostHandler = (request: Request, context: AppHostContext) => Response | Promise<Response>;

export interface AppHostModule {
  handleAppRequest?: AppHostHandler;
  onStart?: (context: AppHostContext) => void | Promise<void>;
  onStop?: (context: AppHostContext) => void | Promise<void>;
}
