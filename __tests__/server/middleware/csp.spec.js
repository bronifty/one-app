/*
* Copyright 2019 American Express Travel Related Services Company, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
* or implied. See the License for the specific language governing
* permissions and limitations under the License.
*/
/* eslint-disable global-require */

import httpMocks from 'node-mocks-http';

const sanitizeCspString = (cspString) => cspString
// replaces dynamic ip to prevent snapshot failures
  // eslint-disable-next-line unicorn/better-regex -- conflicts with unsafe-regex
  .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '0.0.0.0');

describe('csp', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});

  function requireCSP() {
    return require('../../../src/server/middleware/csp');
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.ONE_DANGEROUSLY_DISABLE_CSP = 'false';
  });

  describe('middleware', () => {
    const req = () => 0;
    let res;
    const next = jest.fn();

    beforeEach(() => {
      res = httpMocks.createResponse();
      next.mockClear();
    });

    it('uses the same csp enforcement in development as production to reduce surprises', () => {
      process.env.NODE_ENV = 'development';
      const cspMiddleware = requireCSP().default;
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).toHaveProperty('content-security-policy');
      expect(headers).not.toHaveProperty('content-security-policy-report-only');
    });

    it('sets a csp header in development', () => {
      process.env.NODE_ENV = 'development';
      const cspMiddleware = requireCSP().default;
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).toHaveProperty('content-security-policy');
      expect(headers).not.toHaveProperty('content-security-policy-report-only');
    });

    it('does not set csp header if ONE_DANGEROUSLY_DISABLE_CSP is present', () => {
      process.env.ONE_DANGEROUSLY_DISABLE_CSP = 'true';
      const cspMiddleware = requireCSP().default;
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).not.toHaveProperty('Content-Security-Policy');
    });

    it('defaults to production csp', () => {
      delete process.env.NODE_ENV;
      const cspMiddleware = requireCSP().default;
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).toHaveProperty('content-security-policy');
      expect(headers).not.toHaveProperty('content-security-policy-report-only');
    });

    it('adds ip and localhost to csp in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.HTTP_ONE_APP_DEV_CDN_PORT = 5000;
      process.env.HTTP_ONE_APP_DEV_PROXY_SERVER_PORT = 3001;
      const requiredCsp = requireCSP();
      const cspMiddleware = requiredCsp.default;
      const { updateCSP } = requiredCsp;
      updateCSP("default-src 'none'; script-src 'self'; connect-src 'self';");
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).toHaveProperty('content-security-policy');
      const cspString = headers['content-security-policy'];
      expect(sanitizeCspString(cspString)).toMatchSnapshot();
    });

    it('does not add ip and localhost to csp in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.HTTP_ONE_APP_DEV_CDN_PORT;
      delete process.env.HTTP_ONE_APP_DEV_PROXY_SERVER_PORT;
      const requiredCsp = requireCSP();
      const cspMiddleware = requiredCsp.default;
      const { updateCSP } = requiredCsp;
      updateCSP("default-src 'none'; script-src 'self'; connect-src 'self';");
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      expect(headers).toHaveProperty('content-security-policy');
      const cspString = headers['content-security-policy'];
      // eslint-disable-next-line unicorn/better-regex
      const ipFound = cspString.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
      expect(ipFound).toBeNull();
      const localhostFound = cspString.match(/localhost/);
      expect(localhostFound).toBeNull();
    });

    it('sets script nonce', () => {
      const requiredCsp = requireCSP();
      const cspMiddleware = requiredCsp.default;
      const { updateCSP } = requiredCsp;
      updateCSP("default-src 'none'; script-src 'self';");
      cspMiddleware()(req, res, next);
      // eslint-disable-next-line no-underscore-dangle
      const headers = res._getHeaders();
      const { scriptNonce } = res;
      expect(headers).toHaveProperty('content-security-policy');
      expect(headers['content-security-policy'].includes(scriptNonce)).toBe(true);
    });

    it('does not set the script nonce if this has been disabled in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.ONE_CSP_ALLOW_INLINE_SCRIPTS = 'true';

      const requiredCsp = requireCSP();
      const cspMiddleware = requiredCsp.default;
      const { updateCSP } = requiredCsp;
      updateCSP("default-src 'none'; script-src 'self';");
      cspMiddleware()(req, res, next);
      expect(res.scriptNonce).toBeUndefined();
    });
  });

  describe('policy', () => {
    it('should be a constant string and not function so it cannot be regenerated per request', () => {
      const { cspCache: { policy } } = requireCSP();
      expect(policy).toEqual(expect.any(String));
    });
  });

  describe('updateCSP', () => {
    it('should accept an empty string', () => {
      const { updateCSP, getCSP } = requireCSP();
      updateCSP('');
      expect(getCSP()).toEqual({});
    });

    it('updates cspCache with given csp', () => {
      const { updateCSP, cspCache } = requireCSP();
      const originalPolicy = cspCache.policy;
      updateCSP("default-src 'self';");
      const { policy } = require('../../../src/server/middleware/csp').cspCache;

      expect(console.error).not.toHaveBeenCalled();
      expect(policy).not.toEqual(originalPolicy);
      expect(policy).toMatchSnapshot();
    });
  });

  describe('getCSP', () => {
    it('returns parsed CSP', () => {
      const { updateCSP, getCSP } = requireCSP();
      updateCSP("default-src 'none' 'self'; block-all-mixed-content");
      expect(getCSP()).toEqual({
        'default-src': ["'none'", "'self'"],
        'block-all-mixed-content': true,
      });
    });
  });
});
