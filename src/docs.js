const swaggerUi = require('swagger-ui-express')

const swaggerDocs = require('./swagger.json')

module.exports = function(docsPath, app) {
  // TODO
  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(swaggerDocs))
}