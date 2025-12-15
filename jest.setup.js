// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// Polyfill setImmediate for Jest environment (required by Prisma)
if (typeof global.setImmediate === "undefined") {
  global.setImmediate = (callback, ...args) => {
    return setTimeout(callback, 0, ...args);
  };
}

// Polyfill TextEncoder/TextDecoder
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill ReadableStream and other Web Streams API
if (typeof global.ReadableStream === "undefined") {
  const {
    ReadableStream,
    WritableStream,
    TransformStream,
  } = require("stream/web");
  global.ReadableStream = ReadableStream;
  global.WritableStream = WritableStream;
  global.TransformStream = TransformStream;
}

// Polyfill Web APIs for Next.js API route testing
if (typeof global.Request === "undefined") {
  const { Request, Response, Headers, fetch } = require("undici");
  global.Request = Request;
  global.Response = Response;
  global.Headers = Headers;
  if (typeof global.fetch === "undefined") {
    global.fetch = fetch;
  }
}
