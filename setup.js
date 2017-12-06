// Module to require before running any code

require('source-map-support').install();
require('dotenv').config();

process.on('unhandledRejection', (err) => {
  console.error(err); // eslint-disable-line no-console
});
