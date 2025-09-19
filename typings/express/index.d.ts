interface ExpressRequest {
  [key: string]: any;
}

interface ExpressResponse {
  status: (code: number) => ExpressResponse;
  json: (body: any) => ExpressResponse;
  send: (body: any) => ExpressResponse;
  sendFile: (...args: any[]) => void;
}

interface ExpressNextFunction {
  (err?: any): void;
}

interface ExpressApp {
  use: (...args: any[]) => ExpressApp;
  get: (...args: any[]) => ExpressApp;
  post: (...args: any[]) => ExpressApp;
  put: (...args: any[]) => ExpressApp;
  patch: (...args: any[]) => ExpressApp;
  delete: (...args: any[]) => ExpressApp;
  listen: (...args: any[]) => any;
}

interface ExpressStatic {
  (path: string): any;
}

declare function express(): ExpressApp;

declare namespace express {
  function json(options?: any): any;
  function static(root: string): ExpressStatic;
}

export = express;
