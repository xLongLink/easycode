import { describe, expect, test } from "bun:test"
import { HttpBody, HttpClientRequest } from "effect/http"
import { redactedErrorRequest } from "../src/http/recorder"
import { make, redactHeaders, redactUrl } from "../src/redaction/redactor"
import { secretFindings } from "../src/redaction/secrets"

describe("redaction", () => {
  test("applies built-in redaction before callbacks in request and response order", () => {
    const calls: string[] = []
    const redactor = make({
      headers: ["x-secret"],
      allowResponseHeaders: ["x-visible"],
      url: (url) => {
        calls.push(url)
        return url.replace("/path", "/custom")
      },
      body: (body) => {
        calls.push(body)
        return `custom:${body}`
      },
    })
    const request = {
      method: "POST",
      url: "https://example.test/path?token=secret",
      headers: { "content-type": "application/json", "x-secret": "secret", ignored: "value" },
      body: '{"password":"secret","safe":true}',
    }
    expect(redactor.request(request)).toEqual({
      ...request,
      url: "https://example.test/custom?token=%5BREDACTED%5D",
      headers: { "content-type": "application/json", "x-secret": "[REDACTED]" },
      body: 'custom:{"password":"[REDACTED]","safe":true}',
    })
    expect(
      redactor.response({
        status: 200,
        headers: { "x-secret": "secret", "x-visible": "visible", ignored: "value" },
        body: '{"token":"secret"}',
      }),
    ).toEqual({
      status: 200,
      headers: { "x-secret": "[REDACTED]", "x-visible": "visible" },
      body: 'custom:{"token":"[REDACTED]"}',
    })
    expect(calls).toEqual([
      "https://example.test/path?token=%5BREDACTED%5D",
      '{"password":"[REDACTED]","safe":true}',
      '{"token":"[REDACTED]"}',
    ])
    expect(request.body).toBe('{"password":"secret","safe":true}')
    expect(request.headers["x-secret"]).toBe("secret")
  })

  test("propagates URL callback failure without running body redaction", () => {
    const error = new Error("URL transform failed")
    const calls: string[] = []
    const redactor = make({
      url: () => {
        throw error
      },
      body: (body) => {
        calls.push(body)
        return body
      },
    })
    expect(() => redactor.request({ method: "GET", url: "https://example.test", headers: {}, body: "" })).toThrow(error)
    expect(calls).toEqual([])
  })

  test.each(["request", "response"] as const)("propagates %s body callback failure", (kind) => {
    const error = new Error("Body transform failed")
    const redactor = make({
      body: () => {
        throw error
      },
    })
    expect(() =>
      kind === "request"
        ? redactor.request({ method: "POST", url: "https://example.test", headers: {}, body: "" })
        : redactor.response({ status: 200, headers: {}, body: "" }),
    ).toThrow(error)
  })

  test("redacts sensitive URL query parameters", () => {
    expect(
      redactUrl(
        "https://example.test/path?key=secret-google-key&api_key=secret-openai-key&safe=value&X-Amz-Signature=secret-signature",
      ),
    ).toBe(
      "https://example.test/path?key=%5BREDACTED%5D&api_key=%5BREDACTED%5D&safe=value&X-Amz-Signature=%5BREDACTED%5D",
    )
  })

  test("redacts URL credentials", () => {
    expect(redactUrl("https://user:password@example.test/path?safe=value")).toBe(
      "https://%5BREDACTED%5D:%5BREDACTED%5D@example.test/path?safe=value",
    )
  })

  test("applies custom URL redaction after built-in redaction", () => {
    expect(
      redactUrl("https://example.test/accounts/real-account/path?key=secret-key", undefined, (url) =>
        url.replace("/accounts/real-account/", "/accounts/{account}/"),
      ),
    ).toBe("https://example.test/accounts/{account}/path?key=%5BREDACTED%5D")
  })

  test("redacts sensitive headers when allow-listed", () => {
    expect(
      redactHeaders(
        {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
          "x-custom-token": "custom-secret",
          "x-api-key": "secret-key",
          "x-goog-api-key": "secret-google-key",
        },
        ["authorization", "content-type", "x-api-key", "x-goog-api-key", "x-custom-token"],
        ["x-custom-token"],
      ),
    ).toEqual({
      authorization: "[REDACTED]",
      "content-type": "application/json",
      "x-api-key": "[REDACTED]",
      "x-custom-token": "[REDACTED]",
      "x-goog-api-key": "[REDACTED]",
    })
  })

  test("redacts error requests without retaining headers, params, or body", () => {
    const request = HttpClientRequest.post("https://example.test/path", {
      headers: { authorization: "Bearer super-secret" },
      body: HttpBody.text("super-secret-body", "text/plain"),
    }).pipe(HttpClientRequest.setUrlParam("api_key", "super-secret-key"))

    expect(redactedErrorRequest(request).toJSON()).toMatchObject({
      url: "https://example.test/path",
      urlParams: { params: [] },
      headers: {},
      body: { _tag: "Empty" },
    })
  })

  test("detects secret-looking values without returning the secret", () => {
    expect(
      secretFindings({
        version: 1,
        interactions: [
          {
            transport: "http",
            request: {
              method: "POST",
              url: "https://example.test/path?key=sk-123456789012345678901234",
              headers: {},
              body: JSON.stringify({
                nested: "AIzaSyDHibiBRvJZLsFnPYPoiTwxY4ztQ55yqCE",
              }),
            },
            response: {
              status: 200,
              headers: {},
              body: "Bearer abcdefghijklmnopqrstuvwxyz",
            },
          },
        ],
      }),
    ).toEqual([
      { path: "interactions[0].request.url", reason: "API key" },
      { path: "interactions[0].request.body", reason: "Google API key" },
      { path: "interactions[0].response.body", reason: "bearer token" },
    ])
  })

  test("detects secret-looking values inside metadata", () => {
    expect(
      secretFindings({
        version: 1,
        metadata: { token: "sk-123456789012345678901234" },
        interactions: [],
      }),
    ).toEqual([{ path: "metadata.token", reason: "API key" }])
  })

  test("redacts configured and common sensitive JSON fields", () => {
    const redactor = make({
      jsonFields: ["account_id"],
    })
    const request = redactor.request({
      method: "POST",
      url: "https://example.test/path",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "secret-password",
        accessToken: "access-token",
        nested: { account_id: "account-123", safe: "visible" },
      }),
    })

    expect(JSON.parse(request.body)).toEqual({
      password: "[REDACTED]",
      accessToken: "[REDACTED]",
      nested: { account_id: "[REDACTED]", safe: "visible" },
    })
  })

  test("preserves JSON text when no fields are redacted", () => {
    const body = '{\n  "id": 9007199254740993,\n  "safe": true\n}'

    expect(
      make().request({
        method: "POST",
        url: "https://example.test/path",
        headers: { "content-type": "application/json" },
        body,
      }).body,
    ).toBe(body)
  })

  test("extends default header redaction and allow lists", () => {
    const redactor = make({
      headers: ["x-custom-token"],
      allowRequestHeaders: ["anthropic-version", "x-custom-token"],
    })

    expect(
      redactor.request({
        method: "GET",
        url: "https://example.test/path",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-custom-token": "secret",
        },
        body: "",
      }).headers,
    ).toEqual({
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-custom-token": "[REDACTED]",
    })
  })
})
