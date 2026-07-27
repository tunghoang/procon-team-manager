const swaggerUi = require("swagger-ui-express");

const swaggerDocs = require("./swagger.json");

/**
 * Swagger UI, working from BOTH the direct port and behind nginx's prefix.
 *
 * swagger.json declares `basePath: "/api"`, which is right when the manager is
 * reached directly (localhost:8000/docs -> /api/question). It is wrong through
 * the public domain: nginx serves the manager under /manager/* and strips that
 * prefix before forwarding, so Express never learns about it -- and "Try it
 * out" would call https://host/api/question, which nginx routes to the HEXUDON
 * GAME SERVICE instead. That fails as a confusing 404 from the wrong backend
 * rather than an obvious error.
 *
 * The browser is the only party that knows the real prefix, so recover it there
 * from the docs URL itself and put it back on each request:
 *
 *   /docs/           -> prefix ""         -> /api/question           (direct)
 *   /manager/docs/   -> prefix "/manager" -> /manager/api/question   (nginx)
 *
 * requestInterceptor is serialized into swagger-ui-init.js and runs in the
 * page, so it must be self-contained -- no closures over anything here.
 */
const OPTIONS = {
  swaggerOptions: {
    requestInterceptor: (req) => {
      const match = window.location.pathname.match(/^(.*?)\/docs(?:\/|$)/);
      const prefix = match && match[1] ? match[1] : "";
      if (!prefix) return req;
      try {
        const url = new URL(req.url, window.location.origin);
        if (
          url.origin === window.location.origin &&
          !url.pathname.startsWith(prefix + "/")
        ) {
          url.pathname = prefix + url.pathname;
          req.url = url.toString();
        }
      } catch (e) {
        // A malformed URL must not swallow the request -- let it through
        // unchanged and let the network layer report the real failure.
      }
      return req;
    },
  },
};

module.exports = function (docsPath, app) {
  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(swaggerDocs, OPTIONS));
};
