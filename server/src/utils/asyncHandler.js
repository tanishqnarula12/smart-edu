/**
 * Wrap an async route handler so a rejected promise reaches Express's error
 * middleware instead of becoming an unhandled rejection.
 *
 *   router.get('/', asyncHandler(async (req, res) => { … }))
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export default asyncHandler;
