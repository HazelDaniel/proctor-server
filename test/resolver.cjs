const fs = require('fs');
const path = require('path');

module.exports = (request, options) => {
  const { defaultResolver } = options;

  // If request is already an absolute path (from moduleNameMapper), return it if it exists
  if (path.isAbsolute(request) && fs.existsSync(request)) {
    return request;
  }

  try {
    return defaultResolver(request, options);
  } catch (e) {
    // Only handle local imports that fail resolution
    if (
      (request.startsWith('./') || request.startsWith('../')) &&
      request.endsWith('.js') &&
      !options.basedir.includes('node_modules')
    ) {
      try {
        // Try resolving as .ts
        const tsRequest = request.replace(/\.js$/, '.ts');
        // Resolve relative to basedir for file existence check, or better, let defaultResolver try
        return defaultResolver(tsRequest, options);
      } catch (e2) {
        // ignore and throw original error
      }
    }
    throw e;
  }
};
