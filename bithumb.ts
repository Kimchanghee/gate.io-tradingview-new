import crypto from 'node:crypto';

const DEFAULT_BASE_URL = 'https://api.bithumb.com';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type Primitive = string | number | boolean | bigint | null | undefined;

type QueryValue = Primitive | Primitive[];

export interface BithumbClientConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  subAccountId?: string;
  defaultHeaders?: Record<string, string>;
}

export interface PrivateRequestOptions {
  method: HttpMethod;
  path: string;
  params?: Record<string, QueryValue>;
  body?: Record<string, unknown> | undefined;
}

export interface PublicRequestOptions {
  method?: HttpMethod;
  path: string;
  params?: Record<string, QueryValue>;
}

export interface SignedRequest {
  url: string;
  init: RequestInit;
  timestamp: string;
  signature: string;
  hash: string;
}

export interface BithumbResponse<T> {
  status: string;
  data: T;
  [key: string]: unknown;
}

export class BithumbClientError<T = unknown> extends Error {
  public readonly status: number;
  public readonly payload: T | undefined;

  constructor(message: string, status: number, payload?: T) {
    super(message);
    this.name = 'BithumbClientError';
    this.status = status;
    this.payload = payload;
  }
}

const serializeQuery = (params: Record<string, QueryValue> | undefined): string => {
  if (!params || !Object.keys(params).length) {
    return '';
  }

  const pieces: string[] = [];
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null);

  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        pieces.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
      continue;
    }
    pieces.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return pieces.join('&');
};

const normalisePath = (path: string): string => {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
};

const hashBody = (body: string): string => {
  return crypto.createHash('sha512').update(body).digest('hex');
};

const createSignaturePayload = (
  method: HttpMethod,
  path: string,
  timestamp: string,
  queryString: string,
  bodyHash: string,
): string => {
  const upperMethod = method.toUpperCase();
  const canonicalQuery = queryString ?? '';
  const canonicalBodyHash = bodyHash ?? '';
  return `${upperMethod} ${path}\n${timestamp}\n${canonicalQuery}\n${canonicalBodyHash}`;
};

const createSignature = (secret: string, payload: string): string => {
  return crypto.createHmac('sha512', secret).update(payload).digest('base64');
};

export class BithumbClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly subAccountId?: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: BithumbClientConfig) {
    if (!config.apiKey) {
      throw new Error('BithumbClient requires an apiKey');
    }
    if (!config.apiSecret) {
      throw new Error('BithumbClient requires an apiSecret');
    }

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.subAccountId = config.subAccountId;
    this.defaultHeaders = { 'Api-Content-Type': 'application/json', ...(config.defaultHeaders ?? {}) };
  }

  public createSignedRequest(options: PrivateRequestOptions): SignedRequest {
    const method = options.method.toUpperCase() as HttpMethod;
    const path = normalisePath(options.path);
    const timestamp = Date.now().toString();
    const queryString = serializeQuery(options.params);
    const bodyString = options.body ? JSON.stringify(options.body) : '';
    const bodyHash = hashBody(bodyString);
    const payload = createSignaturePayload(method, path, timestamp, queryString, bodyHash);
    const signature = createSignature(this.apiSecret, payload);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      'Api-Key': this.apiKey,
      'Api-Timestamp': timestamp,
      'Api-Signature': signature,
      'Api-Hash': bodyHash,
    };

    if (this.subAccountId) {
      headers['Api-Subaccount-Id'] = this.subAccountId;
    }

    const url = `${this.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
    const init: RequestInit = { method, headers };

    if (method !== 'GET' && bodyString) {
      init.body = bodyString;
    }

    return { url, init, timestamp, signature, hash: bodyHash };
  }

  public async privateRequest<T = unknown>(options: PrivateRequestOptions): Promise<T> {
    const signed = this.createSignedRequest(options);
    const response = await fetch(signed.url, signed.init);
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new BithumbClientError(
        `Bithumb private request failed with status ${response.status}`,
        response.status,
        payload as unknown,
      );
    }

    return payload as T;
  }

  public async publicRequest<T = unknown>(options: PublicRequestOptions): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase() as HttpMethod;
    const path = normalisePath(options.path);
    const queryString = serializeQuery(options.params);
    const url = `${this.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, { method });
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new BithumbClientError(
        `Bithumb public request failed with status ${response.status}`,
        response.status,
        payload as unknown,
      );
    }

    return payload as T;
  }
}

