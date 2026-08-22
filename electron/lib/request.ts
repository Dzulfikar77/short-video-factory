import { net, ClientRequestConstructorOptions, IncomingMessage } from 'electron'

/**
 * HTTP request method type
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * Request configuration options
 */
export interface RequestOptions {
  /** Request URL */
  url: string
  /** HTTP method */
  method?: HttpMethod
  /** Request headers */
  headers?: Record<string, string>
  /** Request body data */
  body?: string | Buffer | object
  /** Timeout in milliseconds */
  timeout?: number
  /** Session instance */
  session?: Electron.Session
  /** Partition name */
  partition?: string
  /** Whether to use session cookies */
  useSessionCookies?: boolean
  /** Credentials mode */
  credentials?: 'omit' | 'include' | 'same-origin'
  /** Redirect behavior */
  redirect?: 'follow' | 'error' | 'manual'
}

/**
 * Response object
 */
export interface Response {
  /** HTTP status code */
  status: number
  /** HTTP status message */
  statusText: string
  /** Response headers */
  headers: Record<string, string[] | string>
  /** Response data */
  data: string
  /** Whether response is successful (2xx status code) */
  ok: boolean
  /** Get response data as JSON */
  json: <T = any>() => T
  /** Get response data as text */
  text: () => string
}

/**
 * Network request error
 */
export class RequestError extends Error {
  /** HTTP status code */
  public statusCode?: number
  /** Response object */
  public response?: Response

  constructor(message: string, statusCode?: number, response?: Response) {
    super(message)
    this.name = 'RequestError'
    this.statusCode = statusCode
    this.response = response
  }
}

/**
 * Normalize request options
 * @param options - Request options
 * @returns Normalized request options
 */
function normalizeOptions(
  options: string | RequestOptions,
): Required<
  Omit<
    RequestOptions,
    'body' | 'session' | 'partition' | 'useSessionCookies' | 'credentials' | 'redirect'
  >
> &
  Pick<
    RequestOptions,
    'body' | 'session' | 'partition' | 'useSessionCookies' | 'credentials' | 'redirect'
  > {
  const opts = typeof options === 'string' ? { url: options } : options

  return {
    method: 'GET',
    headers: {},
    timeout: 30000,
    ...opts,
  }
}

/**
 * Send HTTP/HTTPS request
 * @param options - Request options or URL string
 * @returns Promise<Response> Response object
 * @example
 * // Basic usage
 * const response = await request('https://api.example.com/data');
 * const data = response.json();
 *
 * // POST request
 * const response = await request({
 *   url: 'https://api.example.com/users',
 *   method: 'POST',
 *   body: { name: 'John', email: 'john@example.com' },
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * // Request with timeout
 * const response = await request({
 *   url: 'https://api.example.com/data',
 *   timeout: 5000
 * });
 */
async function request(options: string | RequestOptions): Promise<Response> {
  const config = normalizeOptions(options)

  return new Promise((resolve, reject) => {
    try {
      const req = net.request(config as ClientRequestConstructorOptions)

      // Set request headers
      if (config.headers) {
        Object.keys(config.headers).forEach((key) => {
          req.setHeader(key, config.headers![key])
        })
      }

      // Timeout handling
      let timeoutId: NodeJS.Timeout | null = null
      if (config.timeout && config.timeout > 0) {
        timeoutId = setTimeout(() => {
          req.abort()
          reject(new RequestError('Request timeout'))
        }, config.timeout)
      }

      // Handle response
      req.on('response', (response: IncomingMessage) => {
        // Clear timeout timer
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        let data = ''

        response.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })

        response.on('end', () => {
          const result: Response = {
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: response.headers,
            data,
            ok: response.statusCode >= 200 && response.statusCode < 300,
            json: <T = any>(): T => {
              try {
                return JSON.parse(data) as T
              } catch (e) {
                throw new RequestError(
                  'Response body is not valid JSON',
                  response.statusCode,
                  result,
                )
              }
            },
            text: () => data,
          }

          if (result.ok) {
            resolve(result)
          } else {
            const error = new RequestError(
              `HTTP ${response.statusCode}: ${response.statusMessage || 'Unknown Error'}`,
              response.statusCode,
              result,
            )
            reject(error)
          }
        })
      })

      // Error handling
      req.on('error', (error: Error) => {
        // Clear timeout timer
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        reject(new RequestError(`Network error: ${error.message}`))
      })

      // Send request body
      if (config.body) {
        if (typeof config.body === 'object' && !(config.body instanceof Buffer)) {
          if (!config.headers || !config.headers['Content-Type']) {
            req.setHeader('Content-Type', 'application/json')
          }
          req.write(JSON.stringify(config.body))
        } else {
          req.write(config.body as string | Buffer)
        }
      }

      req.end()
    } catch (error) {
      reject(new RequestError(`Request setup failed: ${(error as Error).message}`))
    }
  })
}

/**
 * Send GET request
 * @param url - Request URL
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.get('https://api.example.com/users');
 * const users = response.json();
 */
request.get = async (
  url: string,
  options: Omit<RequestOptions, 'url' | 'method' | 'body'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'GET',
    ...options,
  })
}

/**
 * Send POST request
 * @param url - Request URL
 * @param body - Request body data
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.post('https://api.example.com/users', {
 *   name: 'John',
 *   email: 'john@example.com'
 * });
 * const newUser = response.json();
 */
request.post = async (
  url: string,
  body?: any,
  options: Omit<RequestOptions, 'url' | 'method'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'POST',
    body,
    ...options,
  })
}

/**
 * Send PUT request
 * @param url - Request URL
 * @param body - Request body data
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.put('https://api.example.com/users/1', {
 *   name: 'John Updated',
 *   email: 'john.updated@example.com'
 * });
 * const updatedUser = response.json();
 */
request.put = async (
  url: string,
  body?: any,
  options: Omit<RequestOptions, 'url' | 'method'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'PUT',
    body,
    ...options,
  })
}

/**
 * Send DELETE request
 * @param url - Request URL
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.delete('https://api.example.com/users/1');
 * if (response.ok) {
 *   console.log('User deleted successfully');
 * }
 */
request.delete = async (
  url: string,
  options: Omit<RequestOptions, 'url' | 'method'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'DELETE',
    ...options,
  })
}

/**
 * Send PATCH request
 * @param url - Request URL
 * @param body - Request body data
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.patch('https://api.example.com/users/1', {
 *   name: 'John Partially Updated'
 * });
 * const updatedUser = response.json();
 */
request.patch = async (
  url: string,
  body?: any,
  options: Omit<RequestOptions, 'url' | 'method'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'PATCH',
    body,
    ...options,
  })
}

/**
 * Send HEAD request
 * @param url - Request URL
 * @param options - Additional request options
 * @returns Promise<Response> Response object
 * @example
 * const response = await request.head('https://api.example.com/users');
 * console.log('Headers:', response.headers);
 */
request.head = async (
  url: string,
  options: Omit<RequestOptions, 'url' | 'method' | 'body'> = {},
): Promise<Response> => {
  return request({
    url,
    method: 'HEAD',
    ...options,
  })
}

export default request
